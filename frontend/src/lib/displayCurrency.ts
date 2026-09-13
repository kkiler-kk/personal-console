import { useEffect, useState } from "react"

// 投资汇总层显示币种：¥/$ 一键切换，localStorage 持久化（"CNY"/"USD"），跨标签页经 storage 事件同步。
// 只影响汇总层四卡（InvestPage 总资产/总盈亏/今日盈亏 + Dashboard 投资组合卡）；
// 持仓表/流水行级保持资产原币不动。换算口径 = CNY 值 ÷ summary.fx_usdcny（与后端汇总同一汇率，单一汇率模型）。
const STORAGE_KEY = "invest-total-currency"

export type DisplayCurrency = "CNY" | "USD"

/**
 * 币种符号（切换按钮/Dashboard 迷你前缀消费）。
 * CNY 与 formatMoney 的 zh-CN Intl 前缀一致（¥）；USD 金额经 formatMoney(en-US) 渲染为 $ 前缀，与此处手拼 "$" 一致，数值口径同源。
 */
export const CURRENCY_SYMBOL: Record<DisplayCurrency, string> = { CNY: "¥", USD: "$" }

function readStored(): DisplayCurrency {
  try {
    return localStorage.getItem(STORAGE_KEY) === "USD" ? "USD" : "CNY"
  } catch {
    return "CNY" // 隐私模式等 localStorage 不可用：回退默认人民币
  }
}

/**
 * 汇总显示币种开关。刻意不用 Context（同 useInvestMask）：InvestPage 与 Dashboard 各自调用，
 * 同页单实例无一致性问题，跨标签页由 storage 事件兜底（写入同值不会引起状态振荡）。
 */
export function useDisplayCurrency(): { currency: DisplayCurrency; toggle: () => void } {
  const [currency, setCurrency] = useState<DisplayCurrency>(readStored)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, currency)
    } catch {
      // 不可写时仅保留内存态，不打扰页面
    }
  }, [currency])
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setCurrency(e.newValue === "USD" ? "USD" : "CNY")
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])
  return { currency, toggle: () => setCurrency((c) => (c === "CNY" ? "USD" : "CNY")) }
}

/** CNY → 显示币种换算：USD 且 fx 有效（有限正数）→ v/fx；否则原样返回（视为不可换算，调用处应同时禁用切换）。 */
export function convertFromCNY(v: number, currency: DisplayCurrency, fx: number): number {
  if (currency === "USD" && Number.isFinite(fx) && fx > 0) return v / fx
  return v
}
