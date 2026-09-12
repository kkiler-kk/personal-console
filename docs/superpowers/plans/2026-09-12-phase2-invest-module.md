# 阶段 2：美股投资模块 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付投资模块：资产（个股/ETF/银行积存金）、交易流水、加权平均成本持仓盈亏、Yahoo→Stooq→兜底三级行情（分钟级、Redis 60s 缓存）、每日快照与一年回填、收益曲线、Dashboard 实际组合数据、/invest 完整页面。

**Architecture:** 后端新增 `pkg/portfolio`（纯函数盈亏/曲线，TDD）、`pkg/quote`（行情降级链）、`service/snapshot`（robfig/cron 每日 06:00 北京时间）、3 个 handler（asset/trade/invest）；持仓不落表、由 trades 实时推导。前端替换 /invest 占位页，Recharts 画曲线与占比，TanStack Query 60s 轮询（页面隐藏自动暂停）。

**Tech Stack:** Go 1.22 + Gin + sqlx + MySQL + Redis（新依赖 `github.com/robfig/cron/v3`）；React 19 + TS strict + TanStack Query v5 + Recharts + shadcn/radix-nova。

**Spec:** `docs/superpowers/specs/2026-09-12-personal-site-redesign-design.md` §3.1 §4 §5 §9

## Global Constraints

- 所有新 API 挂 JWT protected 组；错误统一 `{"error": "..."}`；DB 变更走 `cmd/migrate.go` 幂等迁移
- **汇总货币为 CNY**：组合总值/盈亏按 USDCNY 折算（汇率来自行情子系统 CNY=X，Redis 缓存 1h）；持仓表每行显示原币金额。spec 未定，此为计划裁决（用户在中国、黄金为 CNY 计价）
- 涨绿跌红（美股习惯）：up `#16a34a`、down `#dc2626`
- 行情降级链：Yahoo(v8 chart, 无 crumb) → Stooq(CSV) → assets.current_price(Stale=true)；页面永不因行情失败而不可用
- 上游 HTTP 走代理：`QUOTE_PROXY` 环境变量（默认 `http://127.0.0.1:7890`，置空直连）
- 成交价与行情价分离：trades.price 是历史事实；行情只影响展示层浮动盈亏
- 纯逻辑必须有 Go 单测：ComputePosition、ConvertGoldToCNYGram、ValueCurve；行情 provider 用 httptest 测
- 数字前端一律 `tnum`；金额显示带货币符号；tsc（两个 tsconfig）与 build 零错误
- 提交信息 conventional commits；git add 显式路径，**严禁仓库根 git add -A**
- 进程纪律：起服记 PID 精确 kill，严禁 pkill 模糊匹配；测试数据必须清理
- 测试账号 smoketest / Smoke#2026；本地端口后端 8080、前端 3000（被占用 3001，vite dev 代理已带 Origin 改写）

## API 契约速查（与本计划 handler 代码严格一致，前端按此消费）

```
GET    /api/assets                → 200 {assets: Asset[]}
POST   /api/assets                → 201 {id}          body {symbol,name,type,price_source,currency}
PUT    /api/assets/:id            → 200 {message}     body {name}
DELETE /api/assets/:id            → 200 {message}     （有交易记录时 400）
PUT    /api/assets/:id/price      → 200 {message}     body {price}   （manual 资产手动更新价）
GET    /api/trades?asset_id=      → 200 {trades: Trade[]}（含 asset 联表，traded_at DESC，上限 200）
POST   /api/trades                → 201 {id}          body {asset_id,side,quantity,price,fee,traded_at,note}（超卖 400）
DELETE /api/trades/:id            → 200 {message}
GET    /api/positions             → 200 PositionsResp（见下）
GET    /api/quotes?symbols=A,B    → 200 {quotes: QuoteData[]}
GET    /api/price-history?symbol=&days= → 200 {points: [{date:"2006-01-02", close:number}]}（days 默认 90，上限 365）
GET    /api/positions/history?days= → 200 {points: [{date,value,cost,pnl}], currency:"CNY"}（days 默认 90，上限 365）
GET    /api/dashboard/summary     → 既有 schema，portfolio_value/portfolio_pnl/portfolio_pnl_pct 由 null 变为实际 CNY 数值（只增不改原则：字段不变）

Asset = {id,symbol,name,type:"stock"|"etf"|"metal"|"other",price_source:"yahoo"|"computed_gold_cny"|"manual",currency:"USD"|"CNY",current_price:number|null,price_updated_at:string|null,created_at,updated_at}
Trade = {id,asset_id,side:"buy"|"sell",quantity,price,fee,traded_at,note,created_at,asset?:Asset}
QuoteData = {symbol,price,previous_close,currency,updated_at,stale:boolean}
PositionsResp = {
  positions: [{asset:Asset, quantity,avg_cost,cost_basis,market_value,realized_pnl,unrealized_pnl:number|null,
               price:number|null, previous_close:number|null, day_change_pct:number|null, stale:boolean, price_updated_at:string|null}],
  summary: {total_value_cny,total_cost_cny,total_pnl_cny,total_pnl_pct:number, day_pnl_cny:number|null, fx_usdcny:number}
}
（market_value/unrealized_pnl 在无行情时为 null；day_change_pct 在 previous_close<=0 时为 null）
```

## 文件结构（新增/修改全景）

```
backend/
├── pkg/portfolio/positions.go + positions_test.go   纯函数盈亏（Task 2.2）
├── pkg/portfolio/history.go + history_test.go       组合价值曲线纯函数（Task 2.7）
├── pkg/quote/quote.go        Quote/RawQuote/HistoryPoint 类型 + Service（降级链+缓存+兜底）（Task 2.3）
├── pkg/quote/yahoo.go + yahoo_test.go               Yahoo chart provider（Task 2.3）
├── pkg/quote/stooq.go + stooq_test.go               Stooq CSV provider（Task 2.4）
├── pkg/quote/gold.go + gold_test.go                 GOLD_CNY_G 换算纯函数（Task 2.4）
├── service/snapshot.go       每日快照 + 启动补跑 + 一年回填（Task 2.6）
├── handler/asset.go          assets CRUD + 手动价（Task 2.5）
├── handler/trade.go          trades CRUD + 超卖校验（Task 2.5）
├── handler/invest.go         positions/quotes/price-history/positions-history（Task 2.5/2.7）
├── handler/dashboard.go      portfolio 字段填充（Task 2.8）
├── model/model.go            Asset/Trade/PriceHistory（Task 2.1）
├── cmd/migrate.go            3 张新表（Task 2.1）
├── cmd/main.go               启动快照调度（Task 2.6）
├── config/config.go          QuoteProxy（Task 2.1）
├── .env.example              QUOTE_PROXY 一行（Task 2.1）
└── router/router.go          挂载全部新路由（Task 2.5）
frontend/src/
├── lib/types.ts / lib/api.ts invest 类型与端点（Task 2.9）
├── components/charts/ValueChart.tsx   Recharts 面积图封装（Task 2.9）
├── pages/invest/InvestPage.tsx        主页面（Task 2.9）
├── pages/invest/TradeDialog.tsx       录交易（Task 2.9）
├── pages/invest/AssetDialog.tsx       添加资产（Task 2.9）
├── pages/Dashboard.tsx                portfolio 卡 + 收益曲线（Task 2.10）
├── App.tsx                            /invest 占位替换（Task 2.9）
└── scripts/smoke.mjs                  第 8 步投资链路（Task 2.10）
```

---

### Task 2.1: 数据模型 + 迁移 + 配置

**Files:**
- Modify: `backend/cmd/migrate.go`、`backend/model/model.go`、`backend/config/config.go`、`backend/.env.example`

**Interfaces:**
- Produces: 表 `assets`/`trades`/`price_history`；`model.Asset{ID,Symbol,Name,Type,PriceSource,Currency,CurrentPrice *float64,PriceUpdatedAt *time.Time,CreatedAt,UpdatedAt}`、`model.Trade{ID,AssetID,Side,Quantity,Price,Fee float64,TradedAt,CreatedAt time.Time,Note string, Asset *Asset db:"-"}`、`model.PriceHistory{ID,Symbol,Date,Close}`；`cfg.QuoteProxy string`
- Consumes: 现有 migrate.go 的建表循环与幂等模式

- [ ] **Step 1: migrate.go 建表循环追加 3 条 DDL（与 spec §3.1 一致，全部 IF NOT EXISTS 天然幂等）**

```sql
CREATE TABLE IF NOT EXISTS assets (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  symbol VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(16) NOT NULL DEFAULT 'stock',
  price_source VARCHAR(16) NOT NULL DEFAULT 'yahoo',
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  current_price DECIMAL(18,4),
  price_updated_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS trades (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  asset_id BIGINT NOT NULL,
  side VARCHAR(8) NOT NULL,
  quantity DECIMAL(18,6) NOT NULL,
  price DECIMAL(18,4) NOT NULL,
  fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  traded_at DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(id)
);
CREATE TABLE IF NOT EXISTS price_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  symbol VARCHAR(32) NOT NULL,
  date DATE NOT NULL,
  close DECIMAL(18,4) NOT NULL,
  UNIQUE KEY uk_symbol_date (symbol, date)
);
```

- [ ] **Step 2: model.go 追加结构体（json/db tag 见 Interfaces；Note 用 string，DB TEXT 可空时查询用 COALESCE(note,'') AS note 或 sql.NullString——统一用 `Note sql.NullString json:"-"` 会在 JSON 丢字段，故选 string + 查询侧 `IFNULL(note,'') AS note`，Task 2.5 的 SQL 遵守）**

```go
type Asset struct {
	ID             int64      `json:"id" db:"id"`
	Symbol         string     `json:"symbol" db:"symbol"`
	Name           string     `json:"name" db:"name"`
	Type           string     `json:"type" db:"type"`
	PriceSource    string     `json:"price_source" db:"price_source"`
	Currency       string     `json:"currency" db:"currency"`
	CurrentPrice   *float64   `json:"current_price" db:"current_price"`
	PriceUpdatedAt *time.Time `json:"price_updated_at" db:"price_updated_at"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" db:"updated_at"`
}

type Trade struct {
	ID        int64     `json:"id" db:"id"`
	AssetID   int64     `json:"asset_id" db:"asset_id"`
	Side      string    `json:"side" db:"side"`
	Quantity  float64   `json:"quantity" db:"quantity"`
	Price     float64   `json:"price" db:"price"`
	Fee       float64   `json:"fee" db:"fee"`
	TradedAt  time.Time `json:"traded_at" db:"traded_at"`
	Note      string    `json:"note" db:"note"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`

	Asset *Asset `json:"asset,omitempty" db:"-"`
}

type PriceHistory struct {
	ID     int64     `json:"id" db:"id"`
	Symbol string    `json:"symbol" db:"symbol"`
	Date   time.Time `json:"date" db:"date"`
	Close  float64   `json:"close" db:"close"`
}
```

- [ ] **Step 3: config.go 增加 `QuoteProxy string`，Load() 中 `QuoteProxy: envOr("QUOTE_PROXY", "http://127.0.0.1:7890")`；.env.example 追加一行 `QUOTE_PROXY=http://127.0.0.1:7890`**

- [ ] **Step 4: 验证**

```bash
cd /Users/kk/data/code/blogs/backend && go build ./... && go vet ./...
docker compose -f ../docker-compose.yml up -d
go run cmd/*.go &  # 记 PID
sleep 2
docker compose -f ../docker-compose.yml exec mysql mysql -uroot -p123456 blog -e "SHOW TABLES LIKE 'assets'; SHOW TABLES LIKE 'trades'; SHOW TABLES LIKE 'price_history';"
# 重启第二次验证幂等：kill PID 后再 go run，无报错
kill <PID>
```

- [ ] **Step 5: Commit** `feat(backend): assets/trades/price_history schema, models, QUOTE_PROXY config`

### Task 2.2: 持仓盈亏纯函数（TDD）

**Files:**
- Create: `backend/pkg/portfolio/positions.go`、`backend/pkg/portfolio/positions_test.go`

**Interfaces:**
- Produces（后续任务逐字依赖）:

```go
package portfolio

type Trade struct {
	Side     string  // "buy" | "sell"
	Quantity float64
	Price    float64
	Fee      float64
}

type Position struct {
	Quantity      float64  // 当前持有数量
	AvgCost       float64  // 加权平均单位成本（含费）
	CostBasis     float64  // Quantity * AvgCost
	RealizedPnl   float64  // 已实现盈亏（含卖出费用扣减）
	MarketValue   float64  // currentPrice==nil 时为 0
	UnrealizedPnl float64  // currentPrice==nil 时为 0
}

var ErrOversell = errors.New("sell quantity exceeds holdings")

// ComputePosition 按时间序折叠交易（加权平均成本法，买入费计入成本，卖出费计入已实现盈亏）。
// currentPrice 为 nil 时 MarketValue/UnrealizedPnl 为 0。超卖返回 ErrOversell。
// 浮点比较容差 1e-9。
func ComputePosition(trades []Trade, currentPrice *float64) (Position, error)
```

- [ ] **Step 1: 先写失败测试 positions_test.go**

```go
package portfolio

import (
	"errors"
	"math"
	"testing"
)

func p(v float64) *float64 { return &v }

func almost(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func TestSingleBuy(t *testing.T) {
	pos, err := ComputePosition([]Trade{{Side: "buy", Quantity: 10, Price: 100, Fee: 1}}, p(110))
	if err != nil { t.Fatal(err) }
	if !almost(pos.Quantity, 10) || !almost(pos.AvgCost, 100.1) || !almost(pos.CostBasis, 1001) {
		t.Fatalf("bad position: %+v", pos)
	}
	if !almost(pos.MarketValue, 1100) || !almost(pos.UnrealizedPnl, 99) {
		t.Fatalf("bad valuation: %+v", pos)
	}
}

func TestTwoBuysAverage(t *testing.T) {
	pos, _ := ComputePosition([]Trade{
		{Side: "buy", Quantity: 10, Price: 100, Fee: 0},
		{Side: "buy", Quantity: 10, Price: 200, Fee: 0},
	}, p(150))
	if !almost(pos.AvgCost, 150) || !almost(pos.CostBasis, 3000) || !almost(pos.UnrealizedPnl, 0) {
		t.Fatalf("bad average: %+v", pos)
	}
}

func TestPartialSellRealized(t *testing.T) {
	pos, _ := ComputePosition([]Trade{
		{Side: "buy", Quantity: 10, Price: 100, Fee: 0},
		{Side: "sell", Quantity: 4, Price: 120, Fee: 1},
	}, p(130))
	// realized = 4*120 - 1 - 4*100 = 79
	if !almost(pos.RealizedPnl, 79) { t.Fatalf("realized=%v", pos.RealizedPnl) }
	if !almost(pos.Quantity, 6) || !almost(pos.AvgCost, 100) { t.Fatalf("pos=%+v", pos) }
	if !almost(pos.UnrealizedPnl, 180) || !almost(pos.MarketValue, 780) { t.Fatalf("pos=%+v", pos) }
}

funcTestFullSell := func(t *testing.T) {}

func TestFullSell(t *testing.T) {
	pos, _ := ComputePosition([]Trade{
		{Side: "buy", Quantity: 10, Price: 100, Fee: 2},
		{Side: "sell", Quantity: 10, Price: 110, Fee: 2},
	}, nil)
	// realized = 10*110 - 2 - (1000+2) = 96
	if !almost(pos.RealizedPnl, 96) || !almost(pos.Quantity, 0) || !almost(pos.CostBasis, 0) {
		t.Fatalf("pos=%+v", pos)
	}
	if pos.MarketValue != 0 || pos.UnrealizedPnl != 0 { t.Fatalf("nil price must zero valuation: %+v", pos) }
}

func TestOversell(t *testing.T) {
	_, err := ComputePosition([]Trade{
		{Side: "buy", Quantity: 5, Price: 100, Fee: 0},
		{Side: "sell", Quantity: 6, Price: 100, Fee: 0},
	}, nil)
	if !errors.Is(err, ErrOversell) { t.Fatalf("want ErrOversell, got %v", err) }
}

func TestEmptyTrades(t *testing.T) {
	pos, err := ComputePosition(nil, p(100))
	if err != nil || pos.Quantity != 0 || pos.RealizedPnl != 0 { t.Fatalf("pos=%+v err=%v", pos, err) }
}
```

（注意：上面 `TestFullSell := func...` 一行是笔误防线——**不要写入该一行**，只保留具名 Test 函数。）

- [ ] **Step 2: 跑测试确认编译失败**

Run: `cd backend && go test ./pkg/portfolio/ -v`
Expected: FAIL（ComputePosition/ErrOversell 未定义，编译错误）

- [ ] **Step 3: 实现 positions.go**

```go
package portfolio

import (
	"errors"
	"math"
)

type Trade struct {
	Side     string
	Quantity float64
	Price    float64
	Fee      float64
}

type Position struct {
	Quantity      float64
	AvgCost       float64
	CostBasis     float64
	RealizedPnl   float64
	MarketValue   float64
	UnrealizedPnl float64
}

var ErrOversell = errors.New("sell quantity exceeds holdings")

const epsilon = 1e-9

func ComputePosition(trades []Trade, currentPrice *float64) (Position, error) {
	var pos Position
	var costBasis float64 // 当前持仓总成本（含买入费）
	var realized float64

	for _, tr := range trades {
		switch tr.Side {
		case "buy":
			costBasis += tr.Quantity*tr.Price + tr.Fee
			pos.Quantity += tr.Quantity
		case "sell":
			if tr.Quantity > pos.Quantity+epsilon {
				return Position{}, ErrOversell
			}
			avg := 0.0
			if pos.Quantity > epsilon {
				avg = costBasis / pos.Quantity
			}
			realized += tr.Quantity*tr.Price - tr.Fee - tr.Quantity*avg
			costBasis -= tr.Quantity * avg
			pos.Quantity -= tr.Quantity
			if pos.Quantity < epsilon { // 清仓归零，消除浮点残渣
				pos.Quantity = 0
				costBasis = 0
			}
		default:
			return Position{}, errors.New("unknown side: " + tr.Side)
		}
	}

	pos.CostBasis = costBasis
	pos.RealizedPnl = realized
	if pos.Quantity > epsilon {
		pos.AvgCost = costBasis / pos.Quantity
	}
	if currentPrice != nil {
		pos.MarketValue = pos.Quantity * (*currentPrice)
		pos.UnrealizedPnl = pos.MarketValue - costBasis
	}
	_ = math.Abs // 保持 import（如未用到则删除本行与 import）
	return pos, nil
}
```

（实现者注意：若 `math` 未实际使用，删除 `_ = math.Abs` 与 import，以 go vet 零告警为准。）

- [ ] **Step 4: 跑测试确认全绿**

Run: `go test ./pkg/portfolio/ -v`
Expected: 全部 PASS，输出无告警

- [ ] **Step 5: Commit** `feat(backend): weighted-average position math with unit tests`

### Task 2.3: 行情子系统 —— Yahoo provider + Service 降级链 + 缓存

**Files:**
- Create: `backend/pkg/quote/quote.go`、`backend/pkg/quote/yahoo.go`、`backend/pkg/quote/yahoo_test.go`

**Interfaces:**
- Consumes: `cfg.QuoteProxy`（Task 2.1）、`model.Asset`
- Produces:

```go
package quote

type RawQuote struct {
	Price         float64
	PreviousClose float64
	Currency      string
}

type HistoryPoint struct {
	Date  time.Time // 当日 00:00 UTC
	Close float64
}

type Quote struct {
	Symbol        string    `json:"symbol"`
	Price         float64   `json:"price"`
	PreviousClose float64   `json:"previous_close"`
	Currency      string    `json:"currency"`
	UpdatedAt     time.Time `json:"updated_at"`
	Stale         bool      `json:"stale"`
}

type Provider interface {
	Name() string
	Fetch(ctx context.Context, symbol string) (*RawQuote, error)   // 不支持的 symbol 返回 ErrUnsupported
	History(ctx context.Context, symbol string, days int) ([]HistoryPoint, error)
}

var ErrUnsupported = errors.New("symbol unsupported by provider")

type Service struct { /* providers []Provider; rdb; db; client *http.Client; gold GoldResolver(见2.4) */ }

func NewService(cfg *config.Config, db *sqlx.DB, rdb *redis.Client, providers ...Provider) *Service
// Quotes 批量报价：Redis "quote:<symbol>" 60s → provider 链 → 成功时写回 assets.current_price/price_updated_at 并返回；
// 全链失败 → 读 assets.current_price 兜底（Stale=true；无兜底则该 symbol 缺席 map 并 log）。
// 特殊 symbol "GOLD_CNY_G"（price_source=computed_gold_cny）走 gold 解析（Task 2.4 注入；本任务先留 hook 字段）。
func (s *Service) Quotes(ctx context.Context, symbols []string) map[string]Quote
// BackfillHistory 回填：provider 链第一个支持 History 的 → INSERT INTO price_history ... ON DUPLICATE KEY UPDATE close=VALUES(close)；log 错误不上抛。
func (s *Service) BackfillHistory(ctx context.Context, symbol string, days int)
// USDCNY 汇率：Redis "fx:usdcny" 1h → Yahoo CNY=X → 失败兜底 7.0（log warn）。
func (s *Service) USDCNY(ctx context.Context) float64

const GoldSymbol = "GOLD_CNY_G"
const GramsPerTroyOunce = 31.1035
```

- [ ] **Step 1: yahoo.go 实现（v8 chart API，无 crumb）**

```go
package quote

// YahooProvider 使用 https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
// quote: ?range=1d&interval=1d → chart.result[0].meta: regularMarketPrice, previousClose(缺失时用 chartPreviousClose), currency
// history: ?range=1y&interval=1d → chart.result[0].timestamp[] + indicators.quote[0].close[]（null 跳过）
// 请求头 User-Agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"；client 由 Service 注入（带代理）。
// 非 200 或 result 空 → error；meta.regularMarketPrice <= 0 → error。
// History 的 days 参数仅用于日志/未来扩展，Yahoo 固定取 1y（>=days 的超集，调用方自行截取）。
```

（实现者按上述注释写出完整可编译代码；JSON 解析结构体只声明用到的字段。测试用 httptest 见 Step 2，BaseURL 需可注入：`type YahooProvider struct { client *http.Client; baseURL string }`，`NewYahooProvider(client *http.Client) *YahooProvider` 默认 baseURL 为真实地址。）

- [ ] **Step 2: yahoo_test.go（httptest，RED→GREEN）**

```go
package quote

import (
	"context"
	"net/http"
	"net/http/server"
	"testing"
)

const yahooQuoteBody = `{"chart":{"result":[{"meta":{"regularMarketPrice":228.5,"previousClose":225.1,"currency":"USD"},"timestamp":[1757548800,1757635200],"indicators":{"quote":[{"close":[226.0,228.5]}]}}],"error":null}}`

func TestYahooFetchAndHistory(t *testing.T) {
	srv := httptestNew(t, yahooQuoteBody) // helper: server.NewServer 返回 200 JSON
	defer srv.Close()
	y := NewYahooProvider(srv.Client())
	y.baseURL = srv.URL + "/v8/finance/chart/"
	q, err := y.Fetch(context.Background(), "AAPL")
	if err != nil { t.Fatal(err) }
	if q.Price != 228.5 || q.PreviousClose != 225.1 || q.Currency != "USD" { t.Fatalf("q=%+v", q) }
	h, err := y.History(context.Background(), "AAPL", 365)
	if err != nil { t.Fatal(err) }
	if len(h) != 2 || h[0].Close != 226.0 { t.Fatalf("h=%+v", h) }
}

func TestYahooErrorPath(t *testing.T) {
	srv := server500(t) // helper: 返回 500
	defer srv.Close()
	y := NewYahooProvider(srv.Client()); y.baseURL = srv.URL
	if _, err := y.Fetch(context.Background(), "X"); err == nil { t.Fatal("want error on 500") }
}
```

（helper 用标准库 `net/http/httptest.NewServer(http.HandlerFunc(...))` 实现，命名自定；先跑测试确认 RED，再写实现到 GREEN。）

- [ ] **Step 3: quote.go 实现 Service**

```go
// NewService: client 构造——QuoteProxy 非空时 http.Transport{Proxy: http.ProxyURL(u)}，Timeout 10s。
// Quotes 流程（每个 symbol）:
//   1) Redis GET "quote:<symbol>" → 命中反序列化直接放入结果
//   2) symbol == GoldSymbol → 走 s.gold（Task 2.4 前为 nil，nil 时跳过走兜底）
//   3) 遍历 providers Fetch → 第一个成功: 组 Quote{Stale:false, UpdatedAt:now}；
//      SET "quote:<symbol>" 60s；UPDATE assets SET current_price=?, price_updated_at=? WHERE symbol=?（best-effort, log 错误）
//   4) 全失败: SELECT current_price, currency, price_updated_at FROM assets WHERE symbol=? →
//      有值: Quote{Price:current_price, Stale:true, UpdatedAt:price_updated_at}；无值: log 并跳过该 symbol
// USDCNY: GET "fx:usdcny" → miss 时 providers 链 Fetch("CNY=X") → SETEX 3600 → 返回；全失败返回 7.0 + log。
// BackfillHistory: 遍历 providers 第一个 History 成功者 → 逐点 INSERT ... ON DUPLICATE KEY UPDATE；log。
```

- [ ] **Step 4: 验证**

```bash
cd backend && go build ./... && go vet ./... && go test ./pkg/quote/ -v   # 全绿
# 真实网络验证（走代理）：写一个临时 main（tmp_quote/main.go）构造 Service+YahooProvider，
# Quotes(ctx, []string{"AAPL","QQQ","XAUUSD=X","CNY=X"}) 打印结果后删除 tmp_quote/
```

- [ ] **Step 5: Commit** `feat(backend): quote service with Yahoo provider, Redis cache, stale fallback`

### Task 2.4: Stooq 降级 + 积存金换算 + USDCNY 收口

**Files:**
- Create: `backend/pkg/quote/stooq.go`、`backend/pkg/quote/stooq_test.go`、`backend/pkg/quote/gold.go`、`backend/pkg/quote/gold_test.go`
- Modify: `backend/pkg/quote/quote.go`（gold hook 接线）

**Interfaces:**
- Produces:

```go
// StooqProvider: GET https://stooq.com/q/l/?s={mapped}&f=sd2t2ohlcv&h&e=csv
// 映射: 纯字母 symbol → strings.ToLower(sym)+".us"；"XAUUSD=X"→"xauusd"；"CNY=X"→"usdcny"；其余 ErrUnsupported。
// CSV 首行表头，第二行: Symbol,Date,Time,Open,High,Low,Close,Volume；price=Close；PreviousClose=0（Stooq 不提供）；
// Currency: .us→"USD"，xauusd→"USD"，usdcny→"CNY"。Close<=0 或 "N/D" → error。History → ErrUnsupported。
type StooqProvider struct { client *http.Client; baseURL string }
func NewStooqProvider(client *http.Client) *StooqProvider

// gold.go
func ConvertGoldToCNYGram(xauUSDPerOz, usdCNY float64) float64 // = xauUSDPerOz / GramsPerTroyOunce * usdCNY，四舍五入到 2 位小数
// Service.gold 实现: Quotes 遇到 GoldSymbol 时——provider 链 Fetch("XAUUSD=X") 与 Fetch("CNY=X")（各自走缓存），
// 两者都成功: Price=ConvertGoldToCNYGram(...)，PreviousClose=ConvertGoldToCNYGram(prevXAU, prevCNY)（任一 prev<=0 则 0），Currency="CNY"，缓存同普通 symbol；
// 任一失败: 走 assets 兜底（与普通 symbol 相同路径）。
```

- [ ] **Step 1: gold_test.go（RED）**

```go
package quote

import "testing"

func TestConvertGoldToCNYGram(t *testing.T) {
	// 3110.35 USD/oz, 7.0 汇率 → 3110.35/31.1035*7 = 700.00
	if got := ConvertGoldToCNYGram(3110.35, 7.0); got != 700.00 {
		t.Fatalf("got %v", got)
	}
	if got := ConvertGoldToCNYGram(2000, 7.2); got != 462.94 { // 2000/31.1035*7.2=462.9423…
		t.Fatalf("got %v", got)
	}
}
```

- [ ] **Step 2: stooq_test.go（httptest CSV，RED）**

```go
package quote

import "testing"

func TestStooqFetch(t *testing.T) {
	body := "Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-09-11,16:15:00,225.0,229.0,224.5,228.5,12345678\n"
	srv := newCSVServer(t, body) // httptest helper
	defer srv.Close()
	s := NewStooqProvider(srv.Client()); s.baseURL = srv.URL + "/q/l/"
	q, err := s.Fetch(contextOf(), "AAPL")
	if err != nil { t.Fatal(err) }
	if q.Price != 228.5 || q.Currency != "USD" || q.PreviousClose != 0 { t.Fatalf("q=%+v", q) }
	if _, err := s.Fetch(contextOf(), "GOLD_CNY_G"); err != ErrUnsupported { t.Fatal("want ErrUnsupported") }
}
```

- [ ] **Step 3: 实现 stooq.go、gold.go，quote.go 接线 gold hook（GoldSymbol 分支）**

- [ ] **Step 4: 验证**

```bash
cd backend && go build ./... && go vet ./... && go test ./pkg/quote/ ./pkg/portfolio/ -v   # 全绿
# 真实链路（tmp_quote 临时 main，用后删）: Quotes ["GOLD_CNY_G","AAPL"] → 金价应在 300-1500 CNY/g 数量级，AAPL 为美股价格
```

- [ ] **Step 5: Commit** `feat(backend): stooq fallback, bank-gold CNY/gram conversion`

### Task 2.5: 投资 API —— assets/trades CRUD + positions + quotes + price-history

**Files:**
- Create: `backend/handler/asset.go`、`backend/handler/trade.go`、`backend/handler/invest.go`
- Modify: `backend/router/router.go`

**Interfaces:**
- Consumes: `portfolio.ComputePosition`、`quote.Service`（NewService(cfg, db, rdb, NewYahooProvider(client), NewStooqProvider(client))——client 构造移入 NewService 内部，router 只传 cfg/db/rdb）、`model.Asset/Trade`
- Produces: 契约速查表中 assets/trades/positions/quotes/price-history 全部端点；`InvestHandler.ComputePositionsResponse(ctx) (*PositionsResp, error)` 供 dashboard（Task 2.8）复用

- [ ] **Step 1: handler/asset.go**

```go
type AssetHandler struct {
	db     *sqlx.DB
	quotes *quote.Service
}
func NewAssetHandler(db *sqlx.DB, qs *quote.Service) *AssetHandler

// List: SELECT * FROM assets ORDER BY created_at → {assets}
// Create: body {symbol,name,type,price_source,currency}
//   校验: symbol/name 必填；type ∈ stock|etf|metal|other；price_source ∈ yahoo|computed_gold_cny|manual；currency ∈ USD|CNY
//   price_source=computed_gold_cny → 强制 symbol=quote.GoldSymbol, currency=CNY, type=metal（忽略入参）
//   symbol 统一 strings.ToUpper（computed 除外，GoldSymbol 本身已大写）
//   INSERT；重复 symbol → 409 {"error":"asset already exists"}
//   yahoo/computed 资产创建成功后 go s.quotes.BackfillHistory(ctx, symbol, 365)（用 context.WithoutCancel(c.Request.Context())）
//   → 201 {id}
// Update: body {name} 必填 → UPDATE assets SET name=? WHERE id=?；0 行 → 404
// Delete: 先 SELECT COUNT(*) FROM trades WHERE asset_id=? → >0 则 400 {"error":"请先删除该资产的交易记录"}；
//   DELETE FROM assets WHERE id=?；DELETE FROM price_history WHERE symbol=?（取 asset.Symbol）；0 行 → 404
// UpdatePrice: body {price float64} price>0 → UPDATE assets SET current_price=?, price_updated_at=NOW() WHERE id=?；0 行 404
//   仅 price_source=manual 允许，否则 400 {"error":"自动跟踪资产不可手动改价"}
//   成功后 DEL Redis "quote:<symbol>"（防止旧缓存覆盖显示）
```

- [ ] **Step 2: handler/trade.go**

```go
type TradeHandler struct { db *sqlx.DB }
func NewTradeHandler(db *sqlx.DB) *TradeHandler

// List: ?asset_id= 可选过滤
//   SELECT t.id,t.asset_id,t.side,t.quantity,t.price,t.fee,t.traded_at,IFNULL(t.note,'') AS note,t.created_at
//   FROM trades t WHERE ... ORDER BY t.traded_at DESC, t.id DESC LIMIT 200 → {trades}
// Create: body {asset_id,side,quantity,price,fee,traded_at "2006-01-02",note}
//   校验: asset 存在（404）；side ∈ buy|sell；quantity>0；price>0；fee>=0；traded_at 可解析
//   超卖校验（sell）: 取该资产全部 trades 按 traded_at,id ASC → portfolio.ComputePosition(nil 价) →
//     sell.Quantity > 持仓 → 400 {"error":"卖出数量超过持仓"}；ErrOversell 同样 400
//   INSERT → 201 {id}；DEL Redis "dashboard:summary"
// Delete: DELETE WHERE id；0 行 404；成功 DEL "dashboard:summary" → 200 {message}
```

- [ ] **Step 3: handler/invest.go**

```go
type InvestHandler struct {
	db     *sqlx.DB
	quotes *quote.Service
}
func NewInvestHandler(db *sqlx.DB, qs *quote.Service) *InvestHandler

type PositionRow struct {
	Asset         model.Asset `json:"asset"`
	Quantity      float64     `json:"quantity"`
	AvgCost       float64     `json:"avg_cost"`
	CostBasis     float64     `json:"cost_basis"`
	MarketValue   *float64    `json:"market_value"`
	RealizedPnl   float64     `json:"realized_pnl"`
	UnrealizedPnl *float64    `json:"unrealized_pnl"`
	Price         *float64    `json:"price"`
	PreviousClose *float64    `json:"previous_close"`
	DayChangePct  *float64    `json:"day_change_pct"`
	Stale         bool        `json:"stale"`
	PriceUpdatedAt *time.Time `json:"price_updated_at"`
}
type PositionsSummary struct {
	TotalValueCNY float64  `json:"total_value_cny"`
	TotalCostCNY  float64  `json:"total_cost_cny"`
	TotalPnlCNY   float64  `json:"total_pnl_cny"`
	TotalPnlPct   float64  `json:"total_pnl_pct"`
	DayPnlCNY     *float64 `json:"day_pnl_cny"`
	FxUSDCNY      float64  `json:"fx_usdcny"`
}
type PositionsResp struct {
	Positions []PositionRow    `json:"positions"`
	Summary   PositionsSummary `json:"summary"`
}

// ComputePositionsResponse(ctx):
//   1) SELECT * FROM assets ORDER BY created_at
//   2) SELECT ... FROM trades ORDER BY traded_at, id（IFNULL note）
//   3) 按 asset_id 分组 → portfolio.ComputePosition(trades, 该资产报价 price 指针)
//      报价: symbols := 全部 asset.Symbol → s.quotes.Quotes(ctx, symbols)
//   4) fx := s.quotes.USDCNY(ctx)
//   5) 组 PositionRow: price/previous_close 从 Quote 取（缺席→nil，用 asset.CurrentPrice 再兜一层→仍无则 nil）；
//      day_change_pct = previous_close>0 ? (price-previous_close)/previous_close*100 : nil
//      market_value/unrealized_pnl: price==nil → nil，否则数量×价 与 市值-成本
//   6) summary: 每行 value_cny = market_value × (currency==USD ? fx : 1)；cost_cny 同理；
//      total_pnl = Σ(value-cost)（只计有价的行）；pct = cost>0 ? pnl/cost*100 : 0；
//      day_pnl = Σ quantity×(price-previous_close)×fx系数（任一缺失跳过该行）；全部行都缺 → nil
// Positions(c *gin.Context): resp, err := ComputePositionsResponse → err 500；200 resp
// Quotes(c): ?symbols= 逗号分隔（上限 50）→ s.quotes.Quotes → {quotes: []Quote}（map 转数组，稳定按入参顺序）
// PriceHistory(c): ?symbol=&days=（默认 90，1..365）→
//   SELECT date, close FROM price_history WHERE symbol=? AND date >= CURDATE() - INTERVAL ? DAY ORDER BY date
//   → {points:[{date:"2006-01-02", close}]}
```

- [ ] **Step 4: router.go 挂载（protected 组内）**

```go
qs := quote.NewService(cfg, db, rdb)   // 内部构造 proxy client + Yahoo + Stooq providers
ah := handler.NewAssetHandler(db, qs)
th := handler.NewTradeHandler(db)
ih := handler.NewInvestHandler(db, qs)

protected.GET("/assets", ah.List)
protected.POST("/assets", ah.Create)
protected.PUT("/assets/:id", ah.Update)
protected.DELETE("/assets/:id", ah.Delete)
protected.PUT("/assets/:id/price", ah.UpdatePrice)
protected.GET("/trades", th.List)
protected.POST("/trades", th.Create)
protected.DELETE("/trades/:id", th.Delete)
protected.GET("/positions", ih.Positions)
protected.GET("/quotes", ih.Quotes)
protected.GET("/price-history", ih.PriceHistory)
```

（NewService 签名固定为 `NewService(cfg *config.Config, db *sqlx.DB, rdb *redis.Client) *Service`——providers 在内部组装并导出 client 供 provider 共用；Task 2.3 的变参签名改为内部实现细节。）

- [ ] **Step 5: 验证（build/vet + curl 全链路）**

```bash
# smoketest 登录 → 建资产 {symbol:"AAPL",name:"苹果",type:"stock",price_source:"yahoo",currency:"USD"}
# → 录买入 {asset_id,side:"buy",quantity:10,price:200,fee:1,traded_at:"2026-09-01"}
# → 超卖测试 sell quantity 11 → 400
# → GET /api/positions → AAPL 行 quantity=10 avg_cost=200.1，price 来自 Yahoo（数量级 ~150-350），summary.total_value_cny>0
# → GET /api/quotes?symbols=AAPL → price>0 stale=false
# → GET /api/price-history?symbol=AAPL&days=30 → points 数组（回填是异步的，等 5s 再查；若为空记录原因）
# → 清理测试资产前先删交易再删资产；DEL dashboard:summary
go build ./... && go vet ./...
```

- [ ] **Step 6: Commit** `feat(backend): invest API — assets, trades, positions, quotes, price history`

### Task 2.6: 每日快照 + 启动补跑 + main.go 接线

**Files:**
- Create: `backend/service/snapshot.go`
- Modify: `backend/cmd/main.go`、`backend/go.mod`（`go get github.com/robfig/cron/v3`）

**Interfaces:**
- Consumes: `quote.Service.Quotes/BackfillHistory`
- Produces: `service.StartSnapshotScheduler(ctx context.Context, db *sqlx.DB, qs *quote.Service) *cron.Cron`——main.go 在 r.Run 前调用；进程退出随 ctx 停止

- [ ] **Step 1: snapshot.go**

```go
package service

// StartSnapshotScheduler:
//   loc := time.FixedZone("CST", 8*3600)（北京时间，避免 tzdata 依赖）
//   c := cron.New(cron.WithLocation(loc))
//   c.AddFunc("0 6 * * *", func() { RunSnapshot(ctx, db, qs) })
//   c.Start()
//   启动补跑（goroutine）: 若 now(loc) 已过今天 06:00 且今日快照缺失（对任一 yahoo/computed 资产
//     SELECT COUNT(*) FROM price_history WHERE symbol=? AND date=CURDATE() 为 0）→ RunSnapshot 一次
//   返回 cron 句柄（main 里 defer stop）
//
// RunSnapshot(ctx, db, qs):
//   SELECT symbol, price_source FROM assets WHERE price_source IN ('yahoo','computed_gold_cny')
//   quotes := qs.Quotes(ctx, symbols)
//   逐个: q, ok := quotes[sym]; ok && !q.Stale && q.Price > 0 →
//     INSERT INTO price_history (symbol, date, close) VALUES (?, CURDATE(), ?)
//     ON DUPLICATE KEY UPDATE close = VALUES(close)
//   log.Printf("snapshot: %d/%d assets", ok计数, 总数)
```

- [ ] **Step 2: main.go 接线**

```go
// auto migrate 之后、r.Run 之前:
ctx, cancel := context.WithCancel(context.Background())
defer cancel()
cronHandle := service.StartSnapshotScheduler(ctx, db, quote.NewService(cfg, db, rdb))
defer cronHandle.Stop()
```

（注意 router.Setup 内部也会 NewService 一个实例——两个实例无状态冲突（Redis/DB 共享），可接受；如实现者愿意可重构为 main 构造一次传入 Setup，改动 router.Setup 签名需同步 Task 2.5 的调用，二选一，报告注明选择。）

- [ ] **Step 3: 验证**

```bash
go get github.com/robfig/cron/v3 && go build ./... && go vet ./...
# 启动后端（记 PID）观察日志出现补跑 snapshot 行（前提: 库里有 yahoo 资产——用 Task 2.5 验证时建的临时资产或新建再删）
# SELECT * FROM price_history WHERE date=CURDATE() 有行
# 清理测试数据、kill PID
```

- [ ] **Step 4: Commit** `feat(backend): daily price snapshot scheduler with startup catch-up`

### Task 2.7: 组合价值曲线（收益曲线数据）

**Files:**
- Create: `backend/pkg/portfolio/history.go`、`backend/pkg/portfolio/history_test.go`
- Modify: `backend/handler/invest.go`（加 PositionsHistory）、`backend/router/router.go`（挂路由）

**Interfaces:**
- Consumes: `ComputePosition`
- Produces:

```go
package portfolio

type TradeRow struct {
	AssetID  int64
	Side     string
	Quantity float64
	Price    float64
	Fee      float64
	TradedAt time.Time
}
type CloseRow struct {
	AssetID int64
	Date    time.Time // 日期部分
	Close   float64
}
type AssetMeta struct {
	ID           int64
	Symbol       string
	Currency     string
	CurrentPrice float64 // 0 = 无
}
type DayPoint struct {
	Date  string  `json:"date"` // "2006-01-02"
	Value float64 `json:"value"`
	Cost  float64 `json:"cost"`
	Pnl   float64 `json:"pnl"`
}

// ValueCurve 对 dates（升序日期，取日期部分比较）逐日计算组合市值与成本（CNY，fxUSDCNY 折算 USD 资产）。
// 每日每资产: 用截至该日（TradedAt 日期 <= 该日）的交易 ComputePosition(nil) 得 quantity/costBasis；
// 单价: 当日 CloseRow（按 asset+date 索引）→ 无则最近一个更早 close → 无则 CurrentPrice → 仍无(0) 该资产当日跳过。
// 某日无任何可估资产 → 该日仍输出（Value=Cost=0 会拉低曲线——跳过全零日，不输出）。
func ValueCurve(trades []TradeRow, closes []CloseRow, assets []AssetMeta, dates []time.Time, fxUSDCNY float64) []DayPoint
```

- handler 端点：

```go
// PositionsHistory(c): ?days=（默认 90，1..365）
//   dates := 最近 days 个自然日（今天在内，升序，time.Local 日期部分）
//   trades: SELECT asset_id,side,quantity,price,fee,traded_at FROM trades ORDER BY traded_at,id → TradeRow
//   closes: SELECT ph.symbol, ph.date, ph.close FROM price_history ph WHERE ph.date >= ? ORDER BY ph.date
//           → 经 assets 的 symbol→id 映射转 CloseRow（无 asset 对应的 symbol 忽略）
//   assets: 全部 → AssetMeta（CurrentPrice 为 nil 时 0）
//   fx := qs.USDCNY(ctx)
//   points := portfolio.ValueCurve(...)；Value/Cost 已按货币折算 CNY
//   → 200 {points, currency:"CNY"}
// router: protected.GET("/positions/history", ih.PositionsHistory)
//   ⚠️ gin 路由冲突: 已有 GET /positions——/positions/history 是更深一层静态段，gin 允许（无通配冲突）
```

- [ ] **Step 1: history_test.go（RED）**

```go
package portfolio

import (
	"testing"
	"time"
)

func d(s string) time.Time { t, _ := time.Parse("2006-01-02", s); return t }

func TestValueCurveBasic(t *testing.T) {
	trades := []TradeRow{{AssetID: 1, Side: "buy", Quantity: 10, Price: 100, Fee: 0, TradedAt: d("2026-09-01")}}
	closes := []CloseRow{
		{AssetID: 1, Date: d("2026-09-10"), Close: 110},
		{AssetID: 1, Date: d("2026-09-11"), Close: 120},
	}
	assets := []AssetMeta{{ID: 1, Symbol: "TEST", Currency: "USD", CurrentPrice: 120}}
	dates := []time.Time{d("2026-09-09"), d("2026-09-10"), d("2026-09-11")}
	got := ValueCurve(trades, closes, assets, dates, 7.0)
	// 09-09: 无 close 无更早 close → 用 CurrentPrice 120 → value=10*120*7=8400, cost=1000*7=7000
	// 09-10: 110 → 7700 / 7000; 09-11: 120 → 8400 / 7000
	if len(got) != 3 { t.Fatalf("got %+v", got) }
	if got[0].Value != 8400 || got[0].Cost != 7000 || got[0].Pnl != 1400 { t.Fatalf("d0=%+v", got[0]) }
	if got[1].Value != 7700 { t.Fatalf("d1=%+v", got[1]) }
	if got[2].Value != 8400 || got[2].Date != "2026-09-11" { t.Fatalf("d2=%+v", got[2]) }
}

func TestValueCurveEmptyPositionDaysSkipped(t *testing.T) {
	trades := []TradeRow{{AssetID: 1, Side: "buy", Quantity: 1, Price: 10, Fee: 0, TradedAt: d("2026-09-05")}}
	got := ValueCurve(trades, nil, []AssetMeta{{ID: 1, Currency: "CNY", CurrentPrice: 0}}, []time.Time{d("2026-09-01")}, 7.0)
	if len(got) != 0 { t.Fatalf("want skip, got %+v", got) } // 无价且无持仓价值 → 跳过
}

func TestValueCurveCNYAssetNoFx(t *testing.T) {
	trades := []TradeRow{{AssetID: 2, Side: "buy", Quantity: 100, Price: 700, Fee: 0, TradedAt: d("2026-09-01")}}
	closes := []CloseRow{{AssetID: 2, Date: d("2026-09-10"), Close: 710}}
	got := ValueCurve(trades, closes, []AssetMeta{{ID: 2, Currency: "CNY"}}, []time.Time{d("2026-09-10")}, 7.0)
	if got[0].Value != 71000 || got[0].Cost != 70000 { t.Fatalf("got %+v", got[0]) } // CNY 不乘汇率
}
```

- [ ] **Step 2: 跑 RED → 实现 history.go → GREEN**

```bash
go test ./pkg/portfolio/ -run TestValueCurve -v   # 先 FAIL 后 PASS（连同既有 positions 测试全绿）
```

- [ ] **Step 3: handler + router（代码见上）+ 验证**

```bash
go build ./... && go vet ./...
# 起后端: GET /api/positions/history?days=30（用 Task 2.5 同款测试资产+交易+回填数据）→ points 数组、currency=CNY
# 清理测试数据
```

- [ ] **Step 4: Commit** `feat(backend): portfolio value curve endpoint with unit tests`

### Task 2.8: Dashboard summary 填充 portfolio 字段

**Files:**
- Modify: `backend/handler/dashboard.go`、`backend/router/router.go`（注入 InvestHandler 或 quote.Service 到 DashboardHandler）

**Interfaces:**
- Consumes: `InvestHandler.ComputePositionsResponse(ctx)`（Task 2.5）
- Produces: `/api/dashboard/summary` 的 portfolio_value/portfolio_pnl/portfolio_pnl_pct 返回实际 CNY 数值（无持仓时保持 null）；schema 其余字段不动

- [ ] **Step 1: DashboardHandler 增加 `invest *InvestHandler` 字段（构造函数加参数，router 同步）**

```go
// Summary 中，在既有计数查询后追加:
resp2, err := h.invest.ComputePositionsResponse(c.Request.Context())
if err != nil {
	log.Printf("dashboard: positions unavailable: %v", err)   // 保持 null，不影响其他字段
} else if len(resp2.Positions) > 0 {
	v := resp2.Summary.TotalValueCNY
	pnl := resp2.Summary.TotalPnlCNY
	pct := resp2.Summary.TotalPnlPct
	s.PortfolioValue = &v
	s.PortfolioPnl = &pnl
	s.PortfolioPnlPct = &pct
}
// 注意: 行情失败时 ComputePositionsResponse 不报错（有兜底），portfolio 字段仍可有值（Stale 价）
```

- [ ] **Step 2: 缓存注意——dashboard:summary 60s 缓存已有；ComputePositionsResponse 内部走 quotes 的 60s 缓存，双层最多延迟 120s，可接受，不加新缓存**

- [ ] **Step 3: 验证**

```bash
go build ./... && go vet ./...
# 起后端（确保库里有测试资产+交易+至少一次成功报价），DEL dashboard:summary，
# curl summary → portfolio_value 非 null 且 ≈ positions 接口 total_value_cny
# 无持仓场景: 删掉测试数据后 DEL 缓存再 curl → 三字段回到 null
```

- [ ] **Step 4: Commit** `feat(backend): dashboard portfolio fields from live positions`

### Task 2.9: 前端 /invest 页面

**Files:**
- Modify: `frontend/src/lib/types.ts`、`frontend/src/lib/api.ts`、`frontend/src/App.tsx`
- Create: `frontend/src/components/charts/ValueChart.tsx`、`frontend/src/pages/invest/InvestPage.tsx`、`frontend/src/pages/invest/TradeDialog.tsx`、`frontend/src/pages/invest/AssetDialog.tsx`

**Interfaces:**
- Consumes: 契约速查表全部 invest 端点；StatCard、ui 组件、formatMoney
- Produces: `/invest` 完整页面；`<ValueChart points={CurvePoint[]} height?={number} />`（Task 2.10 Dashboard 复用）；types.ts 新增 `Asset/Trade/PositionRow/PositionsResp/PositionsSummary/QuoteData/CurvePoint/PositionsHistoryResp`

- [ ] **Step 1: types.ts 追加（与契约速查逐字段一致，snake_case）**

```ts
export type AssetType = "stock" | "etf" | "metal" | "other"
export type PriceSource = "yahoo" | "computed_gold_cny" | "manual"
export interface Asset {
  id: number; symbol: string; name: string; type: AssetType; price_source: PriceSource
  currency: "USD" | "CNY"; current_price: number | null; price_updated_at: string | null
  created_at: string; updated_at: string
}
export interface Trade {
  id: number; asset_id: number; side: "buy" | "sell"; quantity: number; price: number
  fee: number; traded_at: string; note: string; created_at: string; asset?: Asset
}
export interface PositionRow {
  asset: Asset; quantity: number; avg_cost: number; cost_basis: number
  market_value: number | null; realized_pnl: number; unrealized_pnl: number | null
  price: number | null; previous_close: number | null; day_change_pct: number | null
  stale: boolean; price_updated_at: string | null
}
export interface PositionsSummary {
  total_value_cny: number; total_cost_cny: number; total_pnl_cny: number
  total_pnl_pct: number; day_pnl_cny: number | null; fx_usdcny: number
}
export interface PositionsResp { positions: PositionRow[]; summary: PositionsSummary }
export interface CurvePoint { date: string; value: number; cost: number; pnl: number }
export interface PositionsHistoryResp { points: CurvePoint[]; currency: string }
```

- [ ] **Step 2: api.ts 追加端点（模式与现有一致）**

```ts
getAssets: () => request<{ assets: Asset[] }>("/assets"),
createAsset: (body: { symbol: string; name: string; type: AssetType; price_source: PriceSource; currency: "USD" | "CNY" }) =>
  request<{ id: number }>("/assets", { method: "POST", body: JSON.stringify(body) }),
updateAsset: (id: number, body: { name: string }) => request<{ message: string }>(`/assets/${id}`, { method: "PUT", body: JSON.stringify(body) }),
deleteAsset: (id: number) => request<{ message: string }>(`/assets/${id}`, { method: "DELETE" }),
updateAssetPrice: (id: number, price: number) => request<{ message: string }>(`/assets/${id}/price`, { method: "PUT", body: JSON.stringify({ price }) }),
getTrades: (assetId?: number) => request<{ trades: Trade[] }>(`/trades${qs({ asset_id: assetId })}`),
createTrade: (body: { asset_id: number; side: "buy" | "sell"; quantity: number; price: number; fee: number; traded_at: string; note?: string }) =>
  request<{ id: number }>("/trades", { method: "POST", body: JSON.stringify(body) }),
deleteTrade: (id: number) => request<{ message: string }>(`/trades/${id}`, { method: "DELETE" }),
getPositions: () => request<PositionsResp>("/positions"),
getPositionsHistory: (days = 90) => request<PositionsHistoryResp>(`/positions/history${qs({ days })}`),
getPriceHistory: (symbol: string, days = 90) => request<{ points: { date: string; close: number }[] }>(`/price-history${qs({ symbol, days })}`),
```

- [ ] **Step 3: ValueChart.tsx（Recharts 面积图，value vs cost 双线）**

```tsx
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { CurvePoint } from "@/lib/types"

export function ValueChart({ points, height = 260 }: { points: CurvePoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="vFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} minTickGap={40} />
        <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v: number) => `¥${(v / 1000).toFixed(1)}k`} domain={["auto", "auto"]} />
        <Tooltip formatter={(v) => `¥${Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`} labelFormatter={(l) => `日期 ${l}`} />
        <Area type="monotone" dataKey="value" name="市值" stroke="#4f46e5" fill="url(#vFill)" strokeWidth={2} isAnimationActive={false} />
        <Area type="monotone" dataKey="cost" name="成本" stroke="#9ca3af" fill="none" strokeWidth={1.5} strokeDasharray="4 3" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 4: InvestPage.tsx（主页面：汇总卡×4 + 持仓表 + 曲线 + 流水 + 两个对话框入口）**

关键要求（完整代码由实现者按本仓库页面惯例编写，结构如下）：
- `useQuery(["positions"], api.getPositions, { refetchInterval: 60_000 })`（TanStack 默认后台标签页暂停轮询）；`useQuery(["positions-history", 90], () => api.getPositionsHistory(90))`；`useQuery(["trades"], () => api.getTrades())`
- 汇总 4 卡（StatCard 或同款卡片）：总资产（¥ total_value_cny，sub 汇率 `1 USD = ¥fx`）、总盈亏（¥ total_pnl_cny，着色 up/down + pct）、今日盈亏（day_pnl_cny null → "—"）、持仓数
- 持仓表（ui/table）：资产（name + symbol + 类型 Badge：股票/ETF/黄金/其他；Stale 时价格旁灰点 + title 提示更新时间）、数量 tnum、均价、现价（原币 $/¥）、日涨跌%（绿红着色）、市值（原币）、浮动盈亏（绿红）、已实现盈亏、操作（录交易/改价[manual]/删除[AlertDialog]）
- 涨跌配色 helper：`const pnlCls = (v: number | null) => v == null ? "" : v >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"`
- 收益曲线卡：`<ValueChart points={history?.points ?? []} />`，空数据时占位文案「录入交易并等待每日快照后生成曲线」
- 资产占比：简单横条列表（每资产 value_cny 占总值百分比条，不引入 PieChart——YAGNI，spec 饼图降级为占比条，报告注明）
- 流水表（最近 50）：日期、资产名、side Badge（买入 secondary/卖出 destructive 描边）、数量、单价、费用、note、删除按钮（AlertDialog）
- 对话框：`<AssetDialog onCreated={() => qc.invalidateQueries({queryKey:["positions"]})} />`、`<TradeDialog assets={...} onSaved={同上+invalidate trades} />`
- mutation 成功 toast + invalidate：["positions"]、["trades"]、["assets"]、["dashboard"]、["positions-history"]

- [ ] **Step 5: TradeDialog.tsx / AssetDialog.tsx（shadcn Dialog + Select + Input，zod 可选）**

TradeDialog：资产 Select（name+symbol）、side Select 买/卖、数量/价格/费用 number input（价格默认填该资产 current_price）、日期 input type=date 默认今天、note；提交 api.createTrade；400 错误（超卖）toast 后端文案。
AssetDialog：三种预设 radio——「美股/ETF」(symbol 输入自动大写, type 按常见 ETF 列表? 不猜: 让用户选 stock/etf Select, price_source=yahoo, currency=USD)；「银行积存金」(固定展示 symbol=GOLD_CNY_G 只读, name 默认"银行积存金", price_source=computed_gold_cny)；「手动资产」(symbol/name/currency 自填, price_source=manual, 创建后提示去"改价"录入现价)。提交 api.createAsset。

- [ ] **Step 6: App.tsx 替换 /invest 占位**

```tsx
import InvestPage from "@/pages/invest/InvestPage"
// <Route path="/invest" element={<InvestPage />} />   （删掉该行的 PagePlaceholder 与 TrendingUp import——若无他用）
```

- [ ] **Step 7: 验证 + Commit**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.node.json --noEmit && npm run build   # 零错误
# 全栈起服（后端记 PID），浏览器不可用则 curl 断言 API + dev server 对 /invest 返回 HTML；
# 手动建一个 manual 资产 + 交易 → GET /api/positions 出现该行 → 删除清理
git add frontend/src   # 显式
git commit -m "feat(frontend): invest page — positions, trades, charts, asset dialogs"
```

### Task 2.10: Dashboard 接线 + 冒烟第 8 步 + 文档 + 收尾

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`、`frontend/scripts/smoke.mjs`、`README.md`、`CLAUDE.md`、`backend/.env.example`（若 2.1 未加）

**Interfaces:**
- Consumes: api.getPositions/getPositionsHistory、ValueChart
- Produces: Dashboard 投资组合卡实际数据 + 收益曲线卡；冒烟第 8 步；文档同步

- [ ] **Step 1: Dashboard.tsx**
  - 投资组合卡：`useQuery(["positions"], api.getPositions)` → value `¥ total_value_cny.toLocaleString()`（保留 0 位小数），sub 显示总盈亏（着色）；无持仓显示 "—" + sub "去添加资产"
  - 收益曲线卡（替换"阶段 2 上线"占位）：`useQuery(["positions-history", 30], () => api.getPositionsHistory(30))` → 有数据 `<ValueChart points height={160} />`，无数据占位文案
  - 其余卡片不动

- [ ] **Step 2: smoke.mjs 第 8 步（投资链路，API 级 + 页面断言）**

```js
// 8. 投资链路：token 从 localStorage 取，用 Playwright request 直调 API
const token = await page.evaluate(() => localStorage.getItem("token"))
const apiReq = await chromium.request ? null : null // 用 page.request 即可
const created = await page.request.post(BASE + "/api/assets", {
  headers: { Authorization: "Bearer " + token },
  data: { symbol: "SMOKETEST", name: "冒烟测试资产", type: "other", price_source: "manual", currency: "USD" },
})
if (!created.ok()) throw new Error("create asset failed: " + created.status())
const { id: assetId } = await created.json()
await page.request.put(BASE + `/api/assets/${assetId}/price`, { headers: { Authorization: "Bearer " + token }, data: { price: 100 } })
const tr = await page.request.post(BASE + "/api/trades", {
  headers: { Authorization: "Bearer " + token },
  data: { asset_id: assetId, side: "buy", quantity: 2, price: 90, fee: 0, traded_at: new Date().toISOString().slice(0, 10) },
})
if (!tr.ok()) throw new Error("create trade failed: " + tr.status())
const pos = await (await page.request.get(BASE + "/api/positions", { headers: { Authorization: "Bearer " + token } })).json()
const row = pos.positions.find((p) => p.asset.symbol === "SMOKETEST")
if (!row || Math.abs(row.quantity - 2) > 1e-9 || Math.abs(row.avg_cost - 90) > 1e-9) throw new Error("position mismatch: " + JSON.stringify(row))
await page.goto(BASE + "/invest", { waitUntil: "networkidle" })
await page.waitForSelector("text=SMOKETEST", { timeout: 10_000 })
// 清理：删交易→删资产
const tradeId = tr.headers ? (await tr.json()).id : null
if (tradeId) await page.request.delete(BASE + `/api/trades/${tradeId}`, { headers: { Authorization: "Bearer " + token } })
await page.request.delete(BASE + `/api/assets/${assetId}`, { headers: { Authorization: "Bearer " + token } })
console.log("STEP8 INVEST PASS")
```

（实现者按 smoke.mjs 现有风格整合，`tr.json()` 只可消费一次——先 `const trJson = await tr.json()` 再用；BASE、token 获取沿用现有步骤模式。）

- [ ] **Step 3: 文档**
  - README：技术栈表加 robfig/cron；API 文档表加 invest 端点组（照契约速查）；数据库设计加 3 表简表；「板块」进度更新（阶段 2 完成）；环境变量表加 QUOTE_PROXY
  - CLAUDE.md：Backend 结构加 pkg/portfolio、pkg/quote、service/snapshot、handler(asset/trade/invest)；Key Design Decisions 加「持仓不落表，trades 推导」「行情三级降级」「每日快照 06:00 CST + 启动补跑」；smoke 描述更新为 8 步

- [ ] **Step 4: 全量验证**

```bash
cd backend && go build ./... && go vet ./... && go test ./... 2>&1 | grep -v "no test files"   # portfolio+quote 测试全绿
cd ../frontend && npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.node.json --noEmit && npm run build
# 全栈起服跑冒烟: SMOKE_USER=smoketest SMOKE_PASS='Smoke#2026' BASE_URL=http://localhost:3001 node frontend/scripts/smoke.mjs → SMOKE PASS ✅ + STEP8 INVEST PASS
# 清理全部测试数据与进程（按 PID）
```

- [ ] **Step 5: Commit + （控制器决定合并推送）** `feat: phase 2 complete — investment module with live quotes and portfolio analytics`

---

## Self-Review 记录

- **Spec 覆盖**：§3.1 三表 DDL（2.1）、持仓推导+纯函数测试（2.2/§9）、§4.1 降级链 Yahoo→Stooq→兜底（2.3/2.4）、§4.2 60s 缓存+每日快照 06:00+回填一年+代理（2.3/2.6/2.1）、§4.3 积存金换算（2.4）、§5 invest 全部端点（2.5/2.7/2.8）、§7 /invest 页面结构（2.9）+ Dashboard 接线（2.10）、§8 行情失败降级不白屏（2.3 Stale 机制 + 2.9 null 显示）、§9 纯逻辑单测+冒烟投资链路（2.2/2.4/2.7/2.10）。spec §7 的"资产占比饼图"在 2.9 降级为占比条（YAGNI，页面注明）——**偏差已在任务内声明**。缺口：无。
- **占位符扫描**：2.9 Step 4/5 前端页面给的是结构化要求而非逐行代码（页面惯例已在 1.5-1.9 确立，实现者按仓库模式编写）——属有意的"完整需求+惯例引用"，其余任务均为完整代码。无 TBD/TODO。
- **类型一致性**：ComputePosition/Trade/Position（2.2）↔ invest.go 消费（2.5）↔ ValueCurve 输入（2.7）签名逐字核对；quote.Service 方法名 Quotes/BackfillHistory/USDCNY 在 2.3 定义、2.4/2.5/2.6/2.7/2.8 消费一致；NewService 签名在 2.5 Step 4 收口为 (cfg, db, rdb) 并已注明覆盖 2.3 的变参版本；前端 types ↔ 契约速查逐字段一致（snake_case）；GOLD_CNY_G/quote.GoldSymbol 单一来源。
