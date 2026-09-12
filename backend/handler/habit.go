package handler

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"blog/model"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/jmoiron/sqlx"
)

// HabitHandler 提供习惯 CRUD、打卡/撤销与年度热力图。
type HabitHandler struct {
	db    *sqlx.DB
	redis *redis.Client
}

// NewHabitHandler 构造 HabitHandler（redis 用于 mutation 后失效 dashboard:summary）。
func NewHabitHandler(db *sqlx.DB, rdb *redis.Client) *HabitHandler {
	return &HabitHandler{db: db, redis: rdb}
}

// habitColumns 是 habits 查询的显式列清单（禁 SELECT *）。
// icon/color 可空列 → IFNULL 兜底，否则 NULL 扫入 plain string 报错（Task 4.1 移交教训）。
const habitColumns = "id, name, IFNULL(icon,'') AS icon, IFNULL(color,'') AS color, archived, created_at"

// HeatmapDay 为热力图中有打卡记录的一天（无记录日不出现，契约：仅 count>0）。
type HeatmapDay struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// bindCheckDate 解析 check/uncheck 请求体：date 缺省 = 今天（Go 本地，禁 CURDATE()）；
// 格式非法 → 400。空 body 视同 {}（忽略 EOF）——date 本身可选。
func bindCheckDate(c *gin.Context) (date string, ok bool) {
	var req struct {
		Date string `json:"date"`
	}
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return "", false
	}
	if req.Date == "" {
		return time.Now().Format("2006-01-02"), true
	}
	if _, err := time.Parse("2006-01-02", req.Date); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date 格式应为 YYYY-MM-DD"})
		return "", false
	}
	return req.Date, true
}

// habitExists 校验习惯是否存在（check/uncheck 打卡前共用）。
func (h *HabitHandler) habitExists(ctx context.Context, id int64) (bool, error) {
	var one int
	err := h.db.GetContext(ctx, &one, "SELECT 1 FROM habits WHERE id = ?", id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// List 返回习惯列表；?all=1 含归档，否则仅未归档。
// 每行附 checked_today（今日是否已打卡，task 4.5）：子查询 + Go 本地今天传参（禁 CURDATE()）；
// 该列为查询产物，model.Habit.CheckedToday 仅在此填充。
func (h *HabitHandler) List(c *gin.Context) {
	today := time.Now().Format("2006-01-02")
	query := "SELECT " + habitColumns +
		", (SELECT COUNT(*) FROM habit_logs hl WHERE hl.habit_id = h.id AND hl.log_date = ?) > 0 AS checked_today" +
		" FROM habits h"
	args := []any{today}
	if c.Query("all") != "1" {
		query += " WHERE h.archived = FALSE"
	}
	query += " ORDER BY h.created_at"

	habits := []model.Habit{}
	if err := h.db.SelectContext(c.Request.Context(), &habits, query, args...); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"habits": habits})
}

// Create 新增习惯；成功后失效 dashboard 缓存（habits_total 变化）。
func (h *HabitHandler) Create(c *gin.Context) {
	var req struct {
		Name  string `json:"name" binding:"required,max=50"`
		Icon  string `json:"icon" binding:"max=16"`
		Color string `json:"color" binding:"max=16"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := h.db.ExecContext(c.Request.Context(),
		"INSERT INTO habits (name, icon, color) VALUES (?, ?, ?)",
		req.Name, req.Icon, req.Color)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	id, _ := res.LastInsertId()
	h.redis.Del(context.Background(), "dashboard:summary")
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// Update 合并语义（沿用 category.go Update 模式）：body 字段全指针，nil 保持原值。
// 存在性以 SELECT 判定（不存在 → 404）：MySQL 同值 UPDATE 返回受影响行数 0，
// 若以 RowsAffected==0 判 404 会把 no-op 更新误判为不存在。
func (h *HabitHandler) Update(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req struct {
		Name     *string `json:"name" binding:"omitempty,max=50"`
		Icon     *string `json:"icon" binding:"omitempty,max=16"`
		Color    *string `json:"color" binding:"omitempty,max=16"`
		Archived *bool   `json:"archived"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var cur struct {
		Name     string `db:"name"`
		Icon     string `db:"icon"`
		Color    string `db:"color"`
		Archived bool   `db:"archived"`
	}
	err = h.db.GetContext(c.Request.Context(), &cur,
		"SELECT name, IFNULL(icon,'') AS icon, IFNULL(color,'') AS color, archived FROM habits WHERE id = ?", id)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "habit not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	name, icon, color, archived := cur.Name, cur.Icon, cur.Color, cur.Archived
	if req.Name != nil {
		name = *req.Name
	}
	if req.Icon != nil {
		icon = *req.Icon
	}
	if req.Color != nil {
		color = *req.Color
	}
	if req.Archived != nil {
		archived = *req.Archived
	}

	if _, err := h.db.ExecContext(c.Request.Context(),
		"UPDATE habits SET name = ?, icon = ?, color = ?, archived = ? WHERE id = ?",
		name, icon, color, archived, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.redis.Del(context.Background(), "dashboard:summary")
	c.JSON(http.StatusOK, gin.H{"message": "habit updated"})
}

// Delete 删除习惯：先删 habit_logs 再删 habits（顺序防孤儿日志）；0 行 → 404。
func (h *HabitHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ctx := c.Request.Context()

	if _, err := h.db.ExecContext(ctx, "DELETE FROM habit_logs WHERE habit_id = ?", id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	res, err := h.db.ExecContext(ctx, "DELETE FROM habits WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "habit not found"})
		return
	}

	h.redis.Del(context.Background(), "dashboard:summary")
	c.JSON(http.StatusOK, gin.H{"message": "habit deleted"})
}

// Check 打卡：body {date?} 缺省今天（Go 本地）；先校验习惯存在 → 404；
// INSERT IGNORE 幂等（复合主键 habit_id+log_date），重复打卡也 200。
func (h *HabitHandler) Check(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	date, ok := bindCheckDate(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()

	exists, err := h.habitExists(ctx, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "habit not found"})
		return
	}

	if _, err := h.db.ExecContext(ctx,
		"INSERT IGNORE INTO habit_logs (habit_id, log_date) VALUES (?, ?)", id, date); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.redis.Del(context.Background(), "dashboard:summary")
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

// Uncheck 撤销打卡：同 Check 参数；先校验习惯存在 → 404；
// DELETE 0 行 → 404 {"error":"no check for that date"}。
func (h *HabitHandler) Uncheck(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	date, ok := bindCheckDate(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()

	exists, err := h.habitExists(ctx, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "habit not found"})
		return
	}

	res, err := h.db.ExecContext(ctx,
		"DELETE FROM habit_logs WHERE habit_id = ? AND log_date = ?", id, date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no check for that date"})
		return
	}

	h.redis.Del(context.Background(), "dashboard:summary")
	c.JSON(http.StatusOK, gin.H{"message": "check removed"})
}

// Heatmap 返回指定年份逐日打卡聚合；?year= 默认当年，clamp 2000..2100。
// 仅有打卡的日期出现（GROUP BY 天然 count>0），无记录 → {days: []}。
func (h *HabitHandler) Heatmap(c *gin.Context) {
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
		LogDate time.Time `db:"log_date"`
		Count   int       `db:"count"`
	}
	if err := h.db.SelectContext(c.Request.Context(), &rows,
		"SELECT log_date, COUNT(*) AS count FROM habit_logs WHERE YEAR(log_date) = ? GROUP BY log_date ORDER BY log_date",
		year); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	days := make([]HeatmapDay, 0, len(rows))
	for _, r := range rows {
		days = append(days, HeatmapDay{Date: r.LogDate.Format("2006-01-02"), Count: r.Count})
	}
	c.JSON(http.StatusOK, gin.H{"days": days})
}

// TodayCounts 返回（今日已打卡习惯数, 未归档习惯总数），供 dashboard Summary 复用。
// 今天口径：Go 本地日期字符串传参（惯例：禁 CURDATE()/INTERVAL）。
// checked 与 total 口径一致：JOIN habits 过滤归档（task 4.5）——归档习惯的历史打卡不计入。
func (h *HabitHandler) TodayCounts(ctx context.Context) (checked int, total int, err error) {
	if err = h.db.GetContext(ctx, &total,
		"SELECT COUNT(*) FROM habits WHERE archived = FALSE"); err != nil {
		return 0, 0, err
	}
	if err = h.db.GetContext(ctx, &checked,
		"SELECT COUNT(DISTINCT hl.habit_id) FROM habit_logs hl "+
			"JOIN habits h ON h.id = hl.habit_id "+
			"WHERE hl.log_date = ? AND h.archived = FALSE",
		time.Now().Format("2006-01-02")); err != nil {
		return 0, 0, err
	}
	return checked, total, nil
}
