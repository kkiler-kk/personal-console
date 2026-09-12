import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2, Circle, Languages } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { Lang } from "@/lib/types"
import { MinutesBar } from "@/components/charts/MinutesBar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { SessionDialog } from "./SessionDialog"
import { ProfileDialog } from "./ProfileDialog"
import { StudyCalendar } from "./StudyCalendar"
import { ACTIVITY_LABELS, LANGS, LANG_META } from "./constants"

export default function LearnPage() {
  const qc = useQueryClient()
  const profilesQ = useQuery({ queryKey: ["learn-profiles"], queryFn: api.getLearnProfiles })
  const statsQ = useQuery({ queryKey: ["learn-stats"], queryFn: api.getLearnStats })

  // 后端空态恒为 []，?? [] 兜底照惯例保留
  const profiles = profilesQ.data?.profiles ?? []
  const stats = statsQ.data

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["learn-profiles"] })
    qc.invalidateQueries({ queryKey: ["learn-stats"] })
    qc.invalidateQueries({ queryKey: ["learn-calendar"] })
    qc.invalidateQueries({ queryKey: ["dashboard"] })
  }

  // 快速打卡：0 分钟 other 记录，仅标记「今天学过」
  const checkin = useMutation({
    mutationFn: (lang: Lang) => api.createLearnSession({ lang, activity: "other", minutes: 0 }),
    onSuccess: () => { toast.success("已打卡"); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "打卡失败"),
  })

  const todayDone: Record<Lang, boolean> = { en: !!stats?.today.en, es: !!stats?.today.es }
  const profileFor = (lang: Lang) => profiles.find((p) => p.lang === lang)

  return (
    <div className="max-w-6xl space-y-5">
      {/* 主按钮放页头行：不依赖 stats，错误态下仍可记录学习 */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2"><Languages className="size-5" /> 学习</h1>
        <SessionDialog onSaved={invalidateAll} />
      </div>

      {statsQ.isError && (
        <p className="text-sm text-destructive">加载学习统计失败：{statsQ.error instanceof Error ? statsQ.error.message : "未知错误"}</p>
      )}

      {/* streak 横幅（三分支：isError 时不渲染，骨架不卡死） */}
      {statsQ.isPending ? (
        <Skeleton className="h-[104px] rounded-xl" />
      ) : stats ? (
        <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
          <CardContent className="p-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <div>
              <p className="text-sm text-muted-foreground">连续学习</p>
              <p className="text-4xl font-semibold tnum mt-0.5">
                {stats.streak}<span className="text-base font-normal text-muted-foreground ml-1">天</span>
              </p>
            </div>
            <Separator orientation="vertical" className="hidden sm:block h-12" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="tnum">本周 <span className="font-medium text-foreground">{stats.week.minutes}</span> 分钟 · {stats.week.days} 天</p>
              <p className="tnum">累计 <span className="font-medium text-foreground">{Math.floor(stats.total.minutes / 60)}</span> 小时 · {stats.total.days} 天</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* 今日卡（三分支：错误态整体不渲染，页头已有错误提示） */}
      {statsQ.isPending ? (
        <Skeleton className="h-36 rounded-xl" />
      ) : stats ? (
        <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
          <CardHeader><CardTitle className="text-base">今日学习</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <p className="text-3xl font-semibold tnum">
                {stats.today.minutes}<span className="text-sm font-normal text-muted-foreground ml-1">分钟</span>
              </p>
              <div className="flex items-center gap-3 text-sm">
                {LANGS.map((lang) => (
                  <span key={lang} className="flex items-center gap-1" title={todayDone[lang] ? "今日已学" : "今日未学"}>
                    {todayDone[lang]
                      ? <CheckCircle2 className="size-4 text-primary" />
                      : <Circle className="size-4 text-muted-foreground/40" />}
                    {LANG_META[lang].flag} {LANG_META[lang].name}
                  </span>
                ))}
              </div>
            </div>
            {stats.today.by_activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">今天还没有学习记录，点上方「记录学习」开始</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {stats.today.by_activity.map((a) => (
                  <Badge key={a.activity} variant="secondary" className="tnum font-normal">
                    {ACTIVITY_LABELS[a.activity] ?? a.activity} · {a.minutes} 分钟
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">逐条明细与删除入口将在后续迭代提供</p>
          </CardContent>
        </Card>
      ) : null}

      {/* 语言阶段卡 */}
      <div className="grid gap-4 sm:grid-cols-2">
        {LANGS.map((lang) => {
          const p = profileFor(lang)
          const byLang = stats?.by_lang[lang]
          return (
            <Card key={lang} className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-2xl leading-none">{LANG_META[lang].flag}</span>
                    <div className="min-w-0">
                      <p className="font-medium">{LANG_META[lang].name}</p>
                      {p?.level
                        ? <Badge variant="secondary" className="mt-0.5 font-normal">{p.level}</Badge>
                        : <span className="text-xs text-muted-foreground">未设置</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ProfileDialog lang={lang} initial={p ?? null} onSaved={invalidateAll} />
                    <Button size="sm" variant={todayDone[lang] ? "outline" : "default"}
                      disabled={todayDone[lang] || checkin.isPending}
                      onClick={() => checkin.mutate(lang)}>
                      {todayDone[lang] ? "已打卡 ✓" : "快速打卡"}
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 min-h-10">
                  {p?.goal || p?.note
                    ? [p?.goal, p?.note].filter(Boolean).join(" · ")
                    : "还没有目标与备注，点「编辑」设置"}
                </p>
                <p className="text-xs text-muted-foreground tnum">
                  累计 {byLang?.minutes ?? 0} 分钟 · {byLang?.days ?? 0} 天
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 近 28 天柱状图（三分支：错误态整体不渲染） */}
      {statsQ.isPending ? (
        <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
          <CardHeader><CardTitle className="text-base">近 28 天学习时长</CardTitle></CardHeader>
          <CardContent><Skeleton className="h-[180px] rounded-lg" /></CardContent>
        </Card>
      ) : stats ? (
        <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
          <CardHeader><CardTitle className="text-base">近 28 天学习时长</CardTitle></CardHeader>
          <CardContent><MinutesBar data={stats.recent} /></CardContent>
        </Card>
      ) : null}

      {/* 年度日历 */}
      <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
        <CardHeader><CardTitle className="text-base">学习日历</CardTitle></CardHeader>
        <CardContent>
          <StudyCalendar />
        </CardContent>
      </Card>
    </div>
  )
}
