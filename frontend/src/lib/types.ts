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
}
export interface PostListResp { posts: Post[]; total: number; page: number; size: number }
export interface ArchiveItem { year: number; month: number; count: number }
