package handler

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"blog/model"
	"blog/pkg/quote"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
)

// AssetHandler 处理投资资产的 CRUD 与手动改价。
// quotes 用于自动跟踪资产（yahoo/computed_gold_cny/fund_cn）创建后的历史回填；
// redis 用于改价后失效行情缓存。
type AssetHandler struct {
	db     *sqlx.DB
	quotes *quote.Service
	redis  *redis.Client
}

// NewAssetHandler 构造 AssetHandler（qs 与 InvestHandler 共享同一实例）。
func NewAssetHandler(db *sqlx.DB, qs *quote.Service, rdb *redis.Client) *AssetHandler {
	return &AssetHandler{db: db, quotes: qs, redis: rdb}
}

// List 返回全部资产，按自定义拖拽序（sort_order）升序，同序回退创建时间。
func (h *AssetHandler) List(c *gin.Context) {
	assets := []model.Asset{}
	if err := h.db.SelectContext(c.Request.Context(), &assets,
		"SELECT * FROM assets ORDER BY sort_order, created_at"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"assets": assets})
}

// Create 新建资产。type/price_source/currency 走白名单校验；
// price_source=computed_gold_cny 强制 symbol=GOLD_CNY_G/currency=CNY/type=metal；
// price_source=fund_cn 要求 symbol 为纯 6 位数字并强制 currency=CNY/type=fund；
// 重复 symbol → 409；自动跟踪源（yahoo/computed_gold_cny/fund_cn）创建后异步回填 365 天历史。
func (h *AssetHandler) Create(c *gin.Context) {
	var req struct {
		Symbol      string `json:"symbol" binding:"required"`
		Name        string `json:"name" binding:"required"`
		Type        string `json:"type" binding:"required,oneof=stock etf metal fund other"`
		PriceSource string `json:"price_source" binding:"required,oneof=yahoo computed_gold_cny manual fund_cn"`
		Currency    string `json:"currency" binding:"required,oneof=USD CNY"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// symbol 先 TrimSpace+ToUpper 归一（6 位数字基金码无大小写，ToUpper 对其为恒等变换，
	// 故下方 fund_cn 校验放在归一之后不影响契约）。
	symbol := strings.ToUpper(strings.TrimSpace(req.Symbol))
	assetType := req.Type
	currency := req.Currency
	switch req.PriceSource {
	case "computed_gold_cny":
		// 积存金为虚拟资产，忽略入参强制三要素
		symbol = quote.GoldSymbol
		currency = "CNY"
		assetType = "metal"
	case "fund_cn":
		// 中国场外基金：symbol 必须匹配 FundCNProvider 的契约（纯 6 位数字），
		// 否则净值源只会返回 ErrUnsupported、资产永远无价；计价与类型同样强制，
		// 避免前端漏传/错传导致 CNY 净值被当成 USD 折算。
		if !quote.IsFundCNSymbol(symbol) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "中国基金代码为 6 位数字，如 110022"})
			return
		}
		currency = "CNY"
		assetType = "fund"
	}

	// 新资产排在末尾：sort_order = 现有最大值 + 1（恒 > 0，永不被迁移的归一 UPDATE 误触）。
	// 单用户本地部署无并发压力，先查后插即可（无需事务/唯一约束）。
	var nextSort int
	if err := h.db.GetContext(c.Request.Context(), &nextSort,
		"SELECT COALESCE(MAX(sort_order),0)+1 FROM assets"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	res, err := h.db.ExecContext(c.Request.Context(),
		"INSERT INTO assets (symbol, name, type, price_source, currency, sort_order) VALUES (?,?,?,?,?,?)",
		symbol, req.Name, assetType, req.PriceSource, currency, nextSort)
	if err != nil {
		var me *mysql.MySQLError
		if errors.As(err, &me) && me.Number == 1062 {
			c.JSON(http.StatusConflict, gin.H{"error": "asset already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	id, _ := res.LastInsertId()

	switch req.PriceSource {
	case "yahoo", "computed_gold_cny", "fund_cn":
		// 回填是 best-effort 后台任务，用 WithoutCancel 脱离请求生命周期。
		// ctx 必须在请求 goroutine 内 eager 求值：Gin 会把 *gin.Context 归还 sync.Pool
		// 并被下个请求复用，若在后台 goroutine 内 lazy 读 c.Request 将构成数据竞争 +
		// use-after-recycle（Go 内存模型 UB）。闭包只捕获 ctx/symbol/h，不再引用 c。
		// 裸 goroutine 不经 Gin Recovery 覆盖，provider 走外部 HTTP+JSON 解析，
		// 一旦 panic 会拖垮整个进程（爆炸半径含博客主站），故自旋 recover 兜底。
		ctx := context.WithoutCancel(c.Request.Context())
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("asset: backfill panic for %s: %v", symbol, r)
				}
			}()
			h.quotes.BackfillHistory(ctx, symbol, 365)
		}()
	}

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// Update 仅更新资产名称；0 行受影响 → 404。
func (h *AssetHandler) Update(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := h.db.ExecContext(c.Request.Context(),
		"UPDATE assets SET name=? WHERE id=?", req.Name, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "asset updated"})
}

// Delete 删除资产：有交易记录 → 400；成功后连带删除该 symbol 的 price_history。
func (h *AssetHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ctx := c.Request.Context()

	var symbol string
	err = h.db.GetContext(ctx, &symbol, "SELECT symbol FROM assets WHERE id=?", id)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var tradeCount int
	if err := h.db.GetContext(ctx, &tradeCount,
		"SELECT COUNT(*) FROM trades WHERE asset_id=?", id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if tradeCount > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请先删除该资产的交易记录"})
		return
	}

	res, err := h.db.ExecContext(ctx, "DELETE FROM assets WHERE id=?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
		return
	}
	if _, err := h.db.ExecContext(ctx, "DELETE FROM price_history WHERE symbol=?", symbol); err != nil {
		log.Printf("asset: delete price_history for %s: %v", symbol, err)
	}
	// 资产删除影响持仓面板，失效 dashboard 缓存
	h.redis.Del(context.Background(), "dashboard:summary")
	c.JSON(http.StatusOK, gin.H{"message": "asset deleted"})
}

// UpdatePrice 手动改价，仅 price_source=manual 允许；成功后失效 quote 缓存防止旧值覆盖。
func (h *AssetHandler) UpdatePrice(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req struct {
		Price float64 `json:"price" binding:"required,gt=0"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx := c.Request.Context()

	var row struct {
		PriceSource string `db:"price_source"`
		Symbol      string `db:"symbol"`
	}
	err = h.db.GetContext(ctx, &row, "SELECT price_source, symbol FROM assets WHERE id=?", id)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if row.PriceSource != "manual" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "自动跟踪资产不可手动改价"})
		return
	}

	res, err := h.db.ExecContext(ctx,
		"UPDATE assets SET current_price=?, price_updated_at=NOW() WHERE id=?", req.Price, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
		return
	}
	h.redis.Del(context.Background(), "quote:"+row.Symbol)
	c.JSON(http.StatusOK, gin.H{"message": "price updated"})
}

// Reorder 持久化拖拽排序：PUT /api/assets/reorder，body {ids:[int64,...]}。
// 校验：ids 必须与全部现存资产 id 集合完全一致（数量 + 成员，顺序任意），否则 400，
// 防止部分/重复/越界 id 造成脏序；通过后在单事务内逐位写 sort_order=1..N，
// 任一步失败整体回滚（500），成功再失效 dashboard 缓存（持仓面板行序随之变化）。
func (h *AssetHandler) Reorder(c *gin.Context) {
	var req struct {
		IDs []int64 `json:"ids" binding:"required,gt=0,dive,gt=0"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx := c.Request.Context()

	existing := []int64{}
	if err := h.db.SelectContext(ctx, &existing, "SELECT id FROM assets"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 集合完全一致：先比数量（只拦总数不符），再逐 id 校验成员归属，重复（含等长凑数的重复 ids）由 seen 集拦截。
	mismatch := func() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids must match all existing assets"})
	}
	if len(req.IDs) != len(existing) {
		mismatch()
		return
	}
	existSet := make(map[int64]struct{}, len(existing))
	for _, id := range existing {
		existSet[id] = struct{}{}
	}
	seen := make(map[int64]struct{}, len(req.IDs))
	for _, id := range req.IDs {
		if _, ok := existSet[id]; !ok {
			mismatch()
			return
		}
		if _, dup := seen[id]; dup {
			mismatch()
			return
		}
		seen[id] = struct{}{}
	}

	tx, err := h.db.BeginTxx(ctx, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer tx.Rollback() // Commit 后为 no-op（sql.ErrTxDone 被忽略）；中途失败/panic 时兜底回滚

	for i, id := range req.IDs {
		if _, err := tx.ExecContext(ctx,
			"UPDATE assets SET sort_order=? WHERE id=?", i+1, id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.redis.Del(context.Background(), "dashboard:summary")
	c.JSON(http.StatusOK, gin.H{"message": "assets reordered"})
}
