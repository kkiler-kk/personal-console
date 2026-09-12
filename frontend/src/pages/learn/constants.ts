import type { ActivityType, Lang } from "@/lib/types"

// 六类活动中文标签（learn 页面与对话框共用）
export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  vocab: "背单词", listening: "听力", speaking: "口语",
  reading: "阅读", grammar: "语法", other: "其他",
}

// 契约语言白名单：仅 en/es
export const LANGS: Lang[] = ["en", "es"]

export const LANG_META: Record<Lang, { name: string; flag: string }> = {
  en: { name: "英语", flag: "🇬🇧" },
  es: { name: "西班牙语", flag: "🇪🇸" },
}
