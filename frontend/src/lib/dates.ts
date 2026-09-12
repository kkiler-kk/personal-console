// compact 热力图窗口起点：本周一（周一起始）− 15 周（近 16 周窗口）。
// Dashboard（跨年判定）与 HabitHeatmap.buildCompactWeeks（铺格）共享，公式单一来源（task 4.5）。
export function compactWindowStart(now = new Date()): Date {
  const base = new Date(now)
  base.setHours(0, 0, 0, 0)
  const start = new Date(base)
  // getDay() 0=周日 → 偏移 6 得周一起始
  start.setDate(base.getDate() - (base.getDay() + 6) % 7 - 15 * 7)
  return start
}
