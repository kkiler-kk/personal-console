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
export interface Habit { id: number; name: string; icon: string; color: string; archived: boolean; created_at: string }
export interface HeatmapDay { date: string; count: number }

export type AssetType = "stock" | "etf" | "metal" | "other"
export type PriceSource = "yahoo" | "computed_gold_cny" | "manual"
export interface Asset {
  id: number; symbol: string; name: string; type: AssetType; price_source: PriceSource
  currency: "USD" | "CNY"; current_price: number | null; price_updated_at: string | null
  created_at: string; updated_at: string
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
