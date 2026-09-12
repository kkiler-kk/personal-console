// Package quote 提供投资模块行情子系统：Provider 降级链 + Redis 缓存 + DB 兜底。
//
// 降级顺序（Quotes）：Redis 60s 缓存 → provider 链（Yahoo → Stooq）
// → assets.current_price 兜底（Stale=true）→ 无兜底则该 symbol 缺席并 log。
// 行情失败只降级不抛出：Quotes 永不返回 error。
package quote

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"blog/config"

	"github.com/go-redis/redis/v8"
	"github.com/jmoiron/sqlx"
)

// RawQuote 为 provider 返回的原始报价（无 symbol/时间戳语义）。
type RawQuote struct {
	Price         float64
	PreviousClose float64
	Currency      string
}

// HistoryPoint 为历史收盘价单点。
type HistoryPoint struct {
	Date  time.Time // 当日 00:00 UTC
	Close float64
}

// Quote 为对外暴露的报价（含兜底标记）。
type Quote struct {
	Symbol        string    `json:"symbol"`
	Price         float64   `json:"price"`
	PreviousClose float64   `json:"previous_close"`
	Currency      string    `json:"currency"`
	UpdatedAt     time.Time `json:"updated_at"`
	Stale         bool      `json:"stale"`
}

// Provider 为行情源接口；不支持的 symbol 应返回 ErrUnsupported。
type Provider interface {
	Name() string
	Fetch(ctx context.Context, symbol string) (*RawQuote, error)
	History(ctx context.Context, symbol string, days int) ([]HistoryPoint, error)
}

// ErrUnsupported 表示 provider 不支持该 symbol（降级链静默跳到下一个）。
var ErrUnsupported = errors.New("symbol unsupported by provider")

// GoldResolver 解析 GoldSymbol（人民币金价/克）报价。
// 由 gold.go 的 goldResolver 实现（GC=F × USDCNY ÷ GramsPerTroyOunce）；NewService 注入，nil 时跳过。
type GoldResolver interface {
	ResolveGold(ctx context.Context) (*RawQuote, error)
}

const (
	// GoldSymbol 为积存金（人民币/克）的虚拟 symbol，price_source=computed_gold_cny。
	GoldSymbol = "GOLD_CNY_G"
	// GramsPerTroyOunce 为金衡盎司克数（积存金 CNY/克换算用）。
	GramsPerTroyOunce = 31.1035
)

const (
	quoteCacheTTL      = 60 * time.Second
	quoteCachePrefix   = "quote:"
	fxCacheKey         = "fx:usdcny"
	fxCacheTTL         = 3600 * time.Second
	fxSymbol           = "CNY=X"
	fxFallbackRate     = 7.0
	defaultHTTPTimeout = 10 * time.Second
)

// Service 为行情服务。构造后无共享可变状态：providers/client/db/rdb 均并发安全，
// 可被多 goroutine 同时调用。
type Service struct {
	providers []Provider
	db        *sqlx.DB
	rdb       *redis.Client
	client    *http.Client // 带代理的共享 client，供 provider 复用
	gold      GoldResolver // NewService 注入 goldResolver；nil（如测试构造）时 GoldSymbol 走兜底
}

// NewService 组装行情服务（Ruling-1 固定签名）：
// QuoteProxy 非空时经代理访问外网，超时 10s；provider 降级链为 Yahoo → Stooq；
// 并注入 goldResolver 解析 GoldSymbol（GC=F × USDCNY → CNY/克）。
func NewService(cfg *config.Config, db *sqlx.DB, rdb *redis.Client) *Service {
	client := newHTTPClient(cfg)
	s := newServiceWithProviders(cfg, db, rdb, NewYahooProvider(client), NewStooqProvider(client))
	s.gold = newGoldResolver(s)
	return s
}

// newServiceWithProviders 供测试注入 fake provider / 替换 provider 链。
func newServiceWithProviders(cfg *config.Config, db *sqlx.DB, rdb *redis.Client, providers ...Provider) *Service {
	return &Service{
		providers: providers,
		db:        db,
		rdb:       rdb,
		client:    newHTTPClient(cfg),
	}
}

func newHTTPClient(cfg *config.Config) *http.Client {
	client := &http.Client{Timeout: defaultHTTPTimeout}
	if cfg == nil || cfg.QuoteProxy == "" {
		return client
	}
	u, err := url.Parse(cfg.QuoteProxy)
	if err != nil {
		log.Printf("quote: invalid QUOTE_PROXY %q: %v (falling back to direct)", cfg.QuoteProxy, err)
		return client
	}
	return &http.Client{
		Timeout:   defaultHTTPTimeout,
		Transport: &http.Transport{Proxy: http.ProxyURL(u)},
	}
}

// Quotes 批量报价，永不返回 error（内部降级 + log）：
//  1. Redis "quote:<symbol>" 60s 命中直接返回；
//  2. GoldSymbol 走 s.gold（nil 时跳过至兜底）；
//  3. provider 链第一个成功者：缓存 60s + 写回 assets.current_price（best-effort）；
//  4. 全链失败：读 assets 兜底（Stale=true）；无兜底则该 symbol 缺席 map 并 log。
func (s *Service) Quotes(ctx context.Context, symbols []string) map[string]Quote {
	out := make(map[string]Quote, len(symbols))
	for _, symbol := range symbols {
		if symbol == "" {
			continue
		}
		if _, ok := out[symbol]; ok {
			continue
		}
		if q, ok := s.cachedQuote(ctx, symbol); ok {
			out[symbol] = q
			continue
		}
		if raw, ok := s.fetchFresh(ctx, symbol); ok {
			q := Quote{
				Symbol:        symbol,
				Price:         raw.Price,
				PreviousClose: raw.PreviousClose,
				Currency:      raw.Currency,
				UpdatedAt:     time.Now().UTC(),
				Stale:         false,
			}
			s.cacheQuote(ctx, q)
			s.writeBackPrice(ctx, symbol, raw.Price)
			out[symbol] = q
			continue
		}
		if q, ok := s.staleQuote(ctx, symbol); ok {
			out[symbol] = q
			continue
		}
		log.Printf("quote: %s unavailable from all providers and no stale fallback, skipping", symbol)
	}
	return out
}

// fetchFresh 依次尝试 gold hook 与 provider 链，返回第一个成功的原始报价。
func (s *Service) fetchFresh(ctx context.Context, symbol string) (*RawQuote, bool) {
	if symbol == GoldSymbol {
		if s.gold == nil {
			log.Printf("quote: gold resolver not installed, %s falls back", symbol)
			return nil, false
		}
		raw, err := s.gold.ResolveGold(ctx)
		if err != nil || raw == nil || raw.Price <= 0 {
			log.Printf("quote: gold resolver failed for %s: %v", symbol, err)
			return nil, false
		}
		return raw, true
	}
	for _, p := range s.providers {
		raw, err := p.Fetch(ctx, symbol)
		if err != nil {
			if !errors.Is(err, ErrUnsupported) {
				log.Printf("quote: provider %s fetch %s failed: %v", p.Name(), symbol, err)
			}
			continue
		}
		if raw == nil || raw.Price <= 0 {
			log.Printf("quote: provider %s returned invalid quote for %s: %+v", p.Name(), symbol, raw)
			continue
		}
		return raw, true
	}
	return nil, false
}

// cachedQuote 读取 Redis 60s 缓存；Redis 不可用/miss/脏数据均按 miss 处理。
func (s *Service) cachedQuote(ctx context.Context, symbol string) (Quote, bool) {
	if s.rdb == nil {
		return Quote{}, false
	}
	data, err := s.rdb.Get(ctx, quoteCachePrefix+symbol).Bytes()
	if err != nil {
		if !errors.Is(err, redis.Nil) {
			log.Printf("quote: redis get %s: %v", symbol, err)
		}
		return Quote{}, false
	}
	var q Quote
	if err := json.Unmarshal(data, &q); err != nil {
		log.Printf("quote: corrupted cache entry %s: %v", symbol, err)
		return Quote{}, false
	}
	return q, true
}

// cacheQuote 写入 Redis 60s 缓存（best-effort；失败结果不缓存，见报告自审）。
func (s *Service) cacheQuote(ctx context.Context, q Quote) {
	if s.rdb == nil {
		return
	}
	data, err := json.Marshal(q)
	if err != nil {
		log.Printf("quote: marshal cache entry %s: %v", q.Symbol, err)
		return
	}
	if err := s.rdb.Set(ctx, quoteCachePrefix+q.Symbol, data, quoteCacheTTL).Err(); err != nil {
		log.Printf("quote: redis set %s: %v", q.Symbol, err)
	}
}

// writeBackPrice 将最新价写回 assets（best-effort，仅 log）。
func (s *Service) writeBackPrice(ctx context.Context, symbol string, price float64) {
	if s.db == nil {
		return
	}
	_, err := s.db.ExecContext(ctx,
		`UPDATE assets SET current_price=?, price_updated_at=NOW() WHERE symbol=?`,
		price, symbol)
	if err != nil {
		log.Printf("quote: write back price for %s: %v", symbol, err)
	}
}

// staleQuote 全链失败时读 assets 兜底（Stale=true）；无行或价格为 NULL 视为无兜底。
func (s *Service) staleQuote(ctx context.Context, symbol string) (Quote, bool) {
	if s.db == nil {
		return Quote{}, false
	}
	var row struct {
		CurrentPrice   *float64   `db:"current_price"`
		Currency       string     `db:"currency"`
		PriceUpdatedAt *time.Time `db:"price_updated_at"`
	}
	err := s.db.GetContext(ctx, &row,
		`SELECT current_price, currency, price_updated_at FROM assets WHERE symbol=?`, symbol)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			log.Printf("quote: stale lookup %s: %v", symbol, err)
		}
		return Quote{}, false
	}
	if row.CurrentPrice == nil {
		return Quote{}, false
	}
	q := Quote{
		Symbol:   symbol,
		Price:    *row.CurrentPrice,
		Currency: row.Currency,
		Stale:    true,
	}
	if row.PriceUpdatedAt != nil {
		q.UpdatedAt = *row.PriceUpdatedAt
	}
	return q, true
}

// USDCNY 返回美元/人民币汇率：Redis "fx:usdcny" 1h → provider 链 Fetch("CNY=X")
// → 全失败兜底 7.0（log warn）。永不返回 error。
func (s *Service) USDCNY(ctx context.Context) float64 {
	if s.rdb != nil {
		if v, err := s.rdb.Get(ctx, fxCacheKey).Result(); err == nil {
			if rate, perr := strconv.ParseFloat(v, 64); perr == nil && rate > 0 {
				return rate
			}
			log.Printf("quote: corrupted %s cache value %q", fxCacheKey, v)
		} else if !errors.Is(err, redis.Nil) {
			log.Printf("quote: redis get %s: %v", fxCacheKey, err)
		}
	}
	for _, p := range s.providers {
		raw, err := p.Fetch(ctx, fxSymbol)
		if err != nil {
			if !errors.Is(err, ErrUnsupported) {
				log.Printf("quote: provider %s fetch %s failed: %v", p.Name(), fxSymbol, err)
			}
			continue
		}
		if raw == nil || raw.Price <= 0 {
			continue
		}
		if s.rdb != nil {
			if err := s.rdb.Set(ctx, fxCacheKey, strconv.FormatFloat(raw.Price, 'f', 4, 64), fxCacheTTL).Err(); err != nil {
				log.Printf("quote: redis set %s: %v", fxCacheKey, err)
			}
		}
		return raw.Price
	}
	log.Printf("quote: WARN USDCNY unavailable from all providers, falling back to %.1f", fxFallbackRate)
	return fxFallbackRate
}

// BackfillHistory 回填历史收盘价：provider 链第一个 History 成功者逐点 upsert 到
// price_history；只 log 不上抛。days 用于截取最近 N 个点（provider 可能返回超集）。
func (s *Service) BackfillHistory(ctx context.Context, symbol string, days int) {
	if s.db == nil {
		log.Printf("quote: backfill %s skipped: db not configured", symbol)
		return
	}
	for _, p := range s.providers {
		points, err := p.History(ctx, symbol, days)
		if err != nil {
			if !errors.Is(err, ErrUnsupported) {
				log.Printf("quote: provider %s history %s failed: %v", p.Name(), symbol, err)
			}
			continue
		}
		if days > 0 && len(points) > days {
			points = points[len(points)-days:] // 取最近 days 个点
		}
		saved, failed := 0, 0
		for _, pt := range points {
			_, err := s.db.ExecContext(ctx,
				`INSERT INTO price_history (symbol, date, close) VALUES (?,?,?)
				 ON DUPLICATE KEY UPDATE close=VALUES(close)`,
				symbol, pt.Date, pt.Close)
			if err != nil {
				failed++
				log.Printf("quote: backfill %s %s: %v", symbol, pt.Date.Format("2006-01-02"), err)
				continue
			}
			saved++
		}
		log.Printf("quote: backfilled %s via %s: %d saved, %d failed", symbol, p.Name(), saved, failed)
		return
	}
	log.Printf("quote: backfill %s failed: no provider returned history", symbol)
}
