import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { api } from "@/lib/api"
import type { CalendarDay } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"]

// minutes 分档着色：0 无 / 1-29 / 30-59 / 60+
const tierCls = (minutes: number) =>
  minutes >= 60 ? "bg-primary text-primary-foreground"
  : minutes >= 30 ? "bg-primary/50"
  : minutes >= 1 ? "bg-primary/25"
  : "bg-muted/50"

const LEGEND: { label: string; minutes: number }[] = [
  { label: "无", minutes: 0 }, { label: "1-29", minutes: 15 },
  { label: "30-59", minutes: 45 }, { label: "60+", minutes: 90 },
]

const dateKey = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`

function MonthCard({ year, month, dayMap, todayKey }: {
  year: number; month: number; dayMap: Map<string, CalendarDay>; todayKey: string
}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // 周一起始：getDay() 0=周日 → 偏移 6
  const leading = (new Date(year, month, 1).getDay() + 6) % 7
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  return (
    <div className="rounded-xl border border-border bg-card p-2.5 shadow-[0_1px_3px_rgba(0,0,0,.06)]">
      <p className="text-xs font-medium text-center mb-1.5 tnum">{month + 1}月</p>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[9px] text-muted-foreground text-center leading-4">{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <div key={`pad-${i}`} />
          const key = dateKey(year, month, d)
          const rec = dayMap.get(key)
          const title = rec
            ? `${month + 1}月${d}日 · ${rec.minutes} 分钟${rec.langs.length > 0 ? ` · ${rec.langs.join(",")}` : ""}`
            : `${month + 1}月${d}日 · 无记录`
          return (
            <div key={key} title={title}
              className={`aspect-square rounded-[4px] flex items-center justify-center text-[9px] tnum ${tierCls(rec?.minutes ?? 0)} ${key === todayKey ? "ring-1 ring-primary" : ""}`}>
              {d}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function StudyCalendar() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const calQ = useQuery({ queryKey: ["learn-calendar", year], queryFn: () => api.getLearnCalendar(year) })

  const dayMap = useMemo(
    () => new Map((calQ.data?.days ?? []).map((d) => [d.date, d])),
    // 依赖 data 引用而非派生数组：react-query 结构共享保证引用稳定
    [calQ.data],
  )
  const todayKey = format(new Date(), "yyyy-MM-dd")

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" title="上一年" disabled={year <= 2000} onClick={() => setYear((y) => y - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium tnum">{year} 年</span>
        <Button variant="ghost" size="icon-sm" title="下一年" disabled={year >= 2100} onClick={() => setYear((y) => y + 1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {calQ.isError ? (
        <p className="text-sm text-destructive">加载日历失败：{calQ.error instanceof Error ? calQ.error.message : "未知错误"}</p>
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
                <span className={`size-2.5 rounded-[3px] ${tierCls(l.minutes)} ${l.minutes >= 60 ? "" : "border border-border/50"}`} />
                {l.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
