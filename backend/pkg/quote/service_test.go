package quote

import (
	"context"
	"errors"
	"math"
	"net/http"
	"net/url"
	"sync/atomic"
	"testing"
)

// fakeProvider 为可编排的 Provider 桩。
type fakeProvider struct {
	name   string
	quotes map[string]*RawQuote // 命中返回报价
	err    error                // 未命中时返回的错误（nil 则返回 ErrUnsupported）
	hist   map[string][]HistoryPoint
}

func (f *fakeProvider) Name() string { return f.name }

func (f *fakeProvider) Fetch(_ context.Context, symbol string) (*RawQuote, error) {
	if q, ok := f.quotes[symbol]; ok {
		return q, nil
	}
	if f.err != nil {
		return nil, f.err
	}
	return nil, ErrUnsupported
}

func (f *fakeProvider) History(_ context.Context, symbol string, _ int) ([]HistoryPoint, error) {
	if h, ok := f.hist[symbol]; ok {
		return h, nil
	}
	if f.err != nil {
		return nil, f.err
	}
	return nil, ErrUnsupported
}

func TestServiceQuotesProviderChainFallback(t *testing.T) {
	// 一级源对 AAPL 显式失败、对 QQQ 不支持；二级源兜住两者。
	primary := &fakeProvider{name: "primary", err: errors.New("network down")}
	secondary := &fakeProvider{name: "secondary", quotes: map[string]*RawQuote{
		"AAPL": {Price: 228.5, PreviousClose: 225.1, Currency: "USD"},
		"QQQ":  {Price: 480.2, PreviousClose: 475.0, Currency: "USD"},
	}}
	s := newServiceWithProviders(nil, nil, nil, primary, secondary)

	got := s.Quotes(context.Background(), []string{"AAPL", "QQQ"})
	if len(got) != 2 {
		t.Fatalf("got=%+v", got)
	}
	q := got["AAPL"]
	if q.Price != 228.5 || q.PreviousClose != 225.1 || q.Currency != "USD" {
		t.Fatalf("AAPL=%+v", q)
	}
	if q.Stale || q.Symbol != "AAPL" || q.UpdatedAt.IsZero() {
		t.Fatalf("AAPL meta=%+v", q)
	}
	if got["QQQ"].Price != 480.2 {
		t.Fatalf("QQQ=%+v", got["QQQ"])
	}
}

func TestServiceQuotesAllFailWithoutDBSkipsSymbol(t *testing.T) {
	p := &fakeProvider{name: "only", err: errors.New("boom")}
	s := newServiceWithProviders(nil, nil, nil, p)

	got := s.Quotes(context.Background(), []string{"AAPL", "", GoldSymbol})
	if len(got) != 0 {
		t.Fatalf("want empty map (no stale fallback without db), got=%+v", got)
	}
}

func TestServiceQuotesDeduplicatesAndKeepsInputOrderSafe(t *testing.T) {
	p := &fakeProvider{name: "p", quotes: map[string]*RawQuote{
		"AAPL": {Price: 1, Currency: "USD"},
	}}
	s := newServiceWithProviders(nil, nil, nil, p)
	got := s.Quotes(context.Background(), []string{"AAPL", "AAPL"})
	if len(got) != 1 || got["AAPL"].Price != 1 {
		t.Fatalf("got=%+v", got)
	}
}

func TestServiceUSDCNYProviderAndFallback(t *testing.T) {
	fx := &fakeProvider{name: "fx", quotes: map[string]*RawQuote{
		"CNY=X": {Price: 7.1234, Currency: "CNY"},
	}}
	s := newServiceWithProviders(nil, nil, nil, fx)
	if rate := s.USDCNY(context.Background()); rate != 7.1234 {
		t.Fatalf("rate=%v want 7.1234", rate)
	}

	down := &fakeProvider{name: "down", err: errors.New("boom")}
	s2 := newServiceWithProviders(nil, nil, nil, down)
	if rate := s2.USDCNY(context.Background()); rate != fxFallbackRate {
		t.Fatalf("rate=%v want fallback %.1f", rate, fxFallbackRate)
	}
}

// fx 缓存中的 "+Inf" 能通过 ParseFloat 且 >0 为真，必须按 corrupted 处理走降级链，
// 而非把 +Inf 喂给下游 json.Marshal（终审 M-1）。真 Redis 不可达时 Skip。
func TestServiceUSDCNYCacheInfTreatedAsCorrupted(t *testing.T) {
	rdb := testRedisClient(t)
	fundTestKeys(t, rdb, fxCacheKey)
	ctx := context.Background()
	if err := rdb.Set(ctx, fxCacheKey, "+Inf", fxCacheTTL).Err(); err != nil {
		t.Fatalf("seed corrupted fx cache: %v", err)
	}

	// provider 可用：视为缓存脏数据，降级到 provider 取真实汇率。
	fx := &fakeProvider{name: "fx", quotes: map[string]*RawQuote{
		"CNY=X": {Price: 7.1234, Currency: "CNY"},
	}}
	s := newServiceWithProviders(nil, nil, rdb, fx)
	if rate := s.USDCNY(ctx); rate != 7.1234 {
		t.Fatalf("rate=%v want 7.1234 (+Inf cache must fall through to provider)", rate)
	}

	// provider 全挂：重种 +Inf 后应落到 7.0 兜底，两条路径都不得返回 ±Inf。
	if err := rdb.Set(ctx, fxCacheKey, "+Inf", fxCacheTTL).Err(); err != nil {
		t.Fatalf("re-seed corrupted fx cache: %v", err)
	}
	down := &fakeProvider{name: "down", err: errors.New("boom")}
	s2 := newServiceWithProviders(nil, nil, rdb, down)
	rate := s2.USDCNY(ctx)
	if math.IsInf(rate, 0) {
		t.Fatalf("+Inf leaked from corrupted fx cache: rate=%v", rate)
	}
	if rate != fxFallbackRate {
		t.Fatalf("rate=%v want fallback %.1f", rate, fxFallbackRate)
	}
}

func TestServiceBackfillHistoryNoPanicWithoutDB(t *testing.T) {
	s := newServiceWithProviders(nil, nil, nil, &fakeProvider{name: "p"})
	s.BackfillHistory(context.Background(), "AAPL", 30) // 只 log，不 panic
}

func TestServiceGoldHookNilSkips(t *testing.T) {
	p := &fakeProvider{name: "p", quotes: map[string]*RawQuote{}}
	s := newServiceWithProviders(nil, nil, nil, p)
	if s.gold != nil {
		t.Fatal("gold hook should default to nil")
	}
	got := s.Quotes(context.Background(), []string{GoldSymbol})
	if _, ok := got[GoldSymbol]; ok {
		t.Fatalf("gold quote should be absent while resolver is nil, got=%+v", got)
	}
}

// countingProvider 记录 Fetch 调用次数，验证 force 路径确实打到 provider 层。
type countingProvider struct {
	fakeProvider
	calls atomic.Int32
}

func (c *countingProvider) Fetch(ctx context.Context, symbol string) (*RawQuote, error) {
	c.calls.Add(1)
	return c.fakeProvider.Fetch(ctx, symbol)
}

// 迭代六（强制刷新）：无 Redis 环境下 QuotesForce 与 Quotes 行为完全一致——
// provider 被调、成功结果字段正确（非 stale）、全链失败且无 DB 时同样缺席 map。
// force 跳缓存的实证依赖真 Redis，走 8090 集成验证（控制器裁决：不引 redis 假件依赖）。
func TestServiceQuotesForceMatchesQuotesWithoutRedis(t *testing.T) {
	p := &countingProvider{fakeProvider: fakeProvider{name: "p", quotes: map[string]*RawQuote{
		"AAPL": {Price: 228.5, PreviousClose: 225.1, Currency: "USD"},
	}}}
	s := newServiceWithProviders(nil, nil, nil, p)
	ctx := context.Background()

	// 成功路径：字段与 Quotes 一致（UpdatedAt 为时间戳，只断言非零）。
	want := s.Quotes(ctx, []string{"AAPL", "", "AAPL"})
	got := s.QuotesForce(ctx, []string{"AAPL", "", "AAPL"})
	if len(want) != 1 || len(got) != 1 {
		t.Fatalf("len(want)=%d len(got)=%d, want 1/1（去重+空串跳过）", len(want), len(got))
	}
	if p.calls.Load() != 2 {
		t.Fatalf("provider calls=%d want 2（无缓存环境下 Quotes/QuotesForce 各打一次）", p.calls.Load())
	}
	q, w := got["AAPL"], want["AAPL"]
	if q.Price != w.Price || q.PreviousClose != w.PreviousClose || q.Currency != w.Currency ||
		q.Symbol != w.Symbol || q.Stale != w.Stale || q.Stale {
		t.Fatalf("QuotesForce=%+v 与 Quotes=%+v 行为不一致", q, w)
	}
	if q.UpdatedAt.IsZero() {
		t.Fatal("QuotesForce 成功结果 UpdatedAt 不应为零值")
	}

	// 全链失败 + 无 DB：与 Quotes 一致地缺席 map（无 stale 兜底），且不 panic。
	down := &fakeProvider{name: "down", err: errors.New("boom")}
	s2 := newServiceWithProviders(nil, nil, nil, down)
	if got := s2.QuotesForce(ctx, []string{"AAPL"}); len(got) != 0 {
		t.Fatalf("force 全链失败无 DB 应为空 map, got=%+v", got)
	}
}

// 迭代六（强制刷新）：无 Redis 环境下 PEsForce 与 PEs 行为一致——
// v7 被调、有值/null 条目解析正确、空入参零网络。复用 fundamentals_test.go 的
// httptest 假 crumb 流程（rdb=nil，不碰 Redis）。
func TestServicePEsForceMatchesPEsWithoutRedis(t *testing.T) {
	f := newFakeFundServer(t,
		func(int32) (int, string) { return http.StatusOK, "CRUMB123" },
		func(int32, url.Values) (int, string) { return http.StatusOK, v7FixtureBody })
	s := newFundTestService(f, nil)
	ctx := context.Background()

	got := s.PEsForce(ctx, []string{"AAPL", "GC=F", "", "AAPL"})
	if len(got) != 2 {
		t.Fatalf("len=%d want 2（去重+空串跳过）, got=%v", len(got), got)
	}
	if pe := got["AAPL"]; pe == nil || *pe != 31.4 {
		t.Fatalf("AAPL pe=%v want 31.4", pe)
	}
	if pe, ok := got["GC=F"]; !ok || pe != nil {
		t.Fatalf("GC=F want present nil entry, ok=%v pe=%v", ok, pe)
	}
	if f.v7Calls.Load() != 1 {
		t.Fatalf("v7Calls=%d want 1（一次批量请求）", f.v7Calls.Load())
	}

	// 空入参：零网络零 Redis，返回空 map（与 PEs 同款安全语义）。
	if empty := s.PEsForce(ctx, nil); len(empty) != 0 {
		t.Fatalf("empty symbols want empty map, got=%v", empty)
	}
	if n := f.v7Calls.Load(); n != 1 {
		t.Fatalf("empty symbols triggered v7 (calls=%d)", n)
	}

	// 上游失败：nil 条目降级，不 panic（rdb=nil 时 null 缓存写为 no-op）。
	f2 := newFakeFundServer(t,
		func(int32) (int, string) { return http.StatusInternalServerError, "boom" },
		func(int32, url.Values) (int, string) { return http.StatusOK, v7FixtureBody })
	s2 := newFundTestService(f2, nil)
	if pe, ok := s2.PEsForce(ctx, []string{"AAPL"})["AAPL"]; !ok || pe != nil {
		t.Fatalf("force 失败降级 want present nil entry, ok=%v pe=%v", ok, pe)
	}
}

// NewService 组装的降级链必须为 Yahoo → Stooq → FundCN（末位为 6 位数字基金码兜底，
// 前两源对基金码都会在发请求前快速 ErrUnsupported），且 GoldSymbol 特判仍由 goldResolver 承担。
func TestNewServiceProviderChainOrder(t *testing.T) {
	s := NewService(nil, nil, nil)

	want := []string{"yahoo", "stooq", "fund_cn"}
	if len(s.providers) != len(want) {
		names := make([]string, 0, len(s.providers))
		for _, p := range s.providers {
			names = append(names, p.Name())
		}
		t.Fatalf("provider chain = %v, want %v", names, want)
	}
	for i, name := range want {
		if got := s.providers[i].Name(); got != name {
			t.Fatalf("providers[%d] = %q, want %q", i, got, name)
		}
	}
	if s.gold == nil {
		t.Fatal("NewService 必须注入 goldResolver")
	}
}
