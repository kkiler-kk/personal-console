package handler

import (
	"context"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"blog/model"
	"blog/pkg/portfolio"
	"blog/pkg/quote"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

// InvestHandler 提供持仓、批量报价、历史收盘价等只读投资视图。
type InvestHandler struct {
	db     *sqlx.DB
	quotes *quote.Service
}

// NewInvestHandler 构造 InvestHandler（qs 与 AssetHandler 共享同一实例）。
func NewInvestHandler(db *sqlx.DB, qs *quote.Service) *InvestHandler {
	return &InvestHandler{db: db, quotes: qs}
}

// PositionRow 为单个资产的持仓行。指针字段在无行情/无昨收时为 nil。
// PeTTM 在 manual/GOLD_CNY_G 资产、invalid 行与 PE 接口失败/字段缺失时为 nil。
// Invalid=true 表示该资产的交易序列无法折叠（如超卖），数值字段已降级为零值。
type PositionRow struct {
	Asset          model.Asset `json:"asset"`
	Quantity       float64     `json:"quantity"`
	AvgCost        float64     `json:"avg_cost"`
	CostBasis      float64     `json:"cost_basis"`
	MarketValue    *float64    `json:"market_value"`
	RealizedPnl    float64     `json:"realized_pnl"`
	UnrealizedPnl  *float64    `json:"unrealized_pnl"`
	Price          *float64    `json:"price"`
	PreviousClose  *float64    `json:"previous_close"`
	DayChangePct   *float64    `json:"day_change_pct"`
	PeTTM          *float64    `json:"pe_ttm"`
	Stale          bool        `json:"stale"`
	PriceUpdatedAt *time.Time  `json:"price_updated_at"`
	Invalid        bool        `json:"invalid"`
}

// PositionsSummary 为组合层面的 CNY 汇总。DayPnlCNY 在全部行缺价时为 nil。
type PositionsSummary struct {
	TotalValueCNY float64  `json:"total_value_cny"`
	TotalCostCNY  float64  `json:"total_cost_cny"`
	TotalPnlCNY   float64  `json:"total_pnl_cny"`
	TotalPnlPct   float64  `json:"total_pnl_pct"`
	DayPnlCNY     *float64 `json:"day_pnl_cny"`
	FxUSDCNY      float64  `json:"fx_usdcny"`
}

// PositionsResp 为 /api/positions 的响应体，亦供 dashboard（Task 2.8）复用。
type PositionsResp struct {
	Positions []PositionRow    `json:"positions"`
	Summary   PositionsSummary `json:"summary"`
}

// ComputePositionsResponse 实时推导持仓与汇总（不落表）：
//  1. 取全部资产；2. 取全部交易（IFNULL note，traded_at,id ASC）；
//  3. 按 asset_id 分组折叠 + 批量报价（manual 资产不送行情，手输价即权威价，
//     不参与 stale 判定，也避免 pkg/quote 的 writeBackPrice 覆盖用户输入）；
//  4. 取 USDCNY 汇率；批量取 PE(TTM)（manual 与 GOLD_CNY_G 不请求，PEs 永不返 error）；
//  5. 组装每行（price/previous_close 报价缺席时回退 asset.CurrentPrice）；
//  6. 折算 CNY 汇总（USD×fx、CNY×1；day_pnl 任一价缺失跳过该行，全缺→nil）。
//
// 导出以供 dashboard 复用。行情失败只降级（Quotes/USDCNY 永不返 error）；
// 单资产持仓折叠失败（如超卖序列）降级为 Invalid 行、不计入 summary（端点仍 200）；
// 仅 DB 查询失败时返回 error。
func (h *InvestHandler) ComputePositionsResponse(ctx context.Context) (*PositionsResp, error) {
	assets := []model.Asset{}
	if err := h.db.SelectContext(ctx, &assets,
		"SELECT * FROM assets ORDER BY created_at"); err != nil {
		return nil, err
	}

	trades := []model.Trade{}
	if err := h.db.SelectContext(ctx, &trades,
		"SELECT id, asset_id, side, quantity, price, fee, traded_at, IFNULL(note,'') AS note, created_at "+
			"FROM trades ORDER BY traded_at, id"); err != nil {
		return nil, err
	}

	byAsset := make(map[int64][]portfolio.Trade)
	for _, t := range trades {
		byAsset[t.AssetID] = append(byAsset[t.AssetID], portfolio.Trade{
			Side:     t.Side,
			Quantity: t.Quantity,
			Price:    t.Price,
			Fee:      t.Fee,
		})
	}

	// I-1: 仅非 manual 资产送 Quotes，防止 Yahoo 静默覆盖用户手输价
	symbols := make([]string, 0, len(assets))
	for _, a := range assets {
		if a.PriceSource != "manual" {
			symbols = append(symbols, a.Symbol)
		}
	}
	quotes := h.quotes.Quotes(ctx, symbols)
	fx := h.quotes.USDCNY(ctx)

	// PE(TTM)：仅非 manual 且非积存金资产（GOLD_CNY_G 为虚拟 symbol，v7 不认识）。
	// PEs 永不返 error：失败时全 nil + null 缓存，positions 照常 200（全局约束）。
	peSymbols := make([]string, 0, len(assets))
	for _, a := range assets {
		if a.PriceSource != "manual" && a.Symbol != quote.GoldSymbol {
			peSymbols = append(peSymbols, a.Symbol)
		}
	}
	pes := h.quotes.PEs(ctx, peSymbols)

	resp := &PositionsResp{Positions: []PositionRow{}}
	var totalValue, totalCost, totalPnl, dayPnl float64
	dayPnlHasData := false

	for _, a := range assets {
		isManual := a.PriceSource == "manual"
		q, hasQuote := quotes[a.Symbol]
		if isManual {
			hasQuote = false // 手动价是权威值：manual 资产永不使用自动行情，也不打 stale 标记
		}

		// 价格指针：报价 → asset.CurrentPrice → nil（manual 只有 CurrentPrice 一条路）
		var pricePtr *float64
		if hasQuote {
			p := q.Price
			pricePtr = &p
		} else if a.CurrentPrice != nil {
			pricePtr = a.CurrentPrice
		}

		pos, err := portfolio.ComputePosition(byAsset[a.ID], pricePtr)
		if err != nil {
			// 单资产折叠失败（如删单后剩余序列超卖）只降级该行，不整体 500——
			// 对齐 pkg/portfolio ValueCurve 的逐资产 skip 容错哲学。
			log.Printf("positions: asset %s(%d) skipped: %v", a.Symbol, a.ID, err)
			resp.Positions = append(resp.Positions, PositionRow{Asset: a, Invalid: true})
			continue // invalid 行不计入 summary
		}

		row := PositionRow{
			Asset:          a,
			Quantity:       pos.Quantity,
			AvgCost:        pos.AvgCost,
			CostBasis:      pos.CostBasis,
			RealizedPnl:    pos.RealizedPnl,
			PriceUpdatedAt: a.PriceUpdatedAt,
			// manual/GOLD_CNY_G 未送 PEs → map 缺席 → nil；invalid 行不走此路径恒 nil。
			PeTTM: pes[a.Symbol],
		}
		if pricePtr != nil {
			mv := pos.MarketValue
			up := pos.UnrealizedPnl
			row.MarketValue = &mv
			row.UnrealizedPnl = &up
			row.Price = pricePtr
		}
		if hasQuote {
			pc := q.PreviousClose
			row.PreviousClose = &pc
			row.Stale = q.Stale
			if !q.UpdatedAt.IsZero() {
				ua := q.UpdatedAt
				row.PriceUpdatedAt = &ua
			}
			if pricePtr != nil && q.PreviousClose > 0 {
				dcp := (*pricePtr - q.PreviousClose) / q.PreviousClose * 100
				row.DayChangePct = &dcp
			}
		}
		resp.Positions = append(resp.Positions, row)

		// CNY 折算：USD 行 ×fx，CNY 行 ×1
		fxFactor := 1.0
		if a.Currency == "USD" {
			fxFactor = fx
		}
		totalCost += row.CostBasis * fxFactor
		if row.MarketValue != nil {
			totalValue += *row.MarketValue * fxFactor
			totalPnl += (*row.MarketValue - row.CostBasis) * fxFactor
		}
		if row.Price != nil && row.PreviousClose != nil && *row.PreviousClose > 0 {
			dayPnl += row.Quantity * (*row.Price - *row.PreviousClose) * fxFactor
			dayPnlHasData = true
		}
	}

	resp.Summary.TotalValueCNY = totalValue
	resp.Summary.TotalCostCNY = totalCost
	resp.Summary.TotalPnlCNY = totalPnl
	if totalCost > 0 {
		resp.Summary.TotalPnlPct = totalPnl / totalCost * 100
	}
	resp.Summary.FxUSDCNY = fx
	if dayPnlHasData {
		resp.Summary.DayPnlCNY = &dayPnl
	}
	return resp, nil
}

// Positions 返回实时持仓与汇总。
func (h *InvestHandler) Positions(c *gin.Context) {
	resp, err := h.ComputePositionsResponse(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// Quotes 批量报价：?symbols= 逗号分隔（上限 50），按入参顺序稳定返回，缺席的 symbol 跳过。
func (h *InvestHandler) Quotes(c *gin.Context) {
	var symbols []string
	for _, s := range strings.Split(c.Query("symbols"), ",") {
		if s = strings.TrimSpace(s); s != "" {
			symbols = append(symbols, s)
		}
	}
	if len(symbols) > 50 {
		symbols = symbols[:50]
	}

	qmap := h.quotes.Quotes(c.Request.Context(), symbols)
	out := make([]quote.Quote, 0, len(symbols))
	for _, s := range symbols {
		if q, ok := qmap[s]; ok {
			out = append(out, q)
		}
	}
	c.JSON(http.StatusOK, gin.H{"quotes": out})
}

// tradeScanRow 为 PositionsHistory 的 trades 查询扫描结构（ValueCurve 不需要 note，不选取）。
type tradeScanRow struct {
	AssetID  int64     `db:"asset_id"`
	Side     string    `db:"side"`
	Quantity float64   `db:"quantity"`
	Price    float64   `db:"price"`
	Fee      float64   `db:"fee"`
	TradedAt time.Time `db:"traded_at"`
}

// closeScanRow 为 PositionsHistory 的 price_history 查询扫描结构。
type closeScanRow struct {
	Symbol string    `db:"symbol"`
	Date   time.Time `db:"date"`
	Close  float64   `db:"close"`
}

// PositionsHistory 返回组合价值曲线（CNY 口径）：?days=（默认 90，clamp 1..365）。
// dates 为最近 days 个自然日（今天在内，升序，time.Local 日期部分）；
// 每日单价取 price_history（窗口内 + 窗口前每 symbol 最近一行 carry-in，task 4.5）
// 当日/最近更早 close，无则回退 asset.current_price，USD 资产按 USDCNY 汇率折算。
// 响应 {points:[{date,value,cost,pnl}], currency:"CNY"}。
func (h *InvestHandler) PositionsHistory(c *gin.Context) {
	days := 90
	if d := c.Query("days"); d != "" {
		parsed, err := strconv.Atoi(d)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid days"})
			return
		}
		days = parsed
	}
	if days < 1 {
		days = 1
	}
	if days > 365 {
		days = 365
	}

	ctx := c.Request.Context()
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	dates := make([]time.Time, days)
	for i := range dates {
		dates[i] = today.AddDate(0, 0, i-days+1) // 升序，含今天
	}

	tradeRows := []tradeScanRow{}
	if err := h.db.SelectContext(ctx, &tradeRows,
		"SELECT asset_id, side, quantity, price, fee, traded_at FROM trades ORDER BY traded_at, id"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	trades := make([]portfolio.TradeRow, 0, len(tradeRows))
	for _, t := range tradeRows {
		trades = append(trades, portfolio.TradeRow{
			AssetID: t.AssetID, Side: t.Side, Quantity: t.Quantity,
			Price: t.Price, Fee: t.Fee, TradedAt: t.TradedAt,
		})
	}

	assets := []model.Asset{}
	if err := h.db.SelectContext(ctx, &assets,
		"SELECT * FROM assets ORDER BY created_at"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	symToID := make(map[string]int64, len(assets))
	metas := make([]portfolio.AssetMeta, 0, len(assets))
	for _, a := range assets {
		symToID[a.Symbol] = a.ID
		m := portfolio.AssetMeta{ID: a.ID, Symbol: a.Symbol, Currency: a.Currency}
		if a.CurrentPrice != nil {
			m.CurrentPrice = *a.CurrentPrice
		}
		metas = append(metas, m)
	}

	closeRows := []closeScanRow{}
	windowStart := dates[0].Format("2006-01-02")
	if err := h.db.SelectContext(ctx, &closeRows,
		"SELECT ph.symbol, ph.date, ph.close FROM price_history ph WHERE ph.date >= ? ORDER BY ph.date",
		windowStart); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// carry-in（task 4.5）：每 symbol 补取窗口前最近一行 close，使窗口首日即用真实历史价，
	// 不再回退 asset.current_price 造成曲线开头偏平。子查询先取 MAX(date)（ONLY_FULL_GROUP_BY
	// 安全），再 join 回原表取对应 close；(symbol,date) 唯一键保证每 symbol 恰一行。
	carryRows := []closeScanRow{}
	if err := h.db.SelectContext(ctx, &carryRows,
		"SELECT ph.symbol, ph.date, ph.close FROM price_history ph "+
			"JOIN (SELECT symbol, MAX(date) AS max_date FROM price_history WHERE date < ? GROUP BY symbol) lc "+
			"ON lc.symbol = ph.symbol AND lc.max_date = ph.date",
		windowStart); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	closeRows = append(closeRows, carryRows...)
	closes := make([]portfolio.CloseRow, 0, len(closeRows))
	for _, cr := range closeRows {
		id, ok := symToID[cr.Symbol]
		if !ok {
			continue // 无对应 asset 的 symbol 忽略
		}
		closes = append(closes, portfolio.CloseRow{AssetID: id, Date: cr.Date, Close: cr.Close})
	}

	fx := h.quotes.USDCNY(ctx)
	points := portfolio.ValueCurve(trades, closes, metas, dates, fx)
	c.JSON(http.StatusOK, gin.H{"points": points, "currency": "CNY"})
}

// historyPoint 为 /api/price-history 的单点（date 为 YYYY-MM-DD 字符串）。
type historyPoint struct {
	Date  string  `json:"date"`
	Close float64 `json:"close"`
}

// PriceHistory 返回某 symbol 最近 N 天收盘价：?symbol=&days=（默认 90，1..365）。
func (h *InvestHandler) PriceHistory(c *gin.Context) {
	symbol := strings.TrimSpace(c.Query("symbol"))
	if symbol == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "symbol required"})
		return
	}
	days := 90
	if d := c.Query("days"); d != "" {
		parsed, err := strconv.Atoi(d)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid days"})
			return
		}
		days = parsed
	}
	if days < 1 {
		days = 1
	}
	if days > 365 {
		days = 365
	}

	rows, err := h.db.QueryContext(c.Request.Context(),
		"SELECT date, close FROM price_history WHERE symbol=? AND date >= CURDATE() - INTERVAL ? DAY ORDER BY date",
		symbol, days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	points := []historyPoint{}
	for rows.Next() {
		var (
			d     time.Time
			close float64
		)
		if err := rows.Scan(&d, &close); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		points = append(points, historyPoint{Date: d.Format("2006-01-02"), Close: close})
	}
	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"points": points})
}
