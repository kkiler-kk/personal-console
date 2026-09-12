package handler

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"blog/model"
	"blog/pkg/portfolio"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/jmoiron/sqlx"
)

// TradeHandler 处理交易记录的增删查，含卖出超卖校验。
type TradeHandler struct {
	db    *sqlx.DB
	redis *redis.Client
}

// NewTradeHandler 构造 TradeHandler。
func NewTradeHandler(db *sqlx.DB, rdb *redis.Client) *TradeHandler {
	return &TradeHandler{db: db, redis: rdb}
}

// tradeColumns 是 trades 查询的显式列清单（禁用 SELECT *）。
// note 可能为 NULL，而 model.Trade.Note 是 string，用 IFNULL 兜底避免 scan 失败。
const tradeColumns = "t.id, t.asset_id, t.side, t.quantity, t.price, t.fee, t.traded_at, IFNULL(t.note,'') AS note, t.created_at"

// sellEpsilon 与 portfolio 内部容差一致，避免精确清仓被浮点残渣误判为超卖。
const sellEpsilon = 1e-9

// List 返回交易记录（含 asset 联表），traded_at DESC，上限 200；?asset_id= 可选过滤。
func (h *TradeHandler) List(c *gin.Context) {
	ctx := c.Request.Context()
	query := "SELECT " + tradeColumns + " FROM trades t"
	args := []interface{}{}
	if aid := c.Query("asset_id"); aid != "" {
		id, err := strconv.ParseInt(aid, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid asset_id"})
			return
		}
		query += " WHERE t.asset_id = ?"
		args = append(args, id)
	}
	query += " ORDER BY t.traded_at DESC, t.id DESC LIMIT 200"

	trades := []model.Trade{}
	if err := h.db.SelectContext(ctx, &trades, query, args...); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.attachAssets(ctx, trades)
	c.JSON(http.StatusOK, gin.H{"trades": trades})
}

// attachAssets 批量加载交易引用的资产并挂到 Trade.Asset（契约要求 trades 含 asset 联表）。
func (h *TradeHandler) attachAssets(ctx context.Context, trades []model.Trade) {
	if len(trades) == 0 {
		return
	}
	ids := make([]int64, 0, len(trades))
	seen := make(map[int64]bool, len(trades))
	for _, t := range trades {
		if !seen[t.AssetID] {
			seen[t.AssetID] = true
			ids = append(ids, t.AssetID)
		}
	}
	query, qargs, err := sqlx.In("SELECT * FROM assets WHERE id IN (?)", ids)
	if err != nil {
		log.Printf("trade: build asset query: %v", err)
		return
	}
	assets := []model.Asset{}
	if err := h.db.SelectContext(ctx, &assets, h.db.Rebind(query), qargs...); err != nil {
		log.Printf("trade: load assets: %v", err)
		return
	}
	byID := make(map[int64]*model.Asset, len(assets))
	for i := range assets {
		byID[assets[i].ID] = &assets[i]
	}
	for i := range trades {
		if a, ok := byID[trades[i].AssetID]; ok {
			trades[i].Asset = a
		}
	}
}

// Create 录入一笔交易。卖出时校验不得超过当前持仓；成功后失效 dashboard 缓存。
func (h *TradeHandler) Create(c *gin.Context) {
	var req struct {
		AssetID  int64   `json:"asset_id" binding:"required"`
		Side     string  `json:"side" binding:"required,oneof=buy sell"`
		Quantity float64 `json:"quantity" binding:"required,gt=0"`
		Price    float64 `json:"price" binding:"required,gt=0"`
		Fee      float64 `json:"fee" binding:"gte=0"`
		TradedAt string  `json:"traded_at" binding:"required"`
		Note     string  `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tradedAt, err := time.Parse("2006-01-02", req.TradedAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "traded_at 格式应为 YYYY-MM-DD"})
		return
	}
	ctx := c.Request.Context()

	var exists int
	if err := h.db.GetContext(ctx, &exists,
		"SELECT COUNT(*) FROM assets WHERE id=?", req.AssetID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if exists == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
		return
	}

	if req.Side == "sell" {
		pos, err := h.currentPosition(ctx, req.AssetID)
		if err != nil {
			if errors.Is(err, portfolio.ErrOversell) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "卖出数量超过持仓"})
				return
			}
			// 未知 side 等数据异常 → 500
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if req.Quantity > pos.Quantity+sellEpsilon {
			c.JSON(http.StatusBadRequest, gin.H{"error": "卖出数量超过持仓"})
			return
		}
	}

	res, err := h.db.ExecContext(ctx,
		"INSERT INTO trades (asset_id, side, quantity, price, fee, traded_at, note) VALUES (?,?,?,?,?,?,?)",
		req.AssetID, req.Side, req.Quantity, req.Price, req.Fee, tradedAt, req.Note)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	id, _ := res.LastInsertId()
	h.redis.Del(context.Background(), "dashboard:summary")
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// Delete 删除一笔交易；0 行受影响 → 404；成功后失效 dashboard 缓存。
func (h *TradeHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	res, err := h.db.ExecContext(c.Request.Context(), "DELETE FROM trades WHERE id=?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "trade not found"})
		return
	}
	h.redis.Del(context.Background(), "dashboard:summary")
	c.JSON(http.StatusOK, gin.H{"message": "trade deleted"})
}

// currentPosition 折叠某资产的全部历史交易（traded_at,id ASC）得到当前持仓。
func (h *TradeHandler) currentPosition(ctx context.Context, assetID int64) (portfolio.Position, error) {
	rows, err := h.db.QueryContext(ctx,
		"SELECT side, quantity, price, fee FROM trades WHERE asset_id=? ORDER BY traded_at, id", assetID)
	if err != nil {
		return portfolio.Position{}, err
	}
	defer rows.Close()

	var trades []portfolio.Trade
	for rows.Next() {
		var t portfolio.Trade
		if err := rows.Scan(&t.Side, &t.Quantity, &t.Price, &t.Fee); err != nil {
			return portfolio.Position{}, err
		}
		trades = append(trades, t)
	}
	if err := rows.Err(); err != nil {
		return portfolio.Position{}, err
	}
	return portfolio.ComputePosition(trades, nil)
}
