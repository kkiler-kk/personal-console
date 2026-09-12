package handler

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"

	"blog/config"
	"blog/model"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

type CommentHandler struct {
	db *sqlx.DB
}

func NewCommentHandler(cfg *config.Config, db *sqlx.DB) *CommentHandler {
	return &CommentHandler{db: db}
}

func (h *CommentHandler) List(c *gin.Context) {
	slug := c.Param("slug")
	email := strings.ToLower(strings.TrimSpace(c.Query("email")))

	var postID int64
	err := h.db.Get(&postID, "SELECT id FROM posts WHERE slug = ?", slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "post not found"})
		return
	}

	var comments []model.Comment
	err = h.db.Select(&comments, `
		SELECT id, post_id, parent_id, name, email, content, like_count, created_at, updated_at
		FROM comments
		WHERE post_id = ?
		ORDER BY created_at ASC`, postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// set can_delete flag if email is provided
	if email != "" {
		for i := range comments {
			if comments[i].Email == email {
				comments[i].CanDelete = true
			}
		}
	}

	// build tree: top-level comments first, replies nested under parent.
	// Assembly works on indices into the comments slice and is materialized
	// depth-first, so a child is fully assembled (its own replies attached)
	// before it is copied into its parent. Copying earlier — or storing copies
	// in the id map — would silently drop every nested level.
	indexByID := make(map[int64]int, len(comments))
	for i := range comments {
		indexByID[comments[i].ID] = i
	}

	childrenOf := make([][]int, len(comments))
	var rootIdx []int
	for i := range comments {
		parentID := comments[i].ParentID
		if parentID == nil {
			rootIdx = append(rootIdx, i)
			continue
		}
		// orphan (parent deleted or belongs to another post): keep as root
		if p, ok := indexByID[*parentID]; ok && p != i {
			childrenOf[p] = append(childrenOf[p], i)
			continue
		}
		rootIdx = append(rootIdx, i)
	}

	var build func(int) model.Comment
	build = func(i int) model.Comment {
		cmt := comments[i]
		for _, child := range childrenOf[i] {
			cmt.Replies = append(cmt.Replies, build(child))
		}
		return cmt
	}

	// nil (not empty slice) on purpose: keeps the wire format for a post with
	// no comments identical to before ({"comments":null,"total":0}).
	var roots []model.Comment
	for _, i := range rootIdx {
		roots = append(roots, build(i))
	}

	// reverse roots so newest is first
	for i, j := 0, len(roots)-1; i < j; i, j = i+1, j-1 {
		roots[i], roots[j] = roots[j], roots[i]
	}

	c.JSON(http.StatusOK, gin.H{"comments": roots, "total": len(roots)})
}

func (h *CommentHandler) Create(c *gin.Context) {
	slug := c.Param("slug")

	var postID int64
	err := h.db.Get(&postID, "SELECT id FROM posts WHERE slug = ? AND status = 'published'", slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "post not found"})
		return
	}

	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email" binding:"required,email"`
		Content  string `json:"content" binding:"required"`
		ParentID *int64 `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if strings.TrimSpace(req.Content) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "content is required"})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	// validate parent_id belongs to same post if provided
	if req.ParentID != nil {
		var parentPostID int64
		err = h.db.Get(&parentPostID, "SELECT post_id FROM comments WHERE id = ?", *req.ParentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "parent comment not found"})
			return
		}
		if parentPostID != postID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "parent comment belongs to a different post"})
			return
		}
	}

	result, err := h.db.Exec(
		"INSERT INTO comments (post_id, parent_id, name, email, content) VALUES (?, ?, ?, ?, ?)",
		postID, req.ParentID, req.Name, req.Email, strings.TrimSpace(req.Content),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	id, _ := result.LastInsertId()

	var comment model.Comment
	h.db.Get(&comment, "SELECT id, post_id, parent_id, name, email, content, like_count, created_at, updated_at FROM comments WHERE id = ?", id)
	comment.CanDelete = true

	c.JSON(http.StatusCreated, comment)
}

func (h *CommentHandler) Like(c *gin.Context) {
	commentID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid comment id"})
		return
	}

	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	// check if already liked
	var count int
	h.db.Get(&count, "SELECT COUNT(*) FROM comment_likes WHERE comment_id = ? AND email = ?", commentID, req.Email)

	tx, err := h.db.Beginx()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer tx.Rollback()

	liked := true
	if count > 0 {
		// unlike
		tx.Exec("DELETE FROM comment_likes WHERE comment_id = ? AND email = ?", commentID, req.Email)
		tx.Exec("UPDATE comments SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?", commentID)
		liked = false
	} else {
		// like
		tx.Exec("INSERT INTO comment_likes (comment_id, email) VALUES (?, ?)", commentID, req.Email)
		tx.Exec("UPDATE comments SET like_count = like_count + 1 WHERE id = ?", commentID)
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var likeCount int
	h.db.Get(&likeCount, "SELECT like_count FROM comments WHERE id = ?", commentID)

	c.JSON(http.StatusOK, gin.H{
		"like_count": likeCount,
		"liked":      liked,
	})
}

func (h *CommentHandler) CheckLike(c *gin.Context) {
	commentID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid comment id"})
		return
	}

	email := c.Query("email")
	if email == "" {
		c.JSON(http.StatusOK, gin.H{"liked": false})
		return
	}

	email = strings.ToLower(strings.TrimSpace(email))

	var count int
	h.db.Get(&count, "SELECT COUNT(*) FROM comment_likes WHERE comment_id = ? AND email = ?", commentID, email)

	c.JSON(http.StatusOK, gin.H{"liked": count > 0})
}

// Delete allows removing a comment by email verification (no auth needed)
func (h *CommentHandler) Delete(c *gin.Context) {
	commentID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid comment id"})
		return
	}

	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	var commentEmail string
	err = h.db.Get(&commentEmail, "SELECT email FROM comments WHERE id = ?", commentID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "comment not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if commentEmail != req.Email {
		c.JSON(http.StatusForbidden, gin.H{"error": "email does not match comment author"})
		return
	}

	_, err = h.db.Exec("DELETE FROM comments WHERE id = ?", commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "comment deleted"})
}
