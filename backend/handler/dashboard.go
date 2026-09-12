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
	invest    *InvestHandler
	learn     *LearnHandler
	habit     *HabitHandler
}

func NewDashboardHandler(db *sqlx.DB, rdb *redis.Client, invest *InvestHandler, learn *LearnHandler, habit *HabitHandler) *DashboardHandler {
	return &DashboardHandler{db: db, redis: rdb, uploadDir: "./uploads", invest: invest, learn: learn, habit: habit}
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
	StudyMinutesToday  int      `json:"study_minutes_today"`
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
	// invest portfolio: reuse live positions computation (Task 2.5).
	// On error keep the three fields nil; other summary fields unaffected.
	// Note: quotes failure does NOT error here (fallback prices), so fields
	// may carry Stale-priced values.
	if pos, err := h.invest.ComputePositionsResponse(c.Request.Context()); err != nil {
		log.Printf("dashboard: positions unavailable: %v", err)
	} else if len(pos.Positions) > 0 {
		v := pos.Summary.TotalValueCNY
		pnl := pos.Summary.TotalPnlCNY
		pct := pos.Summary.TotalPnlPct
		s.PortfolioValue = &v
		s.PortfolioPnl = &pnl
		s.PortfolioPnlPct = &pct
	}
	// learn: streak / review_due / 今日学习分钟数（Task 3.3）。
	// StatsData 失败仅 log，三字段保持零值，不影响其他字段。
	if st, err := h.learn.StatsData(c.Request.Context()); err != nil {
		log.Printf("dashboard: learn stats unavailable: %v", err)
	} else {
		due := 0
		if !st.Today.En {
			due++
		}
		if !st.Today.Es {
			due++
		}
		s.ReviewDue = due
		s.LearnStreak = st.Streak
		s.StudyMinutesToday = st.Today.Minutes
	}
	// habit: 今日打卡数 / 未归档习惯总数（Task 4.2）。
	// TodayCounts 失败仅 log，两字段保持零值，不影响其他字段。
	if checked, total, err := h.habit.TodayCounts(c.Request.Context()); err != nil {
		log.Printf("dashboard: habit counts unavailable: %v", err)
	} else {
		s.HabitsCheckedToday = checked
		s.HabitsTotal = total
	}

	resp, _ := json.Marshal(s)
	h.redis.Set(context.Background(), cacheKey, resp, 60*time.Second)
	c.Data(http.StatusOK, "application/json", resp)
}
