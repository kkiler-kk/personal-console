package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/jmoiron/sqlx"
)

type DashboardHandler struct {
	db        *sqlx.DB
	redis     *redis.Client
	uploadDir string
}

func NewDashboardHandler(db *sqlx.DB, rdb *redis.Client) *DashboardHandler {
	return &DashboardHandler{db: db, redis: rdb, uploadDir: "./uploads"}
}

type dashboardSummary struct {
	PostsTotal         int      `json:"posts_total"`
	CommentsTotal      int      `json:"comments_total"`
	GalleryTotal       int      `json:"gallery_total"`
	PortfolioValue     *float64 `json:"portfolio_value"`
	PortfolioPnl       *float64 `json:"portfolio_pnl"`
	PortfolioPnlPct    *float64 `json:"portfolio_pnl_pct"`
	ReviewDue          int      `json:"review_due"`
	LearnStreak        int      `json:"learn_streak"`
	WorkoutsThisWeek   int      `json:"workouts_this_week"`
	HabitsCheckedToday int      `json:"habits_checked_today"`
	HabitsTotal        int      `json:"habits_total"`
}

func (h *DashboardHandler) Summary(c *gin.Context) {
	const cacheKey = "dashboard:summary"
	if cached, err := h.redis.Get(context.Background(), cacheKey).Result(); err == nil {
		c.Data(http.StatusOK, "application/json", []byte(cached))
		return
	}

	var s dashboardSummary
	if err := h.db.Get(&s.PostsTotal, "SELECT COUNT(*) FROM posts WHERE status = 'published'"); err != nil {
		log.Printf("dashboard: posts count: %v", err)
	}
	if err := h.db.Get(&s.CommentsTotal, "SELECT COUNT(*) FROM comments"); err != nil {
		log.Printf("dashboard: comments count: %v", err)
	}
	// gallery: count image files in uploads dir
	if entries, err := os.ReadDir(h.uploadDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			switch strings.ToLower(filepath.Ext(e.Name())) {
			case ".jpg", ".jpeg", ".png", ".gif", ".webp":
				s.GalleryTotal++
			}
		}
	}
	// tool modules land in phases 2-5; fields stay zero/null until then

	resp, _ := json.Marshal(s)
	h.redis.Set(context.Background(), cacheKey, resp, 60*time.Second)
	c.Data(http.StatusOK, "application/json", resp)
}
