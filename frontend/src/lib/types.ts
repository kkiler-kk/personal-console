export interface AuthUser { id: number; username: string; nickname: string; avatar: string }
export interface Category { id: number; name: string; slug: string; section: Section; created_at: string }
export type Section = "invest" | "learn" | "fitness" | "life" | "blog"
export interface Tag { id: number; name: string; count?: number }
export interface Post {
  id: number; title: string; slug: string; summary: string; content: string
  author_id: number; category_id: number | null; status: "published" | "draft"
  view_count: number; created_at: string; updated_at: string
  author?: AuthUser & { bio?: string }; category?: Category; tags?: Tag[]
}
export interface Comment {
  id: number; post_id: number; parent_id: number | null; name: string; content: string
  like_count: number; can_delete: boolean; created_at: string; updated_at: string
  replies?: Comment[]
}
export interface GalleryItem { filename: string; url: string; size: number; mod_time: string }
export interface DashboardSummary {
  posts_total: number; comments_total: number; gallery_total: number
  portfolio_value: number | null; portfolio_pnl: number | null; portfolio_pnl_pct: number | null
  review_due: number; learn_streak: number; workouts_this_week: number
  habits_checked_today: number; habits_total: number
  study_minutes_today: number
}
export interface PostListResp { posts: Post[]; total: number; page: number; size: number }
export interface ArchiveItem { year: number; month: number; count: number }
// checked_today：GET /api/habits 行级当日打卡状态（task 4.5，服务端真值）
export interface Habit { id: number; name: string; icon: string; color: string; archived: boolean; created_at: string; checked_today: boolean }
export interface HeatmapDay { date: string; count: number }

export type AssetType = "stock" | "etf" | "metal" | "fund" | "other"
export type PriceSource = "yahoo" | "computed_gold_cny" | "manual" | "fund_cn"
export interface Asset {
  id: number; symbol: string; name: string; type: AssetType; price_source: PriceSource
  currency: "USD" | "CNY"; current_price: number | null; price_updated_at: string | null
  // 自定义展示顺序（Task 3 后端持久化，Task 4 前端拖拽消费）：List/positions 按其升序返回
  sort_order: number; created_at: string; updated_at: string
}
export interface Trade {
  id: number; asset_id: number; side: "buy" | "sell"; quantity: number; price: number
  fee: number; traded_at: string; note: string; created_at: string; asset?: Asset
}
export interface PositionRow {
  asset: Asset; quantity: number; avg_cost: number; cost_basis: number
  market_value: number | null; realized_pnl: number; unrealized_pnl: number | null
  price: number | null; previous_close: number | null; day_change_pct: number | null
  pe_ttm: number | null; stale: boolean; price_updated_at: string | null
  invalid?: boolean
}
export interface PositionsSummary {
  total_value_cny: number; total_cost_cny: number; total_pnl_cny: number
  total_pnl_pct: number; day_pnl_cny: number | null; fx_usdcny: number
}
export interface PositionsResp { positions: PositionRow[]; summary: PositionsSummary }
// 强制刷新结果（迭代六，POST /invest/refresh）：refreshed=非 stale 行情数 / 非 nil PE 数，total=送刷 symbol 数
export interface RefreshResult { refreshed_quotes: number; total_quotes: number; refreshed_pes: number; total_pes: number }
export interface CurvePoint { date: string; value: number; cost: number; pnl: number }
export interface PositionsHistoryResp { points: CurvePoint[]; currency: string }

export type Lang = "en" | "es"
export type ActivityType = "vocab" | "listening" | "speaking" | "reading" | "grammar" | "other"
export interface LanguageProfile {
  id: number; lang: Lang; level: string; goal: string; note: string; updated_at: string
}
export interface DayMinutes { date: string; minutes: number }
export interface LearnStats {
  streak: number
  today: { minutes: number; en: boolean; es: boolean; by_activity: { activity: ActivityType; minutes: number }[] }
  week: { minutes: number; days: number }
  total: { minutes: number; days: number; sessions: number }
  by_lang: { en: { minutes: number; days: number }; es: { minutes: number; days: number } }
  recent: DayMinutes[]
}
export interface CalendarDay { date: string; minutes: number; langs: Lang[] }

// GET /api/search（Task S2）：五类聚合，键名与后端 handler/search.go json tag 逐字一致；
// 后端保证五键恒在（空为 []），单类失败不整体 500
export interface SearchResult {
  posts: { id: number; title: string; slug: string; summary: string }[]
  assets: { id: number; symbol: string; name: string; type: AssetType }[]
  habits: { id: number; name: string; icon: string }[]
  categories: { id: number; name: string; slug: string }[]
  tags: { id: number; name: string }[]
}

// GET /api/learn/sessions（Task S1）：对齐后端 model.StudySession json tag，
// 前端命名按 types 惯例称 LearnSession。session_date/created_at 为 RFC3339 串，
// session_date 是本地午夜，取日期部分用前 10 字符（Task S3 消费）
export interface LearnSession {
  id: number; lang: Lang; activity: ActivityType; minutes: number
  session_date: string; note: string; created_at: string
}
export interface LearnSessionsResp { sessions: LearnSession[]; total: number }
