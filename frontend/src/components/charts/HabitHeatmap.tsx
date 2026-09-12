import { useMemo } from "react"
import { format } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { HeatmapDay } from "@/lib/types"
import { compactWindowStart } from "@/lib/dates"
import { Button } from "@/components/ui/button"

interface HabitHeatmapProps {
  days: HeatmapDay[]
  year: number
  /** 提供时渲染年份切换（年份 state 由调用方持有）；compact 模式忽略 */
  onYearChange?: (year: number) => void
  /** Dashboard 迷你版：只显示近 16 周、格 8px、无月份标签 */
  compact?: boolean
}

// 后端 heatmap year clamp 同界（2000..2100）
const MIN_YEAR = 2000
const MAX_YEAR = 2100

// 4 档色：0 无打卡 / 1 / 2 / 3+（count 为当日打卡习惯数）
const tierCls = (count: number) =>
  count >= 3 ? "bg-primary"
  : count === 2 ? "bg-primary/60"
  : count === 1 ? "bg-primary/30"
  : "bg-muted"

const dateKey = (d: Date) => format(d, "yyyy-MM-dd")

/** 全年周列：53×7（或 52×7），周一起始——1 月 1 日所在周前列补空、12 月 31 日所在周后补空 */
function buildYearWeeks(year: number): (string | null)[][] {
  // 周一起始偏移：getDay() 0=周日 → 6（同 StudyCalendar 的 (getDay()+6)%7）
  const leading = (new Date(year, 0, 1).getDay() + 6) % 7
  const totalDays = Math.round((Date.UTC(year, 11, 31) - Date.UTC(year, 0, 1)) / 86_400_000) + 1
  const cells: (string | null)[] = Array<string | null>(leading).fill(null)
  for (let i = 0; i < totalDays; i++) cells.push(dateKey(new Date(year, 0, 1 + i)))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** compact：近 16 周（末列 = 今天所在周，今天之后的日期留空）；窗口起点走 lib/dates 共享公式 */
function buildCompactWeeks(): (string | null)[][] {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const start = compactWindowStart(now)
  const cells = Array.from({ length: 16 * 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d.getTime() > now.getTime() ? null : dateKey(d)
  })
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** 月份标签：某月首次出现的周列打标（月首在周中也能落在正确列） */
function monthLabels(weeks: (string | null)[][]): (string | undefined)[] {
  const labels: (string | undefined)[] = []
  let prev = 0
  for (const week of weeks) {
    let label: string | undefined
    for (const cell of week) {
      if (!cell) continue
      const m = Number(cell.slice(5, 7))
      if (m !== prev) { label = `${m}月`; prev = m }
    }
    labels.push(label)
  }
  return labels
}

export function HabitHeatmap({ days, year, onYearChange, compact = false }: HabitHeatmapProps) {
  const dayMap = useMemo(
    () => new Map(days.map((d) => [d.date, d.count])),
    // 依赖 days 引用而非派生数组：react-query 结构共享保证引用稳定
    [days],
  )
  const weeks = useMemo(() => (compact ? buildCompactWeeks() : buildYearWeeks(year)), [compact, year])
  const labels = useMemo(() => (compact ? [] : monthLabels(weeks)), [compact, weeks])
  const todayKey = dateKey(new Date())

  const px = compact ? 8 : 11
  const gap = compact ? 2 : 3
  const radius = compact ? "rounded-[2px]" : "rounded-[3px]"

  return (
    <div className="space-y-2">
      {onYearChange && !compact && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon-sm" title="上一年" disabled={year <= MIN_YEAR} onClick={() => onYearChange(year - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium tnum">{year} 年</span>
          <Button variant="ghost" size="icon-sm" title="下一年" disabled={year >= MAX_YEAR} onClick={() => onYearChange(year + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="w-fit">
          {!compact && (
            <div className="grid mb-1" style={{ gridTemplateColumns: `repeat(${weeks.length}, ${px}px)`, gap }}>
              {labels.map((l, i) => (
                <div key={i} className="text-[9px] leading-3 text-muted-foreground whitespace-nowrap">{l}</div>
              ))}
            </div>
          )}
          {/* 周列 × weekday 行：grid-flow-col 逐列填充（每列 = 一周，周一在顶） */}
          <div className="grid w-fit" style={{ gridAutoFlow: "column", gridTemplateRows: `repeat(7, ${px}px)`, gridAutoColumns: `${px}px`, gap }}>
            {weeks.flatMap((week, w) =>
              week.map((date, r) => {
                if (!date) return <div key={`pad-${w}-${r}`} />
                const count = dayMap.get(date) ?? 0
                return (
                  <div key={date} title={`${date} · ${count} 个习惯`}
                    className={`${radius} ${tierCls(count)} ${date === todayKey ? "ring-1 ring-primary" : ""}`} />
                )
              }),
            )}
          </div>
        </div>
      </div>

      {!compact && (
        <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
          少
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className={`size-2.5 rounded-[3px] ${tierCls(n)} ${n === 0 ? "border border-border/50" : ""}`} />
          ))}
          多
        </div>
      )}
    </div>
  )
}
