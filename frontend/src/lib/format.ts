import { format } from "date-fns"
export const formatDate = (iso: string) => format(new Date(iso), "yyyy-MM-dd")
export const formatDateTime = (iso: string) => format(new Date(iso), "yyyy-MM-dd HH:mm")
export const formatMoney = (n: number, currency = "USD") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 2 }).format(n)
