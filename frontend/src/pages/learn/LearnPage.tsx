import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { CheckCircle2, Circle, Languages } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { formatDuration } from "@/lib/duration"
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
import { ACTIVITY_KEY, LANGS, LANG_FLAG, LANG_NAME_KEY } from "./constants"

export default function LearnPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const profilesQ = useQuery({ queryKey: ["learn-profiles"], queryFn: api.getLearnProfiles })
  const statsQ = useQuery({ queryKey: ["learn-stats"], queryFn: api.getLearnStats })

  // 后端空态恒为 []，?? [] 兜底照惯例保留
  const profiles = profilesQ.data?.profiles ?? []
  const stats = statsQ.data

  // 含 ["learn-sessions"]：录学习后管理后台学习记录（AdminSessions）与总览（AdminOverview）即时刷新，闭环 30s staleTime 陈旧窗口
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["learn-profiles"] })
    qc.invalidateQueries({ queryKey: ["learn-stats"] })
    qc.invalidateQueries({ queryKey: ["learn-calendar"] })
    qc.invalidateQueries({ queryKey: ["learn-sessions"] })
    qc.invalidateQueries({ queryKey: ["dashboard"] })
  }

  // 快速打卡：0 分钟 other 记录，仅标记「今天学过」
  const checkin = useMutation({
    mutationFn: (lang: Lang) => api.createLearnSession({ lang, activity: "other", minutes: 0 }),
    onSuccess: () => { toast.success(t("learn.checkedIn")); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("learn.checkinFailed")),
  })

  const todayDone: Record<Lang, boolean> = { en: !!stats?.today.en, es: !!stats?.today.es }
  const profileFor = (lang: Lang) => profiles.find((p) => p.lang === lang)
  // 今日大数字：formatDuration 输出「<数值> <单位>」按空格拆开，保留单位小字的视觉层级（三语同构：单位词恒为第二段）
  const [todayNum, todayUnit] = (stats ? formatDuration(stats.today.minutes, t) : "").split(" ")

  return (
    <div className="max-w-6xl space-y-5">
      {/* 主按钮放页头行：不依赖 stats，错误态下仍可记录学习 */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2"><Languages className="size-5" /> {t("nav.learn")}</h1>
        <SessionDialog onSaved={invalidateAll} />
      </div>

      {statsQ.isError && (
        <p className="text-sm text-destructive">{t("learn.statsFailed", { msg: statsQ.error instanceof Error ? statsQ.error.message : t("errors.unknown") })}</p>
      )}
      {/* profilesQ 失败也要出声（task 4.5）：语言卡会静默渲染成「未设置」，易误判为无档案 */}
      {profilesQ.isError && (
        <p className="text-sm text-destructive">{t("learn.profilesFailed", { msg: profilesQ.error instanceof Error ? profilesQ.error.message : t("errors.unknown") })}</p>
      )}

      {/* streak 横幅（三分支：isError 时不渲染，骨架不卡死） */}
      {statsQ.isPending ? (
        <Skeleton className="h-[104px] rounded-xl" />
      ) : stats ? (
        <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
          <CardContent className="p-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <div>
              <p className="text-sm text-muted-foreground">{t("learn.streak")}</p>
              <p className="text-4xl font-semibold tnum mt-0.5">
                {stats.streak}<span className="text-base font-normal text-muted-foreground ml-1">{t("common.days", { count: stats.streak })}</span>
              </p>
            </div>
            <Separator orientation="vertical" className="hidden sm:block h-12" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="tnum">{t("learn.weekLabel")} <span className="font-medium text-foreground">{formatDuration(stats.week.minutes, t)}</span> · {stats.week.days} {t("common.days", { count: stats.week.days })}</p>
              <p className="tnum">{t("learn.totalLabel")} <span className="font-medium text-foreground">{formatDuration(stats.total.minutes, t)}</span> · {stats.total.days} {t("common.days", { count: stats.total.days })}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* 今日卡（三分支：错误态整体不渲染，页头已有错误提示） */}
      {statsQ.isPending ? (
        <Skeleton className="h-36 rounded-xl" />
      ) : stats ? (
        <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
          <CardHeader><CardTitle className="text-base">{t("learn.todayTitle")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <p className="text-3xl font-semibold tnum">
                {todayNum}<span className="text-sm font-normal text-muted-foreground ml-1">{todayUnit}</span>
              </p>
              <div className="flex items-center gap-3 text-sm">
                {LANGS.map((lang) => (
                  <span key={lang} className="flex items-center gap-1" title={todayDone[lang] ? t("learn.studiedToday") : t("learn.notStudiedToday")}>
                    {todayDone[lang]
                      ? <CheckCircle2 className="size-4 text-primary" />
                      : <Circle className="size-4 text-muted-foreground/40" />}
                    {LANG_FLAG[lang]} {t(LANG_NAME_KEY[lang])}
                  </span>
                ))}
              </div>
            </div>
            {stats.today.by_activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("learn.todayEmpty")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {stats.today.by_activity.map((a) => (
                  <Badge key={a.activity} variant="secondary" className="tnum font-normal">
                    {ACTIVITY_KEY[a.activity] ? t(ACTIVITY_KEY[a.activity]) : a.activity} · {formatDuration(a.minutes, t)}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("learn.detailNote")}</p>
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
                    <span className="text-2xl leading-none">{LANG_FLAG[lang]}</span>
                    <div className="min-w-0">
                      <p className="font-medium">{t(LANG_NAME_KEY[lang])}</p>
                      {p?.level
                        ? <Badge variant="secondary" className="mt-0.5 font-normal">{p.level}</Badge>
                        : <span className="text-xs text-muted-foreground">{t("learn.levelNotSet")}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ProfileDialog lang={lang} initial={p ?? null} onSaved={invalidateAll} />
                    <Button size="sm" variant={todayDone[lang] ? "outline" : "default"}
                      disabled={todayDone[lang] || checkin.isPending}
                      onClick={() => checkin.mutate(lang)}>
                      {todayDone[lang] ? `${t("learn.checkedIn")} ✓` : t("learn.quickCheckin")}
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 min-h-10">
                  {p?.goal || p?.note
                    ? [p?.goal, p?.note].filter(Boolean).join(" · ")
                    : t("learn.noGoalNote")}
                </p>
                <p className="text-xs text-muted-foreground tnum">
                  {t("learn.totalLabel")} {formatDuration(byLang?.minutes ?? 0, t)} · {byLang?.days ?? 0} {t("common.days", { count: byLang?.days ?? 0 })}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 近 28 天柱状图（三分支：错误态整体不渲染） */}
      {statsQ.isPending ? (
        <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
          <CardHeader><CardTitle className="text-base">{t("learn.recentChart")}</CardTitle></CardHeader>
          <CardContent><Skeleton className="h-[180px] rounded-lg" /></CardContent>
        </Card>
      ) : stats ? (
        <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
          <CardHeader><CardTitle className="text-base">{t("learn.recentChart")}</CardTitle></CardHeader>
          <CardContent><MinutesBar data={stats.recent} /></CardContent>
        </Card>
      ) : null}

      {/* 年度日历 */}
      <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
        <CardHeader><CardTitle className="text-base">{t("learn.calendarTitle")}</CardTitle></CardHeader>
        <CardContent>
          <StudyCalendar />
        </CardContent>
      </Card>
    </div>
  )
}
