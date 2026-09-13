import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { format } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { api } from "@/lib/api"
import { formatDuration } from "@/lib/duration"
import type { CalendarDay } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

// 周一起始列头（zh 一二三四五六日 / en M T W T F S S / es L M X J V S D，键在 common.weekdays.*）
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const

// minutes 分档着色：无记录 / 已打卡（minutes=0 但有记录，task 4.5）/ 1-29 / 30-59 / 60+
const tierCls = (minutes: number, hasRecord = true) =>
  minutes >= 60 ? "bg-primary text-primary-foreground"
  : minutes >= 30 ? "bg-primary/50"
  : minutes >= 1 ? "bg-primary/25"
  : hasRecord ? "bg-primary/10 text-primary"
  : "bg-muted/50"

const dateKey = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`

function MonthCard({ year, month, dayMap, todayKey }: {
  year: number; month: number; dayMap: Map<string, CalendarDay>; todayKey: string
}) {
  const { t } = useTranslation()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // 周一起始：getDay() 0=周日 → 偏移 6
  const leading = (new Date(year, month, 1).getDay() + 6) % 7
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  return (
    <div className="rounded-xl border border-border bg-card p-2.5 shadow-[0_1px_3px_rgba(0,0,0,.06)]">
      <p className="text-xs font-medium text-center mb-1.5 tnum">{t(`common.months.m${month + 1}`)}</p>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAY_KEYS.map((w) => (
          <div key={w} className="text-[9px] text-muted-foreground text-center leading-4">{t(`common.weekdays.${w}`)}</div>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <div key={`pad-${i}`} />
          const key = dateKey(year, month, d)
          const rec = dayMap.get(key)
          // 格 title：日期部分与「时长/已打卡」走 i18n 模板；langs 为契约语言码（en/es，数据非文案）保持原样
          const title = rec
            ? `${t("learn.calendar.cellRecord", { m: month + 1, d, detail: rec.minutes > 0 ? formatDuration(rec.minutes, t) : t("learn.checkedIn") })}${rec.langs.length > 0 ? ` · ${rec.langs.join(",")}` : ""}`
            : t("learn.calendar.cellNone", { m: month + 1, d })
          return (
            <div key={key} title={title}
              className={`aspect-square rounded-[4px] flex items-center justify-center text-[9px] tnum ${tierCls(rec?.minutes ?? 0, rec != null)} ${key === todayKey ? "ring-1 ring-primary" : ""}`}>
              {d}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function StudyCalendar() {
  const { t } = useTranslation()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const calQ = useQuery({ queryKey: ["learn-calendar", year], queryFn: () => api.getLearnCalendar(year) })

  const dayMap = useMemo(
    () => new Map((calQ.data?.days ?? []).map((d) => [d.date, d])),
    // 依赖 data 引用而非派生数组：react-query 结构共享保证引用稳定
    [calQ.data],
  )
  const todayKey = format(new Date(), "yyyy-MM-dd")

  // 图例五档：无 / 已打卡（复用 learn.checkedIn，与格 title 同源）/ 分钟区间（数字语言无关，保留字面量）
  const LEGEND: { label: string; cls: string; border?: boolean }[] = [
    { label: t("learn.calendar.legendNone"), cls: tierCls(0, false), border: true },
    { label: t("learn.checkedIn"), cls: tierCls(0), border: true },
    { label: "1-29", cls: tierCls(15), border: true },
    { label: "30-59", cls: tierCls(45), border: true },
    { label: "60+", cls: tierCls(90) },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" title={t("common.prevYear")} disabled={year <= 2000} onClick={() => setYear((y) => y - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium tnum">{t("common.yearLabel", { year })}</span>
        <Button variant="ghost" size="icon-sm" title={t("common.nextYear")} disabled={year >= 2100} onClick={() => setYear((y) => y + 1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {calQ.isError ? (
        <p className="text-sm text-destructive">{t("learn.calendar.loadFailed", { msg: calQ.error instanceof Error ? calQ.error.message : t("errors.unknown") })}</p>
      ) : calQ.isPending ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-[4/3.6] rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 12 }, (_, m) => (
              <MonthCard key={m} year={year} month={m} dayMap={dayMap} todayKey={todayKey} />
            ))}
          </div>
          <div className="flex items-center justify-end gap-3 text-[11px] text-muted-foreground">
            {LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1 tnum">
                <span className={`size-2.5 rounded-[3px] ${l.cls} ${l.border ? "border border-border/50" : ""}`} />
                {l.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
