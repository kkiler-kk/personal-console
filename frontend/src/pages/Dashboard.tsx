import { useQuery } from "@tanstack/react-query"
import { TrendingUp, Languages, Sprout, PenLine, MessageSquare, Image } from "lucide-react"
import { api } from "@/lib/api"
import { StatCard } from "@/components/StatCard"
import { ValueChart } from "@/components/charts/ValueChart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/AuthContext"

// 涨绿跌红（仓库约定）：up #16a34a / down #dc2626
const pnlCls = (v: number) => v >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"
const signedInt = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v)).toLocaleString("zh-CN")}`

export default function Dashboard() {
  const { user } = useAuth()
  const { data, isPending } = useQuery({ queryKey: ["dashboard"], queryFn: api.getDashboardSummary })
  const positionsQ = useQuery({ queryKey: ["positions"], queryFn: api.getPositions })
  const historyQ = useQuery({ queryKey: ["positions-history", 30], queryFn: () => api.getPositionsHistory(30) })

  const summary = positionsQ.data?.summary
  const hasPositions = (positionsQ.data?.positions ?? []).length > 0
  const curve = historyQ.data?.points ?? []

  const portfolioValue = !summary || !hasPositions
    ? "—"
    : `¥${Math.round(summary.total_value_cny).toLocaleString("zh-CN")}`
  const portfolioSub = positionsQ.isPending
    ? undefined
    : !summary || !hasPositions
      ? "去添加资产"
      : (
        <span className={pnlCls(summary.total_pnl_cny)}>
          {signedInt(summary.total_pnl_cny)}（{summary.total_pnl_pct >= 0 ? "+" : "−"}{Math.abs(summary.total_pnl_pct).toFixed(2)}%）
        </span>
      )

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold">你好，{user?.nickname || user?.username} 👋</h1>
        <p className="text-sm text-muted-foreground">这是你的个人控制台总览</p>
      </div>

      {isPending || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="投资组合" value={portfolioValue} sub={portfolioSub} icon={TrendingUp} href="/invest" />
            <StatCard title="今日学习"
              value={data.study_minutes_today ? `${data.study_minutes_today} 分钟` : "—"}
              sub={data.learn_streak > 0 ? `连续 ${data.learn_streak} 天` : "今天还没学习"}
              icon={Languages} href="/learn" />
            <StatCard title="习惯打卡" value={data.habits_total ? `${data.habits_checked_today}/${data.habits_total}` : "—"} sub="阶段 5 上线" icon={Sprout} href="/life" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="已发布文章" value={data.posts_total} icon={PenLine} href="/blog" />
            <StatCard title="评论" value={data.comments_total} icon={MessageSquare} href="/blog" />
            <StatCard title="照片" value={data.gallery_total} icon={Image} href="/life" />
          </div>

          <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
            <CardHeader><CardTitle className="text-base">收益曲线（近 30 天 · CNY）</CardTitle></CardHeader>
            <CardContent>
              {curve.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  录入交易并积累每日快照后生成曲线
                </div>
              ) : (
                <ValueChart points={curve} height={160} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
