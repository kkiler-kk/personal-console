# 阶段 3：学习模块（阶段档案 + 时长统计）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付学习模块：英语/西班牙语阶段档案（可编辑）、学习时长记录（分活动类型：背单词/听力/口语/阅读/语法/其他）、统计（今日/本周/累计/连续天数/近 28 天趋势/年度日历）、Dashboard「今日学习」分钟数实数据、冒烟第 9 步。

**Architecture:** 后端新增 `pkg/learn`（streak 纯函数 TDD）、`handler/learn.go`（profiles/sessions/stats/calendar）、两张表（language_profiles/study_sessions）；dashboard summary 填充 `learn_streak`/`review_due` 并**新增字段** `study_minutes_today`（schema 只增不改）。前端替换 /learn 占位页（阶段卡+记录对话框+统计+28 天柱状图+年度日历），Dashboard「今日学习」卡接分钟数。

**Tech Stack:** Go 1.22 + Gin + sqlx + MySQL（无新依赖）；React 19 + TS strict + TanStack Query + Recharts + shadcn/radix-nova。

**Spec:** `docs/superpowers/specs/2026-09-12-personal-site-redesign-design.md` §6（09-13 修订版）、§3.1、§5、§9

## Global Constraints

- 全部新 API 挂 JWT protected 组；错误 `{"error": "..."}`；迁移幂等（IF NOT EXISTS）
- **Dashboard schema 只增不改**：既有 11 字段名/类型不变；`learn_streak` = 连续学习天数（任一语言有记录即算）；`review_due` = 今日尚未学习的语言数（0-2）；**新增** `study_minutes_today int` = 今日总分钟（json tag `study_minutes_today`，加在 dashboardSummary 结构体末尾）
- streak 纯函数 TDD（Go 单测）；lang 白名单 en/es；activity 白名单 vocab/listening/speaking/reading/grammar/other
- TEXT/VARCHAR 可空列查询侧一律 `IFNULL(col,'') AS col`，禁 SELECT * 扫 string 字段（仓库惯例）
- 日期口径：session_date 为 DATE 列；"今天"一律用 Go 侧 `time.Now()` 本地日期格式化为 "2006-01-02" 传参（不用 MySQL CURDATE()，避免容器 UTC 与应用时区分裂——阶段 2 I-3 教训）
- mutation 后 DEL Redis "dashboard:summary"
- 前端惯例：strict、e:unknown+instanceof ApiError、`?? []` 兜底、tnum、mutation toast+invalidate、卡片阴影 shadow-[0_1px_3px_rgba(0,0,0,.06)]
- 进程 PID 精确 kill 严禁 pkill；git add 显式路径严禁仓库根 add -A；smoketest/Smoke#2026；conventional commits
- 8080 可能被用户后端占用：需要全栈验证时用 PORT=8090 做 API 级验证；全栈冒烟若 8080 被占报控制器协调，不杀用户进程

## API 契约速查（与本计划 handler 代码严格一致）

```
GET    /api/learn/profiles        → 200 {profiles: LanguageProfile[]}（仅已有行；前端对缺失语言渲染空卡）
PUT    /api/learn/profiles/:lang  → 200 {message}  body {level, goal?, note?}；lang 非 en/es → 400
POST   /api/learn/sessions        → 201 {id}       body {lang, activity, minutes, date?, note?}
                                    date 默认今天(Go 本地)；minutes 整数 >=0（0=纯打卡）；activity 白名单外 → 400
DELETE /api/learn/sessions/:id    → 200 {message} | 404
GET    /api/learn/stats           → 200 LearnStats（见下）
GET    /api/learn/calendar?year=  → 200 {days:[{date:"2006-01-02", minutes:int, langs:["en","es"]}]}（year 默认当年 clamp 2000..2100；仅返回有记录的日期）

LanguageProfile = {id, lang, level, goal, note, updated_at}
LearnStats = {
  streak: int,
  today: { minutes: int, en: bool, es: bool, by_activity: [{activity: string, minutes: int}] },
  week:  { minutes: int, days: int },          // 本周=最近7天(含今天)
  total: { minutes: int, days: int, sessions: int },
  by_lang: { en: {minutes:int, days:int}, es: {minutes:int, days:int} },
  recent: [{date:"2006-01-02", minutes:int}]   // 近28天逐日，升序，无记录日 minutes=0 也要出现
}
Dashboard 联动：learn_streak=streak；review_due=2-(today.en+today.es)；study_minutes_today=today.minutes
```

## 文件结构

```
backend/
├── pkg/learn/streak.go + streak_test.go    streak 纯函数（Task 3.2）
├── handler/learn.go                        6 端点（Task 3.3）
├── handler/dashboard.go                    learn 字段填充 + StudyMinutesToday（Task 3.3）
├── model/model.go                          LanguageProfile/StudySession（Task 3.1）
├── cmd/migrate.go                          两张表（Task 3.1）
└── router/router.go                        挂载（Task 3.3）
frontend/src/
├── lib/types.ts / lib/api.ts               learn 类型与端点（Task 3.4）
├── components/charts/MinutesBar.tsx        近28天分钟柱状图（Task 3.4）
├── pages/learn/LearnPage.tsx               主页面（Task 3.4）
├── pages/learn/SessionDialog.tsx           记录学习对话框（Task 3.4）
├── pages/learn/ProfileDialog.tsx           阶段档案编辑对话框（Task 3.4）
├── pages/learn/StudyCalendar.tsx           年度日历（Task 3.4）
├── pages/Dashboard.tsx                     今日学习卡（Task 3.4）
├── App.tsx                                 /learn 替换（Task 3.4）
└── scripts/smoke.mjs                       第 9 步（Task 3.5）
```

---

### Task 3.1: 数据模型 + 迁移

**Files:** Modify `backend/cmd/migrate.go`、`backend/model/model.go`

**Interfaces:**
- Produces: 表 `language_profiles`/`study_sessions`；`model.LanguageProfile{ID int64 `json:"id"`, Lang, Level, Goal, Note string, UpdatedAt time.Time}`（json/db tag 对应 id,lang,level,goal,note,updated_at）；`model.StudySession{ID int64, Lang string, Activity string, Minutes int, SessionDate time.Time, Note string, CreatedAt time.Time}`（json: id,lang,activity,minutes,session_date,note,created_at）

- [ ] **Step 1: migrate.go 建表循环追加（照既有风格含 ENGINE 后缀）**

```sql
CREATE TABLE IF NOT EXISTS language_profiles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  lang VARCHAR(8) NOT NULL UNIQUE,
  level VARCHAR(50) NOT NULL DEFAULT '',
  goal TEXT,
  note TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS study_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  lang VARCHAR(8) NOT NULL,
  activity VARCHAR(20) NOT NULL DEFAULT 'other',
  minutes INT NOT NULL DEFAULT 0,
  session_date DATE NOT NULL,
  note VARCHAR(200),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_session_date (session_date),
  KEY idx_lang_date (lang, session_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: model.go 追加两个结构体**（Goal/Note 用 string，查询侧 IFNULL 兜底）

- [ ] **Step 3: 验证** `go build ./... && go vet ./...`；docker 起着，后端两次启动幂等（记 PID 精确 kill）；`SHOW TABLES LIKE 'language_profiles'/'study_sessions'` + `SHOW CREATE TABLE study_sessions` 核对索引

- [ ] **Step 4: Commit** `feat(backend): language_profiles and study_sessions schema`

### Task 3.2: streak 纯函数（TDD）

**Files:** Create `backend/pkg/learn/streak.go`、`backend/pkg/learn/streak_test.go`

**Interfaces:**
- Produces:

```go
package learn

// ComputeStreak 计算连续学习天数。dates 为有学习记录的日期集合（可含重复/多语言/带时分秒，
// 内部按日期部分去重），today 为当前本地日期。语义：今天有记录 → 从今天往回数连续天数；
// 今天没有但昨天有 → 从昨天往回数（宽限：streak 不因今天还没学而清零）；今昨都无 → 0。
func ComputeStreak(dates []time.Time, today time.Time) int
```

- [ ] **Step 1: 先写测试（RED）——6 个用例**

```go
package learn

import (
	"testing"
	"time"
)

func d(s string) time.Time {
	t, err := time.ParseInLocation("2006-01-02", s, time.Local)
	if err != nil {
		panic(err)
	}
	return t
}

func TestStreakIncludingToday(t *testing.T) {
	got := ComputeStreak([]time.Time{d("2026-09-11"), d("2026-09-12"), d("2026-09-13")}, d("2026-09-13"))
	if got != 3 {
		t.Fatalf("got %d", got)
	}
}

func TestStreakGraceYesterday(t *testing.T) {
	got := ComputeStreak([]time.Time{d("2026-09-11"), d("2026-09-12")}, d("2026-09-13"))
	if got != 2 {
		t.Fatalf("got %d", got)
	}
}

func TestStreakBroken(t *testing.T) {
	got := ComputeStreak([]time.Time{d("2026-09-09"), d("2026-09-11")}, d("2026-09-13"))
	if got != 0 {
		t.Fatalf("got %d", got)
	}
}

func TestStreakEmpty(t *testing.T) {
	if got := ComputeStreak(nil, d("2026-09-13")); got != 0 {
		t.Fatalf("got %d", got)
	}
}

func TestStreakDedupAndTimePart(t *testing.T) {
	// 同日多语言/多条记录算一天；带时分秒取日期部分
	got := ComputeStreak([]time.Time{
		d("2026-09-12"), d("2026-09-12"),
		d("2026-09-13").Add(8 * time.Hour),
	}, d("2026-09-13"))
	if got != 2 {
		t.Fatalf("got %d", got)
	}
}

func TestStreakLongRun(t *testing.T) {
	var dates []time.Time
	for i := 0; i < 30; i++ {
		dates = append(dates, d("2026-09-13").AddDate(0, 0, -i))
	}
	if got := ComputeStreak(dates, d("2026-09-13")); got != 30 {
		t.Fatalf("got %d", got)
	}
}
```

- [ ] **Step 2:** `cd backend && go test ./pkg/learn/ -v` → FAIL（undefined: ComputeStreak）
- [ ] **Step 3: 实现**

```go
package learn

import "time"

func dayKey(t time.Time) string { return t.Format("2006-01-02") }

func ComputeStreak(dates []time.Time, today time.Time) int {
	set := make(map[string]bool, len(dates))
	for _, dt := range dates {
		set[dayKey(dt)] = true
	}
	cursor := today
	if !set[dayKey(cursor)] {
		cursor = cursor.AddDate(0, 0, -1) // 宽限：今天未学从昨天起算
		if !set[dayKey(cursor)] {
			return 0
		}
	}
	streak := 0
	for set[dayKey(cursor)] {
		streak++
		cursor = cursor.AddDate(0, 0, -1)
	}
	return streak
}
```

- [ ] **Step 4:** `go test ./pkg/learn/ -v` → 6/6 PASS；`go build ./... && go vet ./...`
- [ ] **Step 5: Commit** `feat(backend): study streak pure function with unit tests`

### Task 3.3: learn handler + dashboard 填充 + 路由

**Files:** Create `backend/handler/learn.go`；Modify `backend/handler/dashboard.go`、`backend/router/router.go`

**Interfaces:**
- Consumes: `learn.ComputeStreak`、model.LanguageProfile/StudySession、DashboardHandler 现有结构（已含 invest 注入）
- Produces: 契约速查 6 端点；dashboardSummary 新增字段 `StudyMinutesToday int `json:"study_minutes_today"``（结构体末尾追加）并填充三字段；`LearnHandler.StatsData(ctx) (*LearnStats, error)` 导出（dashboard 复用），LearnStats 为与契约一致的导出结构体

- [ ] **Step 1: handler/learn.go 完整实现（逻辑规格，写成仓库 handler 风格的完整 Go 代码）**

```go
// LearnHandler{db *sqlx.DB}；NewLearnHandler(db) *LearnHandler
// 白名单: validLang(s) en|es；validActivity(s) vocab|listening|speaking|reading|grammar|other

// Profiles: SELECT id, lang, level, IFNULL(goal,'') AS goal, IFNULL(note,'') AS note, updated_at
//           FROM language_profiles ORDER BY lang → {profiles}（无行返回 []）
// UpdateProfile: :lang 白名单 400；body {level binding:required,max=50; goal max=500; note max=500}
//   INSERT ... ON DUPLICATE KEY UPDATE level=VALUES(level), goal=VALUES(goal), note=VALUES(note)
//   → {message:"profile updated"}
// CreateSession: body {lang 白名单, activity 白名单, minutes binding:gte=0, date 可选 "2006-01-02", note max=200}
//   date 缺省 = time.Now().Format("2006-01-02")（Go 本地，全局约束）；非法格式 400
//   INSERT INTO study_sessions (lang, activity, minutes, session_date, note) VALUES (?,?,?,?,?)
//   → 201 {id}；DEL "dashboard:summary"
// DeleteSession: :id DELETE；0 行 404；成功 DEL "dashboard:summary" → {message}
// StatsData(ctx) (*LearnStats, error):
//   today := time.Now().Format("2006-01-02")
//   streak: SELECT DISTINCT session_date FROM study_sessions → ComputeStreak(dates, time.Now())
//   today.minutes/en/es/by_activity: SELECT lang, activity, minutes FROM study_sessions WHERE session_date=?
//     → Go 内聚合（by_activity 按 activity 聚合，按 minutes 降序；en/es = 是否存在该 lang 行）
//   week: SELECT IFNULL(SUM(minutes),0), COUNT(DISTINCT session_date) FROM study_sessions
//         WHERE session_date >= ?(today-6d) AND session_date <= ?(today)
//   total: SELECT IFNULL(SUM(minutes),0), COUNT(DISTINCT session_date), COUNT(*) FROM study_sessions
//   by_lang: SELECT lang, IFNULL(SUM(minutes),0), COUNT(DISTINCT session_date) FROM study_sessions GROUP BY lang
//   recent: SELECT session_date, IFNULL(SUM(minutes),0) AS m FROM study_sessions
//           WHERE session_date >= ?(today-27d) AND session_date <= ? GROUP BY session_date
//     → Go 内铺满 28 天（无记录日 minutes=0），升序
// Stats(c): StatsData → 200；err → 500 log
// Calendar(c): ?year= 默认当年 clamp 2000..2100
//   SELECT session_date, lang, minutes FROM study_sessions WHERE YEAR(session_date)=? ORDER BY session_date
//   → Go 聚合 {days:[{date, minutes(当日总和), langs(去重升序)}]}（无记录日不出现）
```

- [ ] **Step 2: dashboard.go**

```go
// dashboardSummary 结构体末尾追加: StudyMinutesToday int `json:"study_minutes_today"`
// DashboardHandler 增加 learn *LearnHandler 字段（NewDashboardHandler 加参，router 同步、lh 在 dh 前构造）
// Summary 填充:
if st, err := h.learn.StatsData(c.Request.Context()); err != nil {
	log.Printf("dashboard: learn stats unavailable: %v", err) // 保持零值，不影响其他字段
} else {
	due := 0
	if !st.Today.En { due++ }
	if !st.Today.Es { due++ }
	s.ReviewDue = due
	s.LearnStreak = st.Streak
	s.StudyMinutesToday = st.Today.Minutes
}
```

- [ ] **Step 3: router.go 挂载**

```go
lh := handler.NewLearnHandler(db)
// protected 组:
protected.GET("/learn/profiles", lh.Profiles)
protected.PUT("/learn/profiles/:lang", lh.UpdateProfile)
protected.POST("/learn/sessions", lh.CreateSession)
protected.DELETE("/learn/sessions/:id", lh.DeleteSession)
protected.GET("/learn/stats", lh.Stats)
protected.GET("/learn/calendar", lh.Calendar)
// dh := handler.NewDashboardHandler(db, rdb, ih, lh)
```

- [ ] **Step 4: 验证（curl 全链路，PORT=8090，smoketest/Smoke#2026）**
  1. PUT profiles/en {level:"中级 B1"} → GET profiles 含该行；PUT profiles/xx → 400
  2. POST sessions {lang:"en",activity:"vocab",minutes:60} → 201；{activity:"listening",minutes:60} → 201；{activity:"swimming"} → 400；{minutes:-5} → 400
  3. GET stats → today.minutes=120、by_activity 两项各 60、today.en=true es=false、streak>=1、recent 长度 28 且今日=120
  4. DEL dashboard:summary → GET summary → study_minutes_today=120、learn_streak>=1、review_due=1
  5. POST es 一条 → review_due=0
  6. GET calendar?year=当年 → 今天 minutes=120+ langs=["en","es"]
  7. DELETE session ×3（含一次不存在 id → 404）→ stats 归零、DEL dashboard:summary
  8. `go build/vet && go test ./...` 全绿（learn 6 + portfolio 10 + quote 26 无回归）

- [ ] **Step 5: Commit** `feat(backend): learn API — profiles, sessions, stats, calendar`

### Task 3.4: 前端 /learn 页面 + Dashboard 接线

**Files:** Modify `frontend/src/lib/types.ts`、`frontend/src/lib/api.ts`、`frontend/src/pages/Dashboard.tsx`、`frontend/src/App.tsx`；Create `frontend/src/components/charts/MinutesBar.tsx`、`frontend/src/pages/learn/{LearnPage,SessionDialog,ProfileDialog,StudyCalendar}.tsx`

**Interfaces:**
- Consumes: 契约速查；ui 组件（radix-nova 用前 grep 导出）；Recharts
- Produces: types 新增 `LanguageProfile{...}`、`ActivityType="vocab"|"listening"|"speaking"|"reading"|"grammar"|"other"`、`LearnStats`（与契约逐字段，today.by_activity 数组、recent 数组）、`CalendarDay{date,minutes,langs}`；api 新增 6 端点；`<MinutesBar data={{date,minutes}[]} height? />`；DashboardSummary 类型加 `study_minutes_today: number`
- ACTIVITY_LABELS 常量（learn 页面与对话框共用）：`{vocab:"背单词", listening:"听力", speaking:"口语", reading:"阅读", grammar:"语法", other:"其他"}`，放 `frontend/src/pages/learn/constants.ts`

- [ ] **Step 1: types/api 追加（逐字按契约，snake_case）**；DashboardSummary 接口追加 `study_minutes_today: number`

- [ ] **Step 2: MinutesBar.tsx（近 28 天分钟柱状图）**

```tsx
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

export function MinutesBar({ data, height = 180 }: { data: { date: string; minutes: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "currentColor" }} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
        <YAxis tick={{ fontSize: 11, fill: "currentColor" }} width={56} unit="m" />
        <Tooltip formatter={(v) => [`${v} 分钟`, "时长"]} labelFormatter={(l) => `日期 ${l}`} />
        <Bar dataKey="minutes" fill="#4f46e5" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 3: LearnPage.tsx 结构要求（完整实现按仓库页面惯例）**
  - 顶行：streak 横幅卡（大数字「连续 N 天」+ 本周 X 分钟/Y 天 + 累计 Z 小时（minutes/60 取整）W 天）+ 右侧「记录学习」主按钮（开 SessionDialog）
  - 今日卡：今日总分钟（tnum 大数字）+ by_activity 芯片列表（ACTIVITY_LABELS 中文名 + 分钟）+ 英/西今日状态点（学了✓主色/未学灰）
  - 两张语言阶段卡（grid sm:2）：flag+名称（英语🇬🇧/西班牙语🇪🇸）、level（空→"未设置"灰字）、goal/note 摘要两行截断、「编辑」按钮开 ProfileDialog、「快速打卡」按钮（POST sessions {lang, activity:"other", minutes:0}，今日已学则该按钮变"已打卡✓"禁用态）
  - MinutesBar 卡（近 28 天，data=stats.recent）
  - StudyCalendar 卡（年度日历，跨年切换 ← year →）
  - 今日明细列表：今天的 sessions（时间类型分钟 note + 删除按钮带 AlertDialog）——数据来自新查询 ["learn-sessions-today"]（GET stats 不含明细，故加一个前端专用查询：复用 getLearnCalendar? 不行——**新增 api.getLearnSessions(date)**？契约没有该端点。**简化裁决**：今日明细不单独列表，by_activity 芯片已表达构成；删除入口放在日历格点击弹当日明细？**再简化**：本期不做逐条删除 UI（后端端点已备），删除走 Admin 或后续迭代——页面注明即可。实现者不再加端点、不做明细列表，保持 YAGNI
  - 查询键：["learn-profiles"] ["learn-stats"] ["learn-calendar", year]；SessionDialog/ProfileDialog/快速打卡 mutation 成功 → invalidate 三键 + ["dashboard"]
- [ ] **Step 4: SessionDialog.tsx**：语言 Select(en/es)、类型 Select(六类中文标签)、分钟 number（>=0，常用快捷 chip：15/30/60/90 点击填入）、日期 input type=date 默认今天、note 可选；提交 api.createLearnSession；错误 toast 后端文案
- [ ] **Step 5: ProfileDialog.tsx**：level/goal/note 三字段（level 必填 max50）；PUT upsert；props {lang, initial, onSaved}
- [ ] **Step 6: StudyCalendar.tsx**：12 个月网格（每月标题 + 周一起始 7 列；日期格按 minutes 分档着色：0 无、1-29 bg-primary/25、30-59 bg-primary/50、60+ bg-primary，今天 ring-1 ring-primary；格 title 提示 "9月13日 · 120 分钟 · en,es"）；数据 days 数组转 map；月格尺寸移动端自适应（grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 的月卡片布局）
- [ ] **Step 7: Dashboard「今日学习」卡**：value `data.study_minutes_today ? `${data.study_minutes_today} 分钟` : "—"`；sub `data.learn_streak > 0 ? `连续 ${data.learn_streak} 天` : "今天还没学习"`；href="/learn"；「阶段 3 上线」文案删除
- [ ] **Step 8: App.tsx** /learn 的 PagePlaceholder 替换为 `<LearnPage />`；清理不再使用的 import（PagePlaceholder 若无其他路由使用则连同 /learn 占位一起处理——**注意 /learn 是最后一个占位路由，替换后 PagePlaceholder 仅剩 404 使用，保留组件**）
- [ ] **Step 9: 验证** tsc×2 + build 零错误；curl 造数据（8090 后端）→ dev 3001 /learn HTML 200；数据形状与 types 对照；清理测试数据与进程（PID）
- [ ] **Step 10: Commit** `feat(frontend): learn page — profiles, session logging, stats charts, calendar`

### Task 3.5: 冒烟第 9 步 + 文档 + 收尾

**Files:** Modify `frontend/scripts/smoke.mjs`、`README.md`、`CLAUDE.md`

**Interfaces:** Consumes 全部前置；Produces 阶段 3 收尾提交

- [ ] **Step 1: smoke.mjs 第 9 步（学习记录链路，自清理）**

```js
// 9. 学习模块：记录时长 → 统计 → 页面 → 清理
const today = new Date().toISOString().slice(0, 10)
const sess = await page.request.post(BASE + "/api/learn/sessions", {
  headers: { Authorization: "Bearer " + token },
  data: { lang: "en", activity: "vocab", minutes: 25, date: today },
})
if (!(sess.status() === 201 || sess.ok())) throw new Error("create session failed: " + sess.status())
const sessJson = await sess.json()
const st = await (await page.request.get(BASE + "/api/learn/stats", { headers: { Authorization: "Bearer " + token } })).json()
if (!st.today.en || st.today.minutes < 25 || st.streak < 1) throw new Error("stats mismatch: " + JSON.stringify(st))
await page.goto(BASE + "/learn", { waitUntil: "networkidle" })
await page.waitForSelector("text=英语", { timeout: 10_000 })
const del = await page.request.delete(BASE + `/api/learn/sessions/${sessJson.id}`, { headers: { Authorization: "Bearer " + token } })
if (!del.ok()) console.error("WARN: session cleanup failed", del.status())
console.log("STEP9 LEARN PASS")
```

（注意：today 用本地日期构造更稳——`new Date()` 在 UTC 晚间与本地日期可能差一天，用 `const now = new Date(); const today = \`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}\`` 与后端 Go 本地日期同口径；实现者按此修正并加注释。若用户当天有真实学习记录，stats 断言用 `>=` 已兼容；清理只删冒烟自建的 session id，不动用户数据。）

- [ ] **Step 2: 文档**：README API 表加学习端点组（6 条照契约速查）、数据库设计加 2 表、板块进度（阶段 3 完成）；CLAUDE.md Backend 结构加 pkg/learn、handler/learn.go；Key Design Decisions 加「学习记录=study_sessions 多条/日，打卡为派生概念」「日期口径统一 Go 本地时间（阶段 2 I-3 教训）」；smoke 描述更新为 9 步；dashboard summary 新字段注记
- [ ] **Step 3: 全量验证**：backend build/vet/test 全绿；frontend tsc×2/build 零错误；全栈冒烟 9 步 SMOKE PASS ✅ + STEP9 LEARN PASS（8080 被用户占用则报控制器协调）；测试数据清理（study_sessions/language_profiles 无 smoketest 冒烟残留、DEL dashboard:summary）
- [ ] **Step 4: Commit**（单一收尾提交）`feat: phase 3 complete — learn module with session tracking and statistics`
- [ ] **Step 5:**（控制器负责合并推送，实现者不 push）

---

## Self-Review 记录

- **Spec 覆盖**：§6 修订版全部要素——阶段档案（3.1/3.3/3.4）、学习记录含类型与分钟（3.1/3.3/3.4）、统计五件套 streak/今日/本周/累计/近28天（3.2/3.3/3.4）、打卡日历（3.3/3.4）、Dashboard 三字段含新增 study_minutes_today（3.3/3.4）；§3.1 两表 DDL（3.1）；§5 六端点（3.3）；§9 streak 单测+冒烟学习链路（3.2/3.5）。缺口：无。逐条删除 UI 本期不做（YAGNI 裁决已在 3.4 Step 3 内联说明，后端 DELETE 端点已备）。
- **占位符扫描**：3.3 Step 1 为逻辑规格（handler 惯例已确立，实现者写完整代码，验证命令具体）；3.4 页面为结构要求+完整对话框/图表代码；其余完整。无 TBD。
- **类型一致性**：ComputeStreak（3.2）↔ StatsData 消费（3.3）一致；契约速查 ↔ LearnStats 结构 ↔ types.ts（3.4）↔ smoke（3.5）字段逐字核对（by_activity/recent/by_lang 嵌套形态一致）；dashboardSummary 新字段在 3.3 定义、3.4 前端类型同步；NewDashboardHandler 加参在 3.3 闭环；ACTIVITY_LABELS 单一来源（constants.ts）。
- **日期口径**（阶段 2 I-3 教训落实）：本计划所有"今天"均为 Go 本地日期字符串传参，不用 MySQL CURDATE()；smoke 的 today 构造同口径（Step 1 括注）。
