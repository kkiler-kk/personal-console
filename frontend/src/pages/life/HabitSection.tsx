import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Archive, Check, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { Habit } from "@/lib/types"
import { ErrorState, errorText } from "@/components/ErrorState"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { HabitHeatmap } from "@/components/charts/HabitHeatmap"

// 8 色板（hex ≤16 字符，符合后端 color max=16 约束）
const COLORS = ["#6366f1", "#0ea5e9", "#14b8a6", "#22c55e", "#eab308", "#f97316", "#ef4444", "#ec4899"]
const DEFAULT_COLOR = COLORS[0]

// 当日打卡状态完全由服务端驱动（task 4.5）：GET /api/habits 行携带 checked_today，
// mutation 成功后 invalidate ["habits"] 闭环刷新——不再有 localStorage hack。

// 三类确认框文案键（title 插值 {{name}}；action 复用 common/life 既有键）
const CONFIRM_META = {
  uncheck: { titleKey: "life.habit.confirmUncheckTitle", descKey: "life.habit.confirmUncheckDesc", actionKey: "common.undo" },
  archive: { titleKey: "life.habit.confirmArchiveTitle", descKey: "life.habit.confirmArchiveDesc", actionKey: "life.habit.archive" },
  delete: { titleKey: "life.habit.confirmDeleteTitle", descKey: "life.habit.confirmDeleteDesc", actionKey: "common.delete" },
} as const

type ConfirmKind = keyof typeof CONFIRM_META

function HabitDialog({ open, onOpenChange, habit, onSaved }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  habit: Habit | null // null = 新建
  onSaved: () => void
}) {
  const { t } = useTranslation()
  // 父组件每次打开递增 key → 重挂载即重置/回填（open 时重置惯例；程序化 open 不触发 onOpenChange，故不走 fill 模式）
  const [name, setName] = useState(habit?.name ?? "")
  const [icon, setIcon] = useState(habit?.icon ?? "")
  const [color, setColor] = useState(habit?.color || DEFAULT_COLOR)

  const save = useMutation({
    // Promise<void> 统一返回：三元分支两种响应形状（{id} / {message}）会让 TanStack 推断出联合类型报错
    mutationFn: async () => {
      if (habit) await api.updateHabit(habit.id, { name: name.trim(), icon: icon.trim(), color })
      else await api.createHabit({ name: name.trim(), icon: icon.trim() || undefined, color })
    },
    onSuccess: () => {
      toast.success(habit ? t("life.habit.updated") : t("life.habit.created"))
      onOpenChange(false); onSaved()
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("common.saveFailed")),
  })

  const canSubmit = name.trim() !== "" && name.trim().length <= 50 && !save.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{habit ? t("life.habit.editTitle") : t("life.habit.new")}</DialogTitle>
          <DialogDescription>{habit ? t("life.habit.editDesc") : t("life.habit.newDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="habit-name">{t("life.habit.name")}</Label>
            <Input id="habit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder={t("life.habit.namePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="habit-icon">{t("life.habit.iconLabel")}</Label>
            <Input id="habit-icon" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={16} placeholder={t("life.habit.iconPlaceholder")} className="w-28" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("life.habit.colorLabel")}</Label>
            <div className="flex gap-2 pt-0.5">
              {COLORS.map((c) => (
                <button key={c} type="button" title={c} aria-label={t("life.habit.colorAria", { color: c })} onClick={() => setColor(c)}
                  className={`size-6 rounded-full transition-transform ${color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "hover:scale-110"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button disabled={!canSubmit} onClick={() => save.mutate()}>
            {save.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function HabitSection() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [year, setYear] = useState(() => new Date().getFullYear())
  // 默认 List（不传 all）：归档习惯自然过滤（4.2 交接结论）；行含 checked_today（task 4.5）
  const habitsQ = useQuery({ queryKey: ["habits"], queryFn: () => api.getHabits() })
  const heatmapQ = useQuery({ queryKey: ["habit-heatmap", year], queryFn: () => api.getHabitHeatmap(year) })
  const dashQ = useQuery({ queryKey: ["dashboard"], queryFn: api.getDashboardSummary })
  const habits = habitsQ.data?.habits ?? []

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["habits"] })
    qc.invalidateQueries({ queryKey: ["habit-heatmap"] })
    qc.invalidateQueries({ queryKey: ["dashboard"] })
  }

  const check = useMutation({
    mutationFn: (id: number) => api.checkHabit(id),
    onSuccess: () => { toast.success(t("life.habit.toastChecked")); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("life.habit.checkinFailed")),
  })
  const uncheck = useMutation({
    mutationFn: (id: number) => api.uncheckHabit(id),
    onSuccess: () => { toast.success(t("life.habit.toastUnchecked")); invalidateAll() },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.status === 404) {
        // 服务端本就无该记录（状态漂移）→ invalidate ["habits"] 拉齐服务端真值，视为撤销成功
        invalidateAll(); toast.success(t("life.habit.toastUnchecked"))
      } else {
        toast.error(e instanceof ApiError ? e.message : t("life.habit.uncheckFailed"))
      }
    },
  })
  const archive = useMutation({
    mutationFn: (id: number) => api.updateHabit(id, { archived: true }),
    onSuccess: () => { toast.success(t("life.habit.toastArchived")); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("life.habit.archiveFailed")),
  })
  const del = useMutation({
    mutationFn: (id: number) => api.deleteHabit(id),
    onSuccess: () => { toast.success(t("life.deleted")); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("life.deleteFailed")),
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  // 每次打开递增 seq 作 HabitDialog 的 key：重挂载实现「open 时重置/回填」
  const [dialogState, setDialogState] = useState<{ seq: number; habit: Habit | null }>({ seq: 0, habit: null })
  const openDialog = (habit: Habit | null) => {
    setDialogState((s) => ({ seq: s.seq + 1, habit }))
    setDialogOpen(true)
  }
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; habit: Habit } | null>(null)

  const runConfirm = ({ kind, habit }: { kind: ConfirmKind; habit: Habit }) => {
    if (kind === "uncheck") uncheck.mutate(habit.id)
    else if (kind === "archive") archive.mutate(habit.id)
    else del.mutate(habit.id)
  }

  // 全站今日 x/y：以 dashboard summary 为服务端真值；查询未就绪时回退 habits 行的 checked_today
  const dash = dashQ.data
  const checkedToday = dash?.habits_checked_today ?? habits.filter((h) => h.checked_today).length
  const totalToday = dash?.habits_total ?? habits.length

  return (
    <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("life.habit.title")}
          <span className="text-xs font-normal text-muted-foreground tnum">{t("life.habit.todayCount", { done: checkedToday, total: totalToday })}</span>
        </CardTitle>
        <CardAction>
          <Button size="sm" onClick={() => openDialog(null)}><Plus className="size-4" /> {t("life.habit.new")}</Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {habitsQ.isError ? (
          <ErrorState title={t("life.habit.loadFailed")} message={errorText(habitsQ.error)} onRetry={() => habitsQ.refetch()} />
        ) : habitsQ.isPending ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[52px] rounded-lg" />)}</div>
        ) : habits.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("life.habit.empty")}</p>
        ) : (
          <div className="space-y-2">
            {habits.map((h) => {
              const checked = h.checked_today
              return (
                <div key={h.id} className="flex items-center gap-2.5 rounded-lg border border-border p-2.5">
                  <span className="text-xl leading-none">{h.icon || "⭐"}</span>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-sm font-medium">{h.name}</span>
                    {h.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: h.color }} />}
                  </div>
                  {checked ? (
                    <Button size="sm" variant="outline" disabled={uncheck.isPending}
                      className="border-green-500/40 bg-green-500/10 text-green-600 hover:bg-green-500/20 hover:text-green-700 dark:text-green-500"
                      onClick={() => setConfirm({ kind: "uncheck", habit: h })}>
                      <Check className="size-4" /> {t("life.habit.checkedIn")}
                    </Button>
                  ) : (
                    <Button size="sm" disabled={check.isPending} onClick={() => check.mutate(h.id)}>{t("life.habit.checkin")}</Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={t("life.habit.manageAria", { name: h.name })}><MoreHorizontal className="size-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openDialog(h)}>
                        <Pencil className="size-4" /> {t("common.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setConfirm({ kind: "archive", habit: h })}>
                        <Archive className="size-4" /> {t("life.habit.archive")}
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "delete", habit: h })}>
                        <Trash2 className="size-4" /> {t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
          </div>
        )}

        {/* 年度热力图（三分支：骨架 / 统一错误态不卡死 / 正常渲染） */}
        {heatmapQ.isError ? (
          <ErrorState title={t("life.habit.heatmapFailed")} message={errorText(heatmapQ.error)} onRetry={() => heatmapQ.refetch()} />
        ) : heatmapQ.isPending ? (
          <Skeleton className="h-32 rounded-lg" />
        ) : (
          <HabitHeatmap days={heatmapQ.data?.days ?? []} year={year} onYearChange={setYear} />
        )}
      </CardContent>

      <HabitDialog key={dialogState.seq} open={dialogOpen} onOpenChange={setDialogOpen} habit={dialogState.habit} onSaved={invalidateAll} />

      {confirm && (
        <AlertDialog open onOpenChange={(o) => { if (!o) setConfirm(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t(CONFIRM_META[confirm.kind].titleKey, { name: confirm.habit.name })}</AlertDialogTitle>
              <AlertDialogDescription>{t(CONFIRM_META[confirm.kind].descKey)}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className={confirm.kind === "delete" ? "bg-destructive/10 text-destructive hover:bg-destructive/20" : ""}
                onClick={() => runConfirm(confirm)}>
                {t(CONFIRM_META[confirm.kind].actionKey)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  )
}
