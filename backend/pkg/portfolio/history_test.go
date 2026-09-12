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
	if len(got) != 3 {
		t.Fatalf("got %+v", got)
	}
	if got[0].Value != 8400 || got[0].Cost != 7000 || got[0].Pnl != 1400 {
		t.Fatalf("d0=%+v", got[0])
	}
	if got[1].Value != 7700 {
		t.Fatalf("d1=%+v", got[1])
	}
	if got[2].Value != 8400 || got[2].Date != "2026-09-11" {
		t.Fatalf("d2=%+v", got[2])
	}
}

func TestValueCurveEmptyPositionDaysSkipped(t *testing.T) {
	trades := []TradeRow{{AssetID: 1, Side: "buy", Quantity: 1, Price: 10, Fee: 0, TradedAt: d("2026-09-05")}}
	got := ValueCurve(trades, nil, []AssetMeta{{ID: 1, Currency: "CNY", CurrentPrice: 0}}, []time.Time{d("2026-09-01")}, 7.0)
	if len(got) != 0 {
		t.Fatalf("want skip, got %+v", got)
	} // 无价且无持仓价值 → 跳过
}

func TestValueCurveCNYAssetNoFx(t *testing.T) {
	trades := []TradeRow{{AssetID: 2, Side: "buy", Quantity: 100, Price: 700, Fee: 0, TradedAt: d("2026-09-01")}}
	closes := []CloseRow{{AssetID: 2, Date: d("2026-09-10"), Close: 710}}
	got := ValueCurve(trades, closes, []AssetMeta{{ID: 2, Currency: "CNY"}}, []time.Time{d("2026-09-10")}, 7.0)
	if got[0].Value != 71000 || got[0].Cost != 70000 {
		t.Fatalf("got %+v", got[0])
	} // CNY 不乘汇率
}
