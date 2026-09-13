import type { TFunction } from "i18next"

/**
 * 分钟数智能格式化（数据层/输入侧始终为分钟，仅在展示层换算；单位词走 i18n 复数键）：
 * - <60 → "N 分钟" / "N minutes" / "N minutos"（含 0 → "0 分钟"）
 * - >=60 → "X.X 小时"（一位小数四舍五入，整小时去尾零，如 60 → "1 小时/1 hour"、90 → "1.5 小时/1.5 hours"）
 *
 * i18n 方案（Task 3 选定，影响面最小）：签名改为 formatDuration(minutes, t)，
 * 单位词内部取 common.minutes / common.hours（count 复数），调用方从 useTranslation() 注入 t。
 * 输出恒为「<数值><单个空格><单位>」两段式——LearnPage 今日卡按空格拆分大小字，三语同构不破。
 */
export function formatDuration(minutes: number, t: TFunction): string {
  if (minutes < 60) return `${minutes} ${t("common.minutes", { count: minutes })}`
  const hours = (minutes / 60).toFixed(1)
  const value = hours.endsWith(".0") ? hours.slice(0, -2) : hours
  return `${value} ${t("common.hours", { count: Number(value) })}`
}
