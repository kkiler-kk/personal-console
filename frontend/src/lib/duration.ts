/**
 * 分钟数智能格式化（数据层/输入侧始终为分钟，仅在展示层换算）：
 * - <60 → "N 分钟"（含 0 → "0 分钟"）
 * - >=60 → "X.X 小时"（一位小数四舍五入，整小时去尾零，如 60 → "1 小时"、90 → "1.5 小时"）
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = (minutes / 60).toFixed(1)
  return `${hours.endsWith(".0") ? hours.slice(0, -2) : hours} 小时`
}
