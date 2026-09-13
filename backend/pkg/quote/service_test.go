package quote

import (
	"context"
	"errors"
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
