package portfolio

import (
	"sort"
	"time"
)

// TradeRow 为价值曲线所需的一笔交易行（含资产归属与交易日期）。
type TradeRow struct {
	AssetID  int64
	Side     string
	Quantity float64
	Price    float64
	Fee      float64
	TradedAt time.Time
}

// CloseRow 为某资产某日的收盘价行。
type CloseRow struct {
	AssetID int64
	Date    time.Time // 日期部分
	Close   float64
}

// AssetMeta 为价值曲线所需的资产元信息。
type AssetMeta struct {
	ID           int64
	Symbol       string
	Currency     string
	CurrentPrice float64 // 0 = 无
}

// DayPoint 为价值曲线上的单日点（CNY 口径）。
type DayPoint struct {
	Date  string  `json:"date"` // "2006-01-02"
	Value float64 `json:"value"`
	Cost  float64 `json:"cost"`
	Pnl   float64 `json:"pnl"`
}

// dateKey 返回 t 在其自身时区下的日历日期部分（YYYY-MM-DD），
// 不受时分秒影响；跨时区（如 DATE 列 scan 出的 UTC 与 time.Local 的日期）
// 也能得到一致的字符串。字典序即时间序。
func dateKey(t time.Time) string { return t.Format("2006-01-02") }

// closeCursor 为单资产收盘价的前向游标：随 dates 升序推进，
// 携带"截至当日最近一个 close"（O(1) 均摊查找，无需逐日二分/扫描）。
type closeCursor struct {
	rows []CloseRow // 按日期部分升序
	i    int        // 下一个未消费的 close
	last float64    // 已消费的最近 close
	has  bool       // last 是否有效
}

// ValueCurve 对 dates（升序日期，取日期部分比较）逐日计算组合市值与成本
// （CNY 口径：USD 资产 ×fxUSDCNY，其余 ×1）。
//
// 每日每资产：用截至该日（TradedAt 日期部分 <= 该日）的交易 ComputePosition(nil)
// 得 quantity/costBasis（复用持仓折叠逻辑，不重写盈亏计算）；
// 单价优先级：当日 close → 最近一个更早 close → CurrentPrice → 仍为 0 则该资产当日跳过。
// ComputePosition 出错（超卖/未知 side）的资产当日跳过。
// Value 与 Cost 均为 0 的全零日不输出；输出按 dates 顺序（升序）。
//
// 约束：dates 必须升序（游标依赖）；closes 内部会按资产分组并按日期排序，
// 对入参顺序无要求；trades 的折叠顺序即入参相对顺序。
func ValueCurve(trades []TradeRow, closes []CloseRow, assets []AssetMeta, dates []time.Time, fxUSDCNY float64) []DayPoint {
	// 交易按资产分组（保持入参相对顺序）
	tradesByAsset := make(map[int64][]TradeRow, len(assets))
	for _, tr := range trades {
		tradesByAsset[tr.AssetID] = append(tradesByAsset[tr.AssetID], tr)
	}

	// closes 按资产分组并按日期部分升序，构建前向游标索引
	closesByAsset := make(map[int64][]CloseRow, len(assets))
	for _, cl := range closes {
		closesByAsset[cl.AssetID] = append(closesByAsset[cl.AssetID], cl)
	}
	cursors := make(map[int64]*closeCursor, len(assets))
	for id, cls := range closesByAsset {
		sort.Slice(cls, func(i, j int) bool { return dateKey(cls[i].Date) < dateKey(cls[j].Date) })
		cursors[id] = &closeCursor{rows: cls}
	}

	out := []DayPoint{}
	buf := make([]Trade, 0, len(trades)) // 复用折叠缓冲
	for _, day := range dates {
		dayKey := dateKey(day)
		var value, cost float64

		for _, a := range assets {
			// 截至当日的交易（日期部分比较，不受时分秒影响）
			buf = buf[:0]
			for _, tr := range tradesByAsset[a.ID] {
				if dateKey(tr.TradedAt) <= dayKey {
					buf = append(buf, Trade{Side: tr.Side, Quantity: tr.Quantity, Price: tr.Price, Fee: tr.Fee})
				}
			}
			pos, err := ComputePosition(buf, nil)
			if err != nil {
				continue // 异常交易序列：该资产当日跳过
			}

			// 单价：游标推进到当日 → 最近 close；无 close 回退 CurrentPrice；仍为 0 跳过
			var price float64
			if cur := cursors[a.ID]; cur != nil {
				for cur.i < len(cur.rows) && dateKey(cur.rows[cur.i].Date) <= dayKey {
					cur.last = cur.rows[cur.i].Close
					cur.has = true
					cur.i++
				}
				if cur.has {
					price = cur.last
				}
			}
			if price == 0 {
				price = a.CurrentPrice
			}
			if price == 0 {
				continue
			}

			fx := 1.0
			if a.Currency == "USD" {
				fx = fxUSDCNY
			}
			value += pos.Quantity * price * fx
			cost += pos.CostBasis * fx
		}

		if value == 0 && cost == 0 {
			continue // 全零日不输出，避免拉低曲线
		}
		out = append(out, DayPoint{Date: dayKey, Value: value, Cost: cost, Pnl: value - cost})
	}
	return out
}
