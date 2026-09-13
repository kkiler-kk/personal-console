import { useEffect, useState } from "react"

// 投资数字隐私遮蔽：单个全局开关，localStorage 持久化（"1"/"0"），跨标签页经 storage 事件同步。
// 纯展示层——现价/日涨跌/PE 等公开行情不遮蔽，遮蔽点清单见各页面调用处。
const STORAGE_KEY = "invest-mask"

/** 遮蔽时显示的占位文本（消费处保持 tnum 容器以对齐） */
export const MASK = "••••"

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false // 隐私模式等 localStorage 不可用：回退默认关闭
  }
}

/**
 * 投资遮蔽开关。刻意不用 Context：InvestPage 与 Dashboard 各自调用本 hook，
 * 同页单实例无一致性问题，跨标签页由 storage 事件兜底（写入同值不会引起状态振荡）。
 */
export function useInvestMask(): [masked: boolean, setMasked: (v: boolean) => void] {
  const [masked, setMasked] = useState<boolean>(readStored)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, masked ? "1" : "0")
    } catch {
      // 不可写时仅保留内存态，不打扰页面
    }
  }, [masked])
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setMasked(e.newValue === "1")
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])
  return [masked, setMasked]
}

/** 遮蔽工具：masked 为 true 恒返回 MASK；否则原样返回已格式化值（null/undefined 回退空串）。
 *  调用处保持原有 "—" 语义：先判空给 "—"，非空才包本函数。 */
export function maskValue(fmt: string | number | null | undefined, masked: boolean): string {
  if (masked) return MASK
  return fmt == null ? "" : String(fmt)
}
