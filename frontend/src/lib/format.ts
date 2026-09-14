import { format } from "date-fns"
export const formatDate = (iso: string) => format(new Date(iso), "yyyy-MM-dd")
export const formatDateTime = (iso: string) => format(new Date(iso), "yyyy-MM-dd HH:mm")
export const formatMoney = (n: number, currency = "USD") =>
  new Intl.NumberFormat(currency === "USD" ? "en-US" : "zh-CN", { style: "currency", currency, maximumFractionDigits: 2 }).format(n)
// 文件大小人性化（照片墙信息条/灯箱标题栏）：B 无小数，KB/MB/GB 一位小数；单位符号三语通用，无需 i18n 键
export const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let v = bytes
  let u = -1
  do { v /= 1024; u++ } while (v >= 1024 && u < units.length - 1)
  return `${v.toFixed(1)} ${units[u]}`
}
