import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { TrendingUp, Languages, Sprout, PenLine, MessageSquare, Image, Eye, EyeOff } from "lucide-react"
import { api } from "@/lib/api"
import { compactWindowStart } from "@/lib/dates"
import { formatDuration } from "@/lib/duration"
import { MASK, maskValue, useInvestMask } from "@/lib/mask"
import { CURRENCY_SYMBOL, convertFromCNY, useDisplayCurrency } from "@/lib/displayCurrency"
import { StatCard } from "@/components/StatCard"
import { ValueChart } from "@/components/charts/ValueChart"
import { HabitHeatmap } from "@/components/charts/HabitHeatmap"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/AuthContext"

// 涨绿跌红（仓库约定）：up #16a34a / down #dc2626
const pnlCls = (v: number) => v >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"
const signedInt = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v)).toLocaleString("zh-CN")}`

export default function Dashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  // 投资隐私遮蔽：与 InvestPage 页头开关同源（localStorage + storage 事件跨标签同步）
  const [masked, setMasked] = useInvestMask()
  // 汇总显示币种：与 InvestPage 同源（同一 localStorage 键 + storage 事件），Dashboard 只跟随、不设切换入口
  const { currency } = useDisplayCurrency()
  const { data, isPending } = useQuery({ queryKey: ["dashboard"], queryFn: api.getDashboardSummary })
  const positionsQ = useQuery({ queryKey: ["positions"], queryFn: api.getPositions })
  const historyQ = useQuery({ queryKey: ["positions-history", 30], queryFn: () => api.getPositionsHistory(30) })

  // 迷你热力图：compact 近 16 周窗口在 1 月会含上一年日期，而 heatmap API 按单年查询
  // → 窗口起点早于今年 1 月 1 日时并行查两年合并，否则只查当年（查询键与 HabitSection 一致）
  const year = new Date().getFullYear()
  const crossesYear = compactWindowStart().getFullYear() < year
  const heatmapQ = useQuery({ queryKey: ["habit-heatmap", year], queryFn: () => api.getHabitHeatmap(year) })
  const prevHeatmapQ = useQuery({
    queryKey: ["habit-heatmap", year - 1],
    queryFn: () => api.getHabitHeatmap(year - 1),
    enabled: crossesYear,
  })
  // days 的 date 字符串按年天然唯一，concat 无重复键；组件经 Map 消费，无顺序依赖
  const heatmapDays = useMemo(
    () => crossesYear
      ? [...(prevHeatmapQ.data?.days ?? []), ...(heatmapQ.data?.days ?? [])]
      : (heatmapQ.data?.days ?? []),
    [crossesYear, prevHeatmapQ.data, heatmapQ.data],
  )
  // 跨年时两个查询都就绪才算加载完；enabled=false 的查询 isPending 恒真，需按 crossesYear 门控
  const heatmapLoading = heatmapQ.isPending || (crossesYear && prevHeatmapQ.isPending)
  const heatmapError = heatmapQ.isError || (crossesYear && prevHeatmapQ.isError)

  const summary = positionsQ.data?.summary
  const hasPositions = (positionsQ.data?.positions ?? []).length > 0
  const curve = historyQ.data?.points ?? []

  // 组合卡跟随投资页币种：汇率不可用时回落 CNY（与 InvestPage 同一防御，见 displayCurrency.convertFromCNY）。
  // 遮蔽优先于币种：portfolioValue/Sub 先判 masked 才走换算；pct 无币种不换算。
  const fx = summary?.fx_usdcny ?? 1
  const displayCurrency = currency === "USD" && Number.isFinite(fx) && fx > 0 ? "USD" : "CNY"
  const portfolioValue = !summary || !hasPositions
    ? "—"
    : maskValue(
        `${CURRENCY_SYMBOL[displayCurrency]}${Math.round(convertFromCNY(summary.total_value_cny, displayCurrency, fx)).toLocaleString("zh-CN")}`,
        masked,
      )
  const portfolioSub = positionsQ.isPending
    ? undefined
    : !summary || !hasPositions
      ? t("dashboard.addAsset")
      : masked
        ? MASK
        : (
          <span className={pnlCls(summary.total_pnl_cny)}>
            {t("dashboard.pnlWithPct", {
              amount: signedInt(convertFromCNY(summary.total_pnl_cny, displayCurrency, fx)),
              pct: `${summary.total_pnl_pct >= 0 ? "+" : "−"}${Math.abs(summary.total_pnl_pct).toFixed(2)}%`,
            })}
          </span>
        )

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold">{t("dashboard.greeting", { name: user?.nickname || user?.username || "" })} <span aria-hidden="true">👋</span></h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>

      {isPending || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title={t("dashboard.portfolio")} value={portfolioValue} sub={portfolioSub} icon={TrendingUp} href="/invest"
              action={
                <Button variant="ghost" size="icon-sm"
                  aria-label={masked ? t("dashboard.showNumbers") : t("dashboard.hideNumbers")}
                  title={masked ? t("dashboard.showNumbers") : t("dashboard.hideNumbers")}
                  onClick={() => setMasked(!masked)}>
                  {masked ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              } />
            <StatCard title={t("dashboard.todayStudy")}
              value={data.study_minutes_today ? formatDuration(data.study_minutes_today, t) : "—"}
              sub={data.learn_streak > 0 ? t("dashboard.streakDays", { n: data.learn_streak }) : t("dashboard.noStudyToday")}
              icon={Languages} href="/learn" />
            <StatCard title={t("dashboard.habitCheckin")}
              value={data.habits_total ? `${data.habits_checked_today}/${data.habits_total}` : "—"}
              sub={data.habits_total === 0 ? t("dashboard.createHabit") : data.habits_checked_today === 0 ? t("dashboard.noCheckinToday") : t("dashboard.checkedInToday")}
              icon={Sprout} href="/life" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title={t("dashboard.publishedPosts")} value={data.posts_total} icon={PenLine} href="/blog" />
            <StatCard title={t("dashboard.comments")} value={data.comments_total} icon={MessageSquare} href="/blog" />
            <StatCard title={t("dashboard.photos")} value={data.gallery_total} icon={Image} href="/life" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 热力卡 isError 不渲染时收益曲线补满整行（task 4.5 可选项），避免右侧留白 */}
            <Card className={`shadow-[0_1px_3px_rgba(0,0,0,.06)] ${heatmapError ? "sm:col-span-3" : "sm:col-span-2"}`}>
              <CardHeader><CardTitle className="text-base">{t("dashboard.valueCurve")}</CardTitle></CardHeader>
              <CardContent>
                {masked ? (
                  // 遮蔽时整卡占位：Y 轴刻度会泄露绝对金额，不渲染 ValueChart
                  <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                    {t("dashboard.numbersHidden")}
                  </div>
                ) : curve.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                    {t("dashboard.curveEmpty")}
                  </div>
                ) : (
                  <ValueChart points={curve} height={160} />
                )}
              </CardContent>
            </Card>

            {/* 迷你热力卡：isError 整卡不渲染（收益曲线仍占 2/3，布局不塌） */}
            {!heatmapError && (
              <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
                <CardHeader><CardTitle className="text-base">{t("dashboard.habitHeat")}</CardTitle></CardHeader>
                <CardContent>
                  {heatmapLoading ? (
                    <Skeleton className="h-[68px] w-[158px] rounded-lg" />
                  ) : heatmapDays.length === 0 ? (
                    <div className="h-[68px] flex items-center justify-center text-sm text-muted-foreground text-center">
                      <Link to="/life" className="hover:underline">{t("dashboard.heatEmpty")}</Link>
                    </div>
                  ) : (
                    <HabitHeatmap compact days={heatmapDays} year={year} />
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  )
}
