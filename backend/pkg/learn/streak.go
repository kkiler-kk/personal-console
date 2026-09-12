package learn

import "time"

func dayKey(t time.Time) string { return t.Format("2006-01-02") }

// ComputeStreak 计算连续学习天数。dates 为有学习记录的日期集合（可含重复/多语言/带时分秒，
// 内部按日期部分去重），today 为当前本地日期。语义：今天有记录 → 从今天往回数连续天数；
// 今天没有但昨天有 → 从昨天往回数（宽限：streak 不因今天还没学而清零）；今昨都无 → 0。
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
