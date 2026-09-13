import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { FileText, MessageSquare, Image, TrendingUp, Receipt, Languages, Sprout } from "lucide-react"
import { api } from "@/lib/api"
import { StatCard } from "@/components/StatCard"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminNav } from "@/components/admin/AdminNav"

// 总览统计卡：六路只读查询聚合。复用既有 queryKey（dashboard/assets/trades）以共享缓存与失效闭环；
// 学习记录取 limit=1 只要 total，习惯取 all=1 含归档计数。任一失败降级为「—」，不整页塌。
export default function AdminOverview() {
  const { t } = useTranslation()
  // 键归入 ["posts"] 前缀失效域：发文/编辑（PostEditor）与删文（AdminPosts）后总览计数自动刷新
  const postsQ = useQuery({ queryKey: ["posts", "overview-count"], queryFn: () => api.getPosts({ size: 1 }) })
  const dashQ = useQuery({ queryKey: ["dashboard"], queryFn: api.getDashboardSummary })
  const assetsQ = useQuery({ queryKey: ["assets"], queryFn: api.getAssets })
  const tradesQ = useQuery({ queryKey: ["trades"], queryFn: () => api.getTrades() })
  const sessionsQ = useQuery({ queryKey: ["learn-sessions", 1], queryFn: () => api.getLearnSessions(1) })
  const habitsQ = useQuery({ queryKey: ["habits", "all"], queryFn: () => api.getHabits({ all: true }) })

  const qs = [postsQ, dashQ, assetsQ, tradesQ, sessionsQ, habitsQ]
  const initialLoading = qs.every((q) => q.isPending)

  const dash = dashQ.data
  const num = (v: number | undefined) => (v === undefined ? "—" : v)

  return (
    <div className="max-w-6xl space-y-4">
      <AdminNav />
      <div>
        <h1 className="text-xl font-semibold">{t("admin.overview.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.overview.subtitle")}</p>
      </div>

      {initialLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title={t("admin.overview.posts")} value={num(postsQ.data?.total)} sub={t("admin.overview.postsSub")} icon={FileText} href="/admin/posts" />
          <StatCard title={t("admin.overview.comments")} value={num(dash?.comments_total)} icon={MessageSquare} href="/blog" />
          <StatCard title={t("admin.overview.photos")} value={num(dash?.gallery_total)} icon={Image} href="/life" />
          <StatCard title={t("admin.overview.assets")} value={num(assetsQ.data?.assets.length)} icon={TrendingUp} href="/invest" />
          <StatCard title={t("admin.overview.trades")} value={num(tradesQ.data?.trades.length)} sub={t("admin.overview.tradesSub")} icon={Receipt} href="/invest" />
          <StatCard title={t("admin.overview.sessions")} value={num(sessionsQ.data?.total)} sub={t("admin.overview.sessionsSub")} icon={Languages} href="/admin/sessions" />
          <StatCard title={t("admin.overview.habits")} value={num(habitsQ.data?.habits.length)} sub={t("admin.overview.habitsSub")} icon={Sprout} href="/admin/habits" />
        </div>
      )}
    </div>
  )
}
