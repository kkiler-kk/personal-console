package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"blog/config"
	"blog/model"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/jmoiron/sqlx"
)

type PostHandler struct {
	db    *sqlx.DB
	redis *redis.Client
}

func NewPostHandler(cfg *config.Config, db *sqlx.DB, rdb *redis.Client) *PostHandler {
	return &PostHandler{db: db, redis: rdb}
}

// ---- public ----

func (h *PostHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	category := c.Query("category")
	tag := c.Query("tag")
	year := c.Query("year")
	month := c.Query("month")

	if page < 1 { page = 1 }
	if size < 1 || size > 50 { size = 10 }
	offset := (page - 1) * size

	// try cache
	cacheKey := fmt.Sprintf("posts:list:%d:%d:%s:%s:%s:%s", page, size, category, tag, year, month)
	if cached, err := h.redis.Get(context.Background(), cacheKey).Result(); err == nil {
		c.Header("X-Cache", "hit")
		c.Data(http.StatusOK, "application/json", []byte(cached))
		return
	}

	query := "SELECT p.* FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.status = 'published'"
	countQuery := "SELECT COUNT(*) FROM posts p WHERE p.status = 'published'"
	args := []interface{}{}

	if category != "" {
		query += " AND c.slug = ?"
		countQuery += " AND p.category_id IN (SELECT id FROM categories WHERE slug = ?)"
		args = append(args, category)
	}
	if tag != "" {
		query += " AND p.id IN (SELECT pt.post_id FROM post_tags pt JOIN tags t ON pt.tag_id = t.id WHERE t.name = ?)"
		countQuery += " AND p.id IN (SELECT pt.post_id FROM post_tags pt JOIN tags t ON pt.tag_id = t.id WHERE t.name = ?)"
		args = append(args, tag)
	}
	if year != "" {
		y, _ := strconv.Atoi(year)
		m := 0
		if month != "" { m, _ = strconv.Atoi(month) }
		if m > 0 {
			query += " AND YEAR(p.created_at) = ? AND MONTH(p.created_at) = ?"
			countQuery += " AND YEAR(p.created_at) = ? AND MONTH(p.created_at) = ?"
			args = append(args, y, m)
		} else {
			query += " AND YEAR(p.created_at) = ?"
			countQuery += " AND YEAR(p.created_at) = ?"
			args = append(args, y)
		}
	}

	query += " ORDER BY p.created_at DESC LIMIT ? OFFSET ?"
	args = append(args, size, offset)

	var total int
	h.db.Get(&total, countQuery, args[:len(args)-2]...)

	rows, err := h.db.Queryx(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	posts, err := buildPostsFromRows(rows, h.db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resp := gin.H{
		"posts": posts,
		"total": total,
		"page":  page,
		"size":  size,
	}

	// cache 5 min
	if data, err := json.Marshal(resp); err == nil {
		h.redis.Set(context.Background(), cacheKey, data, 5*time.Minute)
	}

	c.Header("X-Cache", "miss")
	c.JSON(http.StatusOK, resp)
}

func (h *PostHandler) GetBySlug(c *gin.Context) {
	slug := c.Param("slug")

	// increment view count async
	go h.db.Exec("UPDATE posts SET view_count = view_count + 1 WHERE slug = ?", slug)

	// invalidate list cache
	go h.redis.Keys(context.Background(), "posts:list:*").Val()

	var post model.Post
	err := h.db.Get(&post, `SELECT p.* FROM posts p WHERE p.slug = ? AND p.status = 'published'`, slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "post not found"})
		return
	}

	// load tags
	h.db.Select(&post.Tags, `SELECT t.id, t.name FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = ?`, post.ID)

	// load category
	if post.CategoryID != nil {
		var cat model.Category
		if err := h.db.Get(&cat, "SELECT * FROM categories WHERE id = ?", *post.CategoryID); err == nil {
			post.Category = &cat
		}
	}

	c.JSON(http.StatusOK, post)
}

func (h *PostHandler) Archive(c *gin.Context) {
	var archives []model.Archive
	err := h.db.Select(&archives, `
		SELECT YEAR(created_at) as year, MONTH(created_at) as month, COUNT(*) as count
		FROM posts WHERE status = 'published'
		GROUP BY YEAR(created_at), MONTH(created_at)
		ORDER BY year DESC, month DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"archives": archives})
}

func (h *PostHandler) ViewCount(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var count int
	h.db.Get(&count, "SELECT view_count FROM posts WHERE id = ?", id)
	c.JSON(http.StatusOK, gin.H{"view_count": count})
}

// ---- admin (auth required) ----

func (h *PostHandler) Create(c *gin.Context) {
	userID := c.GetInt64("userID")
	var req struct {
		Title      string  `json:"title" binding:"required"`
		Summary    string  `json:"summary"`
		Content    string  `json:"content" binding:"required"`
		CategoryID *int64  `json:"category_id"`
		Status     string  `json:"status"`
		Tags       []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Status == "" { req.Status = "published" }

	slug := generateSlug(req.Title)

	tx, err := h.db.Beginx()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer tx.Rollback()

	result, err := tx.Exec(
		"INSERT INTO posts (title, slug, summary, content, author_id, category_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
		req.Title, slug, req.Summary, req.Content, userID, req.CategoryID, req.Status,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	postID, _ := result.LastInsertId()

	// handle tags
	for _, tagName := range req.Tags {
		var tagID int64
		err = tx.Get(&tagID, "SELECT id FROM tags WHERE name = ?", tagName)
		if err != nil {
			r, _ := tx.Exec("INSERT INTO tags (name) VALUES (?)", tagName)
			tagID, _ = r.LastInsertId()
		}
		tx.Exec("INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)", postID, tagID)
	}

	if err = tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.invalidateCache()
	c.JSON(http.StatusCreated, gin.H{"id": postID, "slug": slug})
}

func (h *PostHandler) Update(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req struct {
		Title      string   `json:"title"`
		Summary    string   `json:"summary"`
		Content    string   `json:"content"`
		CategoryID *int64   `json:"category_id"`
		Status     string   `json:"status"`
		Tags       []string `json:"tags"`
	}
	if err = c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tx, err := h.db.Beginx()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer tx.Rollback()

	slug := generateSlug(req.Title)
	_, err = tx.Exec(
		"UPDATE posts SET title = ?, slug = ?, summary = ?, content = ?, category_id = ?, status = ? WHERE id = ?",
		req.Title, slug, req.Summary, req.Content, req.CategoryID, req.Status, id,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// update tags
	if req.Tags != nil {
		tx.Exec("DELETE FROM post_tags WHERE post_id = ?", id)
		for _, tagName := range req.Tags {
			var tagID int64
			err = tx.Get(&tagID, "SELECT id FROM tags WHERE name = ?", tagName)
			if err != nil {
				r, _ := tx.Exec("INSERT INTO tags (name) VALUES (?)", tagName)
				tagID, _ = r.LastInsertId()
			}
			tx.Exec("INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)", id, tagID)
		}
	}

	if err = tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.invalidateCache()
	c.JSON(http.StatusOK, gin.H{"message": "post updated"})
}

func (h *PostHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	tx, err := h.db.Beginx()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer tx.Rollback()

	tx.Exec("DELETE FROM post_tags WHERE post_id = ?", id)
	tx.Exec("DELETE FROM posts WHERE id = ?", id)

	if err = tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.invalidateCache()
	c.JSON(http.StatusOK, gin.H{"message": "post deleted"})
}

func (h *PostHandler) AdminList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	status := c.Query("status")
	if page < 1 { page = 1 }
	offset := (page - 1) * size

	query := "SELECT p.* FROM posts p WHERE 1=1"
	countQuery := "SELECT COUNT(*) FROM posts WHERE 1=1"
	args := []interface{}{}

	if status != "" {
		query += " AND p.status = ?"
		countQuery += " AND status = ?"
		args = append(args, status)
	}

	var total int
	h.db.Get(&total, countQuery, args...)

	query += " ORDER BY p.created_at DESC LIMIT ? OFFSET ?"
	args = append(args, size, offset)

	rows, err := h.db.Queryx(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	posts, err := buildPostsFromRows(rows, h.db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"posts": posts, "total": total, "page": page, "size": size})
}

// helpers

func buildPostsFromRows(rows *sqlx.Rows, db *sqlx.DB) ([]model.Post, error) {
	var posts []model.Post
	for rows.Next() {
		var p model.Post
		if err := rows.StructScan(&p); err != nil {
			return nil, err
		}
		posts = append(posts, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// load tags and category for all posts
	for i := range posts {
		db.Select(&posts[i].Tags,
			"SELECT t.id, t.name FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = ?",
			posts[i].ID)
		if posts[i].CategoryID != nil {
			var cat model.Category
			err := db.Get(&cat, "SELECT * FROM categories WHERE id = ?", *posts[i].CategoryID)
			if err == nil {
				posts[i].Category = &cat
			}
		}
	}

	return posts, nil
}

func (h *PostHandler) invalidateCache() {
	keys, _ := h.redis.Keys(context.Background(), "posts:*").Result()
	if len(keys) > 0 {
		h.redis.Del(context.Background(), keys...)
	}
}

func generateSlug(title string) string {
	// simple slug: lowercase, replace spaces with hyphens, add timestamp
	slug := ""
	for _, r := range title {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			slug += string(r)
		} else if r >= 'A' && r <= 'Z' {
			slug += string(r + 32)
		} else if r == ' ' || r == '-' {
			slug += "-"
		}
	}
	if slug == "" {
		slug = "post"
	}
	slug += "-" + strconv.FormatInt(time.Now().Unix(), 10)
	return slug
}
