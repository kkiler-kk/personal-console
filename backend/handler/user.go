package handler

import (
	"net/http"

	"blog/config"
	"blog/model"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

type UserHandler struct {
	db *sqlx.DB
}

// NewUserHandler cfg 参数保留仅为签名稳定（router 零改动）；
// 单用户直通后不再读取 JWTSecret（认证基座见 pkg/jwt.go）。
func NewUserHandler(_ *config.Config, db *sqlx.DB) *UserHandler {
	return &UserHandler{db: db}
}

func (h *UserHandler) Profile(c *gin.Context) {
	userID := c.GetInt64("userID")
	var user model.User
	err := h.db.Get(&user, "SELECT id, username, nickname, avatar, bio, created_at FROM users WHERE id = ?", userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	bio := ""
	if user.Bio.Valid {
		bio = user.Bio.String
	}
	c.JSON(http.StatusOK, gin.H{
		"id":         user.ID,
		"username":   user.Username,
		"nickname":   user.Nickname,
		"avatar":     user.Avatar,
		"bio":        bio,
		"created_at": user.CreatedAt,
	})
}

func (h *UserHandler) UpdateProfile(c *gin.Context) {
	userID := c.GetInt64("userID")
	var req struct {
		Nickname string `json:"nickname"`
		Avatar   string `json:"avatar"`
		Bio      string `json:"bio"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := h.db.Exec(
		"UPDATE users SET nickname = ?, avatar = ?, bio = ? WHERE id = ?",
		req.Nickname, req.Avatar, req.Bio, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "profile updated"})
}
