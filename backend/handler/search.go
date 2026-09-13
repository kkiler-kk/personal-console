package handler

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

// SearchHandler 提供全站搜索（⌘K 命令面板数据源，Task S1）。
type SearchHandler struct {
	db *sqlx.DB
}

// NewSearchHandler 构造 SearchHandler。
func NewSearchHandler(db *sqlx.DB) *SearchHandler {
	return &SearchHandler{db: db}
}

// escapeLike 转义 LIKE 通配三字符。strings.NewReplacer 对源串单遍替换、
// 不重扫替换产物，故 `\`→`\\` 在前、`%`/`_` 在后不会产生二次转义。
var escapeLike = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// likeParam 先转义再包 %...%（MySQL LIKE 默认转义符为 \）。
func likeParam(q string) string {
	return "%" + escapeLike.Replace(q) + "%"
}

// 搜索结果行（json 键名与前后端契约逐字一致）。

type searchPost struct {
	ID      int64  `json:"id" db:"id"`
	Title   string `json:"title" db:"title"`
	Slug    string `json:"slug" db:"slug"`
	Summary string `json:"summary" db:"summary"`
}

type searchAsset struct {
	ID     int64  `json:"id" db:"id"`
	Symbol string `json:"symbol" db:"symbol"`
	Name   string `json:"name" db:"name"`
	Type   string `json:"type" db:"type"`
}

type searchHabit struct {
	ID   int64  `json:"id" db:"id"`
	Name string `json:"name" db:"name"`
	Icon string `json:"icon" db:"icon"`
}

type searchCategory struct {
	ID   int64  `json:"id" db:"id"`
	Name string `json:"name" db:"name"`
	Slug string `json:"slug" db:"slug"`
}

type searchTag struct {
	ID   int64  `json:"id" db:"id"`
	Name string `json:"name" db:"name"`
}

// Search 五类聚合搜索（posts/assets/habits/categories/tags）。
// q 必填，trim 后按 rune 计数 1..50，越界 400。LIKE 参数统一 escapeLike 后包 %...%。
// 各类查询独立容错：单类失败 log 后返回空数组，不整体 500（搜索尽力而为语义）。
// 响应五键恒在（空为 []）。
func (h *SearchHandler) Search(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	if n := len([]rune(q)); n < 1 || n > 50 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "q must be 1-50 characters"})
		return
	}
	like := likeParam(q)
	ctx := c.Request.Context()

	// posts：仅已发布，summary 可空 → IFNULL 兜底
	posts := []searchPost{}
	if err := h.db.SelectContext(ctx, &posts,
		"SELECT id, title, slug, IFNULL(summary,'') AS summary FROM posts WHERE status = 'published' AND (title LIKE ? OR summary LIKE ?) ORDER BY created_at DESC LIMIT 8",
		like, like); err != nil {
		log.Printf("search: posts: %v", err)
		posts = []searchPost{}
	}

	assets := []searchAsset{}
	if err := h.db.SelectContext(ctx, &assets,
		"SELECT id, symbol, name, type FROM assets WHERE symbol LIKE ? OR name LIKE ? ORDER BY created_at LIMIT 8",
		like, like); err != nil {
		log.Printf("search: assets: %v", err)
		assets = []searchAsset{}
	}

	// habits：仅未归档，icon 可空 → IFNULL 兜底
	habits := []searchHabit{}
	if err := h.db.SelectContext(ctx, &habits,
		"SELECT id, name, IFNULL(icon,'') AS icon FROM habits WHERE archived = FALSE AND name LIKE ? ORDER BY created_at LIMIT 5",
		like); err != nil {
		log.Printf("search: habits: %v", err)
		habits = []searchHabit{}
	}

	categories := []searchCategory{}
	if err := h.db.SelectContext(ctx, &categories,
		"SELECT id, name, slug FROM categories WHERE name LIKE ? OR slug LIKE ? ORDER BY name LIMIT 5",
		like, like); err != nil {
		log.Printf("search: categories: %v", err)
		categories = []searchCategory{}
	}

	tags := []searchTag{}
	if err := h.db.SelectContext(ctx, &tags,
		"SELECT id, name FROM tags WHERE name LIKE ? ORDER BY name LIMIT 5",
		like); err != nil {
		log.Printf("search: tags: %v", err)
		tags = []searchTag{}
	}

	c.JSON(http.StatusOK, gin.H{
		"posts":      posts,
		"assets":     assets,
		"habits":     habits,
		"categories": categories,
		"tags":       tags,
	})
}
