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
	if err != nil {
		t.Fatal(err)
	}
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
	if !almost(pos.RealizedPnl, 79) {
		t.Fatalf("realized=%v", pos.RealizedPnl)
	}
	if !almost(pos.Quantity, 6) || !almost(pos.AvgCost, 100) {
		t.Fatalf("pos=%+v", pos)
	}
	if !almost(pos.UnrealizedPnl, 180) || !almost(pos.MarketValue, 780) {
		t.Fatalf("pos=%+v", pos)
	}
}

func TestFullSell(t *testing.T) {
	pos, _ := ComputePosition([]Trade{
		{Side: "buy", Quantity: 10, Price: 100, Fee: 2},
		{Side: "sell", Quantity: 10, Price: 110, Fee: 2},
	}, nil)
	// realized = 10*110 - 2 - (1000+2) = 96
	if !almost(pos.RealizedPnl, 96) || !almost(pos.Quantity, 0) || !almost(pos.CostBasis, 0) {
		t.Fatalf("pos=%+v", pos)
	}
	if pos.MarketValue != 0 || pos.UnrealizedPnl != 0 {
		t.Fatalf("nil price must zero valuation: %+v", pos)
	}
}

func TestOversell(t *testing.T) {
	_, err := ComputePosition([]Trade{
		{Side: "buy", Quantity: 5, Price: 100, Fee: 0},
		{Side: "sell", Quantity: 6, Price: 100, Fee: 0},
	}, nil)
	if !errors.Is(err, ErrOversell) {
		t.Fatalf("want ErrOversell, got %v", err)
	}
}

func TestEmptyTrades(t *testing.T) {
	pos, err := ComputePosition(nil, p(100))
	if err != nil || pos.Quantity != 0 || pos.RealizedPnl != 0 {
		t.Fatalf("pos=%+v err=%v", pos, err)
	}
}
