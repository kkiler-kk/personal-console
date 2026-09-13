import type { ActivityType, Lang } from "@/lib/types"

// 六类活动 i18n 键（LearnPage 芯片 / SessionDialog 类型选择 / AdminSessions 表格共用；三语值见 learn.activity.*）
export const ACTIVITY_KEY: Record<ActivityType, string> = {
  vocab: "learn.activity.vocab", listening: "learn.activity.listening", speaking: "learn.activity.speaking",
  reading: "learn.activity.reading", grammar: "learn.activity.grammar", other: "learn.activity.other",
}

// 契约语言白名单：仅 en/es
export const LANGS: Lang[] = ["en", "es"]

// flag emoji 与语言无关保留代码内；语言名走 i18n（zh 值「英语/西班牙语」为冒烟 step 9 text=英语 选择器依赖，逐字不可改）
export const LANG_FLAG: Record<Lang, string> = { en: "🇬🇧", es: "🇪🇸" }

// 语言名 i18n 键（三语值见 learn.lang.*.name：英语/English/Inglés、西班牙语/Spanish/Español）
export const LANG_NAME_KEY: Record<Lang, string> = {
  en: "learn.lang.en.name", es: "learn.lang.es.name",
}
