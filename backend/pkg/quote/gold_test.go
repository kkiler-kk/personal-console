package quote

import (
	"context"
	"testing"
)

func TestConvertGoldToCNYGram(t *testing.T) {
	// 3110.35 USD/oz ÷ 31.1035 g/oz × 7.0 = 700.00 CNY/g（精确）。
	if got := ConvertGoldToCNYGram(3110.35, 7.0); got != 700.00 {
		t.Fatalf("got %v want 700.00", got)
	}
	// 2000 ÷ 31.1035 × 7.2 = 462.9704… → 462.97 CNY/g（四舍五入 2 位）。
	// 注：brief 写 462.9423/462.94 系算术笔误；正确值为 462.97，详见任务报告。
	if got := ConvertGoldToCNYGram(2000, 7.2); got != 462.97 {
		t.Fatalf("got %v want 462.97", got)
	}
}

func TestGoldResolverComputesCNYGram(t *testing.T) {
	// provider 链提供 GC=F（USD/oz）与 CNY=X（USDCNY）；解析器换算为 CNY/g。
	p := &fakeProvider{name: "p", quotes: map[string]*RawQuote{
		goldFuturesSymbol: {Price: 3110.35, PreviousClose: 3000, Currency: "USD"},
		fxSymbol:          {Price: 7.0, PreviousClose: 6.9, Currency: "CNY"},
	}}
	s := newServiceWithProviders(nil, nil, nil, p)
	s.gold = newGoldResolver(s)

	got := s.Quotes(context.Background(), []string{GoldSymbol})
	q, ok := got[GoldSymbol]
	if !ok {
		t.Fatalf("gold quote missing: %+v", got)
	}
	if q.Price != 700.00 {
		t.Fatalf("price=%v want 700.00", q.Price)
	}
	if q.Currency != "CNY" {
		t.Fatalf("currency=%v want CNY", q.Currency)
	}
	wantPrev := ConvertGoldToCNYGram(3000, 6.9)
	if q.PreviousClose != wantPrev {
		t.Fatalf("prev=%v want %v", q.PreviousClose, wantPrev)
	}
	if q.Stale {
		t.Fatalf("fresh gold should not be stale: %+v", q)
	}
	if q.Symbol != GoldSymbol {
		t.Fatalf("symbol=%v want %v", q.Symbol, GoldSymbol)
	}
}

func TestGoldResolverZeroPrevGivesZeroPrev(t *testing.T) {
	// 任一 prev<=0 → 换算后的 PreviousClose 归零（不用不可靠的昨收）。
	p := &fakeProvider{name: "p", quotes: map[string]*RawQuote{
		goldFuturesSymbol: {Price: 3110.35, PreviousClose: 0, Currency: "USD"},
		fxSymbol:          {Price: 7.0, PreviousClose: 6.9, Currency: "CNY"},
	}}
	s := newServiceWithProviders(nil, nil, nil, p)
	s.gold = newGoldResolver(s)

	q := s.Quotes(context.Background(), []string{GoldSymbol})[GoldSymbol]
	if q.Price != 700.00 {
		t.Fatalf("price=%v want 700.00", q.Price)
	}
	if q.PreviousClose != 0 {
		t.Fatalf("prev should be 0 when either prev<=0, got %v", q.PreviousClose)
	}
}

func TestGoldResolverFallbackWhenFXMissing(t *testing.T) {
	// GC=F 可得但 CNY=X 缺失 → 解析失败 → GoldSymbol 走兜底（无 db 则缺席）。
	p := &fakeProvider{name: "p", quotes: map[string]*RawQuote{
		goldFuturesSymbol: {Price: 3110.35, Currency: "USD"},
	}}
	s := newServiceWithProviders(nil, nil, nil, p)
	s.gold = newGoldResolver(s)

	got := s.Quotes(context.Background(), []string{GoldSymbol})
	if _, ok := got[GoldSymbol]; ok {
		t.Fatalf("gold should be absent when FX unresolvable, got=%+v", got)
	}
}
