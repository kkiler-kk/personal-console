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
// quotes 用于 yahoo/computed 资产创建后的历史回填；redis 用于改价后失效行情缓存。
type AssetHandler struct {
	db     *sqlx.DB
	quotes *quote.Service
	redis  *redis.Client
}

// NewAssetHandler 构造 AssetHandler（qs 与 InvestHandler 共享同一实例）。
func NewAssetHandler(db *sqlx.DB, qs *quote.Service, rdb *redis.Client) *AssetHandler {
	return &AssetHandler{db: db, quotes: qs, redis: rdb}
}

// List 返回全部资产，按创建时间升序。
func (h *AssetHandler) List(c *gin.Context) {
	assets := []model.Asset{}
	if err := h.db.SelectContext(c.Request.Context(), &assets,
		"SELECT * FROM assets ORDER BY created_at"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"assets": assets})
}

// Create 新建资产。type/price_source/currency 走白名单校验；
// price_source=computed_gold_cny 强制 symbol=GOLD_CNY_G/currency=CNY/type=metal；
// 重复 symbol → 409；yahoo/computed 创建后异步回填 365 天历史。
func (h *AssetHandler) Create(c *gin.Context) {
	var req struct {
		Symbol      string `json:"symbol" binding:"required"`
		Name        string `json:"name" binding:"required"`
		Type        string `json:"type" binding:"required,oneof=stock etf metal other"`
		PriceSource string `json:"price_source" binding:"required,oneof=yahoo computed_gold_cny manual"`
		Currency    string `json:"currency" binding:"required,oneof=USD CNY"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	symbol := strings.ToUpper(strings.TrimSpace(req.Symbol))
	assetType := req.Type
	currency := req.Currency
	if req.PriceSource == "computed_gold_cny" {
		// 积存金为虚拟资产，忽略入参强制三要素
		symbol = quote.GoldSymbol
		currency = "CNY"
		assetType = "metal"
	}

	res, err := h.db.ExecContext(c.Request.Context(),
		"INSERT INTO assets (symbol, name, type, price_source, currency) VALUES (?,?,?,?,?)",
		symbol, req.Name, assetType, req.PriceSource, currency)
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

	if req.PriceSource == "yahoo" || req.PriceSource == "computed_gold_cny" {
		// 回填是 best-effort 后台任务，用 WithoutCancel 脱离请求生命周期。
		// 裸 goroutine 不经 Gin Recovery 覆盖，provider 走外部 HTTP+JSON 解析，
		// 一旦 panic 会拖垮整个进程（爆炸半径含博客主站），故自旋 recover 兜底。
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("asset: backfill panic for %s: %v", symbol, r)
				}
			}()
			h.quotes.BackfillHistory(context.WithoutCancel(c.Request.Context()), symbol, 365)
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
