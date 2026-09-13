import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import { useEffect, useState } from "react"
import zh from "./locales/zh"
import en from "./locales/en"
import es from "./locales/es"

// UI 语言：localStorage("ui-lang") ∈ "zh"|"en"|"es"，默认英文，fallback 英文。
// 切换即时生效（i18n.changeLanguage）+ 持久化 + 跨标签 storage 同步。
export type UiLang = "zh" | "en" | "es"

const STORAGE_KEY = "ui-lang"
const DEFAULT_LANG: UiLang = "en"

function isUiLang(v: unknown): v is UiLang {
  return v === "zh" || v === "en" || v === "es"
}

/** 读取存储语言：非法值/缺失/localStorage 不可用一律回落默认英文（try/catch 惯例同 lib/mask.ts）。 */
function readStoredLang(): UiLang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isUiLang(v) ? v : DEFAULT_LANG
  } catch {
    return DEFAULT_LANG
  }
}

// 资源内联（无异步 backend），init 在模块加载即完成；main.tsx 在 createRoot 前 import 本文件。
void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
    es: { translation: es },
  },
  lng: readStoredLang(),
  fallbackLng: DEFAULT_LANG,
  interpolation: { escapeValue: false }, // React 已在渲染层转义，关闭 i18next 二次转义
})

/**
 * UI 语言开关。刻意不用 Context（惯例同 useInvestMask/useDisplayCurrency）：
 * 翻译消费方走 useTranslation()，由 react-i18next 订阅 languageChanged 全局驱动重渲染；
 * 本 hook 的 lang 仅供切换器标记当前项。与 mask 不同点：语言真值是 i18n.language，
 * 故跨标签 storage 事件走 changeLanguage（而非直接 setState），再由 languageChanged 回灌 lang，
 * 保证「另一标签切换 → 本标签实际改语言」而非仅改本地状态。自身 setLang 写的 localStorage
 * 不在本标签触发 storage 事件（浏览器规范），无重入；changeLanguage 前判等避免无谓振荡。
 */
export function useUiLanguage(): { lang: UiLang; setLang: (l: UiLang) => void } {
  const [lang, setLangState] = useState<UiLang>(readStoredLang)

  // 跟随 i18n 语言变化（任何来源的 changeLanguage 都触发），使 lang 恒等于当前渲染语言
  useEffect(() => {
    const onChanged = (l: string) => {
      if (isUiLang(l)) setLangState(l)
    }
    i18n.on("languageChanged", onChanged)
    return () => {
      i18n.off("languageChanged", onChanged)
    }
  }, [])

  // 跨标签同步：其他标签写 ui-lang → 本标签 changeLanguage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      const next = isUiLang(e.newValue) ? e.newValue : DEFAULT_LANG
      if (i18n.language !== next) void i18n.changeLanguage(next)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const setLang = (l: UiLang) => {
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      // 不可写时仅切换内存语言，不打扰页面
    }
    if (i18n.language !== l) void i18n.changeLanguage(l)
  }

  return { lang, setLang }
}

export default i18n
