package learn

import (
	"testing"
	"time"
)

func d(s string) time.Time {
	t, err := time.ParseInLocation("2006-01-02", s, time.Local)
	if err != nil {
		panic(err)
	}
	return t
}

func TestStreakIncludingToday(t *testing.T) {
	got := ComputeStreak([]time.Time{d("2026-09-11"), d("2026-09-12"), d("2026-09-13")}, d("2026-09-13"))
	if got != 3 {
		t.Fatalf("got %d", got)
	}
}

func TestStreakGraceYesterday(t *testing.T) {
	got := ComputeStreak([]time.Time{d("2026-09-11"), d("2026-09-12")}, d("2026-09-13"))
	if got != 2 {
		t.Fatalf("got %d", got)
	}
}

func TestStreakBroken(t *testing.T) {
	got := ComputeStreak([]time.Time{d("2026-09-09"), d("2026-09-11")}, d("2026-09-13"))
	if got != 0 {
		t.Fatalf("got %d", got)
	}
}

func TestStreakEmpty(t *testing.T) {
	if got := ComputeStreak(nil, d("2026-09-13")); got != 0 {
		t.Fatalf("got %d", got)
	}
}

func TestStreakDedupAndTimePart(t *testing.T) {
	// 同日多语言/多条记录算一天；带时分秒取日期部分
	got := ComputeStreak([]time.Time{
		d("2026-09-12"), d("2026-09-12"),
		d("2026-09-13").Add(8 * time.Hour),
	}, d("2026-09-13"))
	if got != 2 {
		t.Fatalf("got %d", got)
	}
}

func TestStreakLongRun(t *testing.T) {
	var dates []time.Time
	for i := 0; i < 30; i++ {
		dates = append(dates, d("2026-09-13").AddDate(0, 0, -i))
	}
	if got := ComputeStreak(dates, d("2026-09-13")); got != 30 {
		t.Fatalf("got %d", got)
	}
}
