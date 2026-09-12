import { useQuery } from "@tanstack/react-query"
import { TrendingUp, Languages, Dumbbell, Sprout, PenLine, MessageSquare, Image } from "lucide-react"
import { api } from "@/lib/api"
import { StatCard } from "@/components/StatCard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/AuthContext"

export default function Dashboard() {
  const { user } = useAuth()
  const { data, isPending } = useQuery({ queryKey: ["dashboard"], queryFn: api.getDashboardSummary })

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold">你好，{user?.nickname || user?.username} 👋</h1>
        <p className="text-sm text-muted-foreground">这是你的个人控制台总览</p>
      </div>

      {isPending || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="投资组合" value={data.portfolio_value == null ? "—" : `$${data.portfolio_value.toLocaleString()}`}
              sub={data.portfolio_pnl == null ? "阶段 2 上线" : undefined} icon={TrendingUp} href="/invest" />
            <StatCard title="今日复习" value={data.review_due || "—"} sub="阶段 3 上线" icon={Languages} href="/learn" />
            <StatCard title="本周训练" value={data.workouts_this_week || "—"} sub="阶段 4 上线" icon={Dumbbell} href="/fitness" />
            <StatCard title="习惯打卡" value={data.habits_total ? `${data.habits_checked_today}/${data.habits_total}` : "—"} sub="阶段 5 上线" icon={Sprout} href="/life" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="已发布文章" value={data.posts_total} icon={PenLine} href="/blog" />
            <StatCard title="评论" value={data.comments_total} icon={MessageSquare} href="/blog" />
            <StatCard title="照片" value={data.gallery_total} icon={Image} href="/life" />
          </div>

          <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
            <CardHeader><CardTitle className="text-base">收益曲线</CardTitle></CardHeader>
            <CardContent>
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                阶段 2（投资模块）上线后展示
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
