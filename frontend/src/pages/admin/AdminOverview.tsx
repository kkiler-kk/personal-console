import { useQuery } from "@tanstack/react-query"
import { FileText, MessageSquare, Image, TrendingUp, Receipt, Languages, Sprout } from "lucide-react"
import { api } from "@/lib/api"
import { StatCard } from "@/components/StatCard"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminNav } from "@/components/admin/AdminNav"

// 总览统计卡：六路只读查询聚合。复用既有 queryKey（dashboard/assets/trades）以共享缓存与失效闭环；
// 学习记录取 limit=1 只要 total，习惯取 all=1 含归档计数。任一失败降级为「—」，不整页塌。
export default function AdminOverview() {
  const postsQ = useQuery({ queryKey: ["admin-overview-posts"], queryFn: () => api.getPosts({ size: 1 }) })
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
        <h1 className="text-xl font-semibold">管理总览</h1>
        <p className="text-sm text-muted-foreground">站点内容与个人数据的集中入口</p>
      </div>

      {initialLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title="文章" value={num(postsQ.data?.total)} sub="已发布 + 草稿" icon={FileText} href="/admin/posts" />
          <StatCard title="评论" value={num(dash?.comments_total)} icon={MessageSquare} href="/blog" />
          <StatCard title="照片" value={num(dash?.gallery_total)} icon={Image} href="/life" />
          <StatCard title="资产" value={num(assetsQ.data?.assets.length)} icon={TrendingUp} href="/invest" />
          <StatCard title="交易" value={num(tradesQ.data?.trades.length)} sub="累计成交笔数" icon={Receipt} href="/invest" />
          <StatCard title="学习记录" value={num(sessionsQ.data?.total)} sub="累计学习条数" icon={Languages} href="/admin/sessions" />
          <StatCard title="习惯" value={num(habitsQ.data?.habits.length)} sub="含已归档" icon={Sprout} href="/admin/habits" />
        </div>
      )}
    </div>
  )
}
