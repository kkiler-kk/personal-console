package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"blog/config"
	"blog/model"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/jmoiron/sqlx"
)

type CategoryHandler struct {
	db    *sqlx.DB
	redis *redis.Client
}

func NewCategoryHandler(cfg *config.Config, db *sqlx.DB, rdb *redis.Client) *CategoryHandler {
	return &CategoryHandler{db: db, redis: rdb}
}

func (h *CategoryHandler) List(c *gin.Context) {
	if cached, err := h.redis.Get(context.Background(), "categories:list").Result(); err == nil {
		c.Data(http.StatusOK, "application/json", []byte(cached))
		return
	}

	var categories []model.Category
	err := h.db.Select(&categories, "SELECT * FROM categories ORDER BY name")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resp := gin.H{"categories": categories}
	if data, err := json.Marshal(resp); err == nil {
		h.redis.Set(context.Background(), "categories:list", data, 30*time.Minute)
	}

	c.JSON(http.StatusOK, resp)
}

// validSection normalizes a section value against the five-zone whitelist.
// Any value outside the whitelist falls back to "blog".
func validSection(s string) string {
	switch s {
	case "invest", "learn", "fitness", "life":
		return s
	default:
		return "blog"
	}
}

func (h *CategoryHandler) Create(c *gin.Context) {
	var req struct {
		Name    string `json:"name" binding:"required"`
		Slug    string `json:"slug" binding:"required"`
		Section string `json:"section"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.db.Exec("INSERT INTO categories (name, slug, section) VALUES (?, ?, ?)", req.Name, req.Slug, validSection(req.Section))
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "category already exists"})
		return
	}

	id, _ := result.LastInsertId()
	h.redis.Del(context.Background(), "categories:list")

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *CategoryHandler) Update(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req struct {
		Name    string  `json:"name"`
		Slug    string  `json:"slug"`
		Section *string `json:"section"`
	}
	if err = c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// merge semantics: section omitted → preserve current value;
	// section present → normalize against whitelist
	section := ""
	if req.Section != nil {
		section = validSection(*req.Section)
	} else {
		if err = h.db.Get(&section, "SELECT section FROM categories WHERE id = ?", id); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
			return
		}
	}

	_, err = h.db.Exec("UPDATE categories SET name = ?, slug = ?, section = ? WHERE id = ?", req.Name, req.Slug, section, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.redis.Del(context.Background(), "categories:list")
	c.JSON(http.StatusOK, gin.H{"message": "category updated"})
}

func (h *CategoryHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	_, err = h.db.Exec("DELETE FROM categories WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.redis.Del(context.Background(), "categories:list")
	c.JSON(http.StatusOK, gin.H{"message": "category deleted"})
}

// Tag handlers

type TagHandler struct {
	db    *sqlx.DB
	redis *redis.Client
}

func NewTagHandler(cfg *config.Config, db *sqlx.DB, rdb *redis.Client) *TagHandler {
	return &TagHandler{db: db, redis: rdb}
}

func (h *TagHandler) List(c *gin.Context) {
	if cached, err := h.redis.Get(context.Background(), "tags:list").Result(); err == nil {
		c.Data(http.StatusOK, "application/json", []byte(cached))
		return
	}

	var tags []struct {
		model.Tag
		Count int `json:"count" db:"count"`
	}
	err := h.db.Select(&tags, `
		SELECT t.id, t.name, COUNT(pt.post_id) as count
		FROM tags t
		LEFT JOIN post_tags pt ON t.id = pt.tag_id
		GROUP BY t.id, t.name
		ORDER BY count DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resp := gin.H{"tags": tags}
	if data, err := json.Marshal(resp); err == nil {
		h.redis.Set(context.Background(), "tags:list", data, 30*time.Minute)
	}

	c.JSON(http.StatusOK, resp)
}
