package handler

import (
	"context"
	"log"
	"net/http"
	"sort"
	"strconv"
	"time"

	"blog/model"
	"blog/pkg/learn"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/jmoiron/sqlx"
)

// LearnHandler 提供语言档案、学习记录增删、统计与年度日历。
type LearnHandler struct {
	db    *sqlx.DB
	redis *redis.Client
}

// NewLearnHandler 构造 LearnHandler（redis 用于 mutation 后失效 dashboard:summary）。
func NewLearnHandler(db *sqlx.DB, rdb *redis.Client) *LearnHandler {
	return &LearnHandler{db: db, redis: rdb}
}

// validLang 语言白名单（契约：仅 en/es）。
func validLang(s string) bool { return s == "en" || s == "es" }

// validActivity 活动白名单（契约 6 项）。
func validActivity(s string) bool {
	switch s {
	case "vocab", "listening", "speaking", "reading", "grammar", "other":
		return true
	}
	return false
}

// ActivityMinutes 为 by_activity 聚合行。
type ActivityMinutes struct {
	Activity string `json:"activity"`
	Minutes  int    `json:"minutes"`
}

// TodayStats 为今日学习状态（en/es 表示该语言今日是否已有记录）。
type TodayStats struct {
	Minutes    int               `json:"minutes"`
	En         bool              `json:"en"`
	Es         bool              `json:"es"`
	ByActivity []ActivityMinutes `json:"by_activity"`
}

// WeekStats 为最近 7 天（含今天）汇总。
type WeekStats struct {
	Minutes int `json:"minutes"`
	Days    int `json:"days"`
}

// TotalStats 为全量汇总。
type TotalStats struct {
	Minutes  int `json:"minutes"`
	Days     int `json:"days"`
	Sessions int `json:"sessions"`
}

// LangStat 为单语言汇总。
type LangStat struct {
	Minutes int `json:"minutes"`
	Days    int `json:"days"`
}

// ByLangStats 恒含 en/es 两键（无记录语言为 {0,0}，不缺键）。
type ByLangStats struct {
	En LangStat `json:"en"`
	Es LangStat `json:"es"`
}

// DayMinutes 为单日分钟数（recent/calendar 共用日期形态）。
type DayMinutes struct {
	Date    string `json:"date"`
	Minutes int    `json:"minutes"`
}

// LearnStats 为 /api/learn/stats 响应体（json tag 与契约速查逐字一致），
// 亦供 dashboard Summary 复用（StatsData 导出）。
type LearnStats struct {
	Streak int          `json:"streak"`
	Today  TodayStats   `json:"today"`
	Week   WeekStats    `json:"week"`
	Total  TotalStats   `json:"total"`
	ByLang ByLangStats  `json:"by_lang"`
	Recent []DayMinutes `json:"recent"`
}

// CalendarDay 为年度日历中有记录的一天（无记录日不出现）。
type CalendarDay struct {
	Date    string   `json:"date"`
	Minutes int      `json:"minutes"`
	Langs   []string `json:"langs"`
}

// profileColumns 是 language_profiles 查询的显式列清单（禁 SELECT *）。
// goal/note 可空 → IFNULL 兜底；updated_at TIMESTAMP 技术可空（3.1 审查提示）→ 同样兜底。
// 兜底值用 ? 传 Go 本地 time.Now()（task 4.5 时区收敛）：CURRENT_TIMESTAMP 走 MySQL
// 服务器时区，与应用层 Go 本地口径可能漂移（同「禁 CURDATE()」惯例）。
const profileColumns = "id, lang, level, IFNULL(goal,'') AS goal, IFNULL(note,'') AS note, IFNULL(updated_at, ?) AS updated_at"

// Profiles 返回已有档案行（契约：仅已有行，缺失语言由前端渲染空卡）。
func (h *LearnHandler) Profiles(c *gin.Context) {
	profiles := []model.LanguageProfile{}
	err := h.db.SelectContext(c.Request.Context(), &profiles,
		"SELECT "+profileColumns+" FROM language_profiles ORDER BY lang", time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"profiles": profiles})
}

// UpdateProfile upsert 指定语言的档案；lang 白名单外 → 400。
func (h *LearnHandler) UpdateProfile(c *gin.Context) {
	lang := c.Param("lang")
	if !validLang(lang) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid lang"})
		return
	}

	var req struct {
		Level string `json:"level" binding:"required,max=50"`
		Goal  string `json:"goal" binding:"max=500"`
		Note  string `json:"note" binding:"max=500"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := h.db.ExecContext(c.Request.Context(),
		`INSERT INTO language_profiles (lang, level, goal, note) VALUES (?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE level=VALUES(level), goal=VALUES(goal), note=VALUES(note)`,
		lang, req.Level, req.Goal, req.Note)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "profile updated"})
}

// Sessions 返回学习记录列表（管理后台学习记录页数据源，Task S1）。
// ?limit= 默认 100，clamp 1..200，非法值 400（同 Calendar 的 year 惯例）；
// total 为全表 COUNT(*)（不受 limit 影响）。note 可空 → IFNULL 兜底
// （同 profileColumns 惯例）；session_date/created_at NOT NULL/有默认值，直接选。
func (h *LearnHandler) Sessions(c *gin.Context) {
	limit := 100
	if l := c.Query("limit"); l != "" {
		parsed, err := strconv.Atoi(l)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid limit"})
			return
		}
		limit = parsed
	}
	if limit < 1 {
		limit = 1
	}
	if limit > 200 {
		limit = 200
	}

	var total int
	if err := h.db.GetContext(c.Request.Context(), &total,
		"SELECT COUNT(*) FROM study_sessions"); err != nil {
		log.Printf("learn: sessions count: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	sessions := []model.StudySession{}
	if err := h.db.SelectContext(c.Request.Context(), &sessions,
		"SELECT id, lang, activity, minutes, session_date, IFNULL(note,'') AS note, created_at FROM study_sessions ORDER BY session_date DESC, id DESC LIMIT ?",
		limit); err != nil {
		log.Printf("learn: sessions: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sessions": sessions, "total": total})
}

// CreateSession 记录一次学习；date 缺省 = 今天（Go 本地），禁未来日期（task 4.5），
// 成功后失效 dashboard 缓存。
func (h *LearnHandler) CreateSession(c *gin.Context) {
	var req struct {
		Lang     string `json:"lang" binding:"required"`
		Activity string `json:"activity" binding:"required"`
		// minutes 上限 14400（=24h，task 4.5）：防手滑超大值污染统计
		Minutes int    `json:"minutes" binding:"gte=0,lte=14400"`
		Date    string `json:"date"`
		Note    string `json:"note" binding:"max=200"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !validLang(req.Lang) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid lang"})
		return
	}
	if !validActivity(req.Activity) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid activity"})
		return
	}

	// 日期口径：Go 本地 time.Now()，禁 MySQL CURDATE()（阶段 2 I-3 教训）
	today := time.Now().Format("2006-01-02")
	date := req.Date
	if date == "" {
		date = today
	} else if _, err := time.Parse("2006-01-02", date); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date 格式应为 YYYY-MM-DD"})
		return
	}
	if date > today { // YYYY-MM-DD 字典序即时间序
		c.JSON(http.StatusBadRequest, gin.H{"error": "date 不能晚于今天"})
		return
	}

	res, err := h.db.ExecContext(c.Request.Context(),
		"INSERT INTO study_sessions (lang, activity, minutes, session_date, note) VALUES (?, ?, ?, ?, ?)",
		req.Lang, req.Activity, req.Minutes, date, req.Note)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	id, _ := res.LastInsertId()
	h.redis.Del(context.Background(), "dashboard:summary")
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// DeleteSession 删除一条学习记录；0 行受影响 → 404；成功后失效 dashboard 缓存。
func (h *LearnHandler) DeleteSession(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	res, err := h.db.ExecContext(c.Request.Context(), "DELETE FROM study_sessions WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}
	h.redis.Del(context.Background(), "dashboard:summary")
	c.JSON(http.StatusOK, gin.H{"message": "session deleted"})
}

// StatsData 聚合学习统计（/api/learn/stats 与 dashboard Summary 复用）。
// 所有"今天/本周/近28天"边界一律 Go 本地日期字符串传参（禁 CURDATE()/INTERVAL）。
func (h *LearnHandler) StatsData(ctx context.Context) (*LearnStats, error) {
	now := time.Now()
	today := now.Format("2006-01-02")
	stats := &LearnStats{
		Today:  TodayStats{ByActivity: []ActivityMinutes{}},
		Recent: []DayMinutes{},
	}

	// streak：全部 distinct 日期交给纯函数。DATE 列经 DSN loc=Local 扫出本地午夜，
	// 与 now 同口径（Task 3.2 移交备注已确认）。
	var dates []time.Time
	if err := h.db.SelectContext(ctx, &dates,
		"SELECT DISTINCT session_date FROM study_sessions"); err != nil {
		return nil, err
	}
	stats.Streak = learn.ComputeStreak(dates, now)

	// today：拉当日明细，Go 内聚合（分钟、语言打卡、按活动降序）
	var todayRows []struct {
		Lang     string `db:"lang"`
		Activity string `db:"activity"`
		Minutes  int    `db:"minutes"`
	}
	if err := h.db.SelectContext(ctx, &todayRows,
		"SELECT lang, activity, minutes FROM study_sessions WHERE session_date = ?", today); err != nil {
		return nil, err
	}
	byActivity := map[string]int{}
	for _, r := range todayRows {
		stats.Today.Minutes += r.Minutes
		switch r.Lang {
		case "en":
			stats.Today.En = true
		case "es":
			stats.Today.Es = true
		}
		byActivity[r.Activity] += r.Minutes
	}
	for activity, minutes := range byActivity {
		stats.Today.ByActivity = append(stats.Today.ByActivity,
			ActivityMinutes{Activity: activity, Minutes: minutes})
	}
	sort.Slice(stats.Today.ByActivity, func(i, j int) bool {
		a, b := stats.Today.ByActivity[i], stats.Today.ByActivity[j]
		if a.Minutes != b.Minutes {
			return a.Minutes > b.Minutes
		}
		return a.Activity < b.Activity // 同分钟按名称，输出稳定
	})

	// week：最近 7 天含今天
	weekStart := now.AddDate(0, 0, -6).Format("2006-01-02")
	var week struct {
		Minutes int `db:"minutes"`
		Days    int `db:"days"`
	}
	if err := h.db.GetContext(ctx, &week,
		"SELECT IFNULL(SUM(minutes),0) AS minutes, COUNT(DISTINCT session_date) AS days FROM study_sessions WHERE session_date >= ? AND session_date <= ?",
		weekStart, today); err != nil {
		return nil, err
	}
	stats.Week = WeekStats{Minutes: week.Minutes, Days: week.Days}

	// total：全量
	var total struct {
		Minutes  int `db:"minutes"`
		Days     int `db:"days"`
		Sessions int `db:"sessions"`
	}
	if err := h.db.GetContext(ctx, &total,
		"SELECT IFNULL(SUM(minutes),0) AS minutes, COUNT(DISTINCT session_date) AS days, COUNT(*) AS sessions FROM study_sessions"); err != nil {
		return nil, err
	}
	stats.Total = TotalStats{Minutes: total.Minutes, Days: total.Days, Sessions: total.Sessions}

	// by_lang：en/es 恒输出，无记录语言保持零值 {0,0}
	var langRows []struct {
		Lang    string `db:"lang"`
		Minutes int    `db:"minutes"`
		Days    int    `db:"days"`
	}
	if err := h.db.SelectContext(ctx, &langRows,
		"SELECT lang, IFNULL(SUM(minutes),0) AS minutes, COUNT(DISTINCT session_date) AS days FROM study_sessions GROUP BY lang"); err != nil {
		return nil, err
	}
	for _, r := range langRows {
		switch r.Lang {
		case "en":
			stats.ByLang.En = LangStat{Minutes: r.Minutes, Days: r.Days}
		case "es":
			stats.ByLang.Es = LangStat{Minutes: r.Minutes, Days: r.Days}
		}
	}

	// recent：近 28 天含今天，Go 内铺满逐日（无记录日 minutes=0），升序
	recentStart := now.AddDate(0, 0, -27).Format("2006-01-02")
	var recentRows []struct {
		Date    time.Time `db:"d"`
		Minutes int       `db:"m"`
	}
	if err := h.db.SelectContext(ctx, &recentRows,
		"SELECT session_date AS d, IFNULL(SUM(minutes),0) AS m FROM study_sessions WHERE session_date >= ? AND session_date <= ? GROUP BY session_date",
		recentStart, today); err != nil {
		return nil, err
	}
	byDate := make(map[string]int, len(recentRows))
	for _, r := range recentRows {
		byDate[r.Date.Format("2006-01-02")] = r.Minutes
	}
	for i := 27; i >= 0; i-- {
		d := now.AddDate(0, 0, -i).Format("2006-01-02")
		stats.Recent = append(stats.Recent, DayMinutes{Date: d, Minutes: byDate[d]})
	}

	return stats, nil
}

// Stats 返回学习统计（200 LearnStats）。
func (h *LearnHandler) Stats(c *gin.Context) {
	stats, err := h.StatsData(c.Request.Context())
	if err != nil {
		log.Printf("learn: stats: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// Calendar 返回指定年份有记录的日期聚合；?year= 默认当年，clamp 2000..2100。
func (h *LearnHandler) Calendar(c *gin.Context) {
	year := time.Now().Year()
	if y := c.Query("year"); y != "" {
		parsed, err := strconv.Atoi(y)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid year"})
			return
		}
		year = parsed
	}
	if year < 2000 {
		year = 2000
	}
	if year > 2100 {
		year = 2100
	}

	var rows []struct {
		SessionDate time.Time `db:"session_date"`
		Lang        string    `db:"lang"`
		Minutes     int       `db:"minutes"`
	}
	if err := h.db.SelectContext(c.Request.Context(), &rows,
		"SELECT session_date, lang, minutes FROM study_sessions WHERE YEAR(session_date) = ? ORDER BY session_date",
		year); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	days := []CalendarDay{}
	index := map[string]int{}
	for _, r := range rows {
		date := r.SessionDate.Format("2006-01-02")
		i, ok := index[date]
		if !ok {
			i = len(days)
			index[date] = i
			days = append(days, CalendarDay{Date: date, Langs: []string{}})
		}
		days[i].Minutes += r.Minutes
		dup := false
		for _, l := range days[i].Langs {
			if l == r.Lang {
				dup = true
				break
			}
		}
		if !dup {
			days[i].Langs = append(days[i].Langs, r.Lang)
		}
	}
	for i := range days {
		sort.Strings(days[i].Langs)
	}
	c.JSON(http.StatusOK, gin.H{"days": days})
}
