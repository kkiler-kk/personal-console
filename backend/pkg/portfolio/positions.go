// Package portfolio 提供持仓盈亏计算的纯函数（加权平均成本法），无外部依赖。
package portfolio

import "errors"

// Trade 表示一笔已发生的交易。
type Trade struct {
	Side     string // "buy" | "sell"
	Quantity float64
	Price    float64
	Fee      float64
}

// Position 表示按时间序折叠交易后的持仓快照。
type Position struct {
	Quantity      float64 // 当前持有数量
	AvgCost       float64 // 加权平均单位成本（含费）
	CostBasis     float64 // Quantity * AvgCost
	RealizedPnl   float64 // 已实现盈亏（含卖出费用扣减）
	MarketValue   float64 // currentPrice==nil 时为 0
	UnrealizedPnl float64 // currentPrice==nil 时为 0
}

// ErrOversell 卖出数量超过当前持仓时返回。
var ErrOversell = errors.New("sell quantity exceeds holdings")

const epsilon = 1e-9

// ComputePosition 按时间序折叠交易（加权平均成本法，买入费计入成本，卖出费计入已实现盈亏）。
// currentPrice 为 nil 时 MarketValue/UnrealizedPnl 为 0。超卖返回 ErrOversell。
// 浮点比较容差 1e-9。
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
	return pos, nil
}
