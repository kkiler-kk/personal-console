import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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

const CONFIRM_META = {
  uncheck: { title: (n: string) => `撤销「${n}」今日打卡？`, desc: "今日统计与热力图将同步更新", action: "撤销" },
  archive: { title: (n: string) => `归档习惯「${n}」？`, desc: "归档后不再出现在打卡列表，历史打卡记录保留", action: "归档" },
  delete: { title: (n: string) => `删除习惯「${n}」？`, desc: "该习惯的全部打卡记录将一并删除，无法恢复", action: "删除" },
} as const

type ConfirmKind = keyof typeof CONFIRM_META

function HabitDialog({ open, onOpenChange, habit, onSaved }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  habit: Habit | null // null = 新建
  onSaved: () => void
}) {
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
      toast.success(habit ? "已更新" : "已创建")
      onOpenChange(false); onSaved()
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "保存失败"),
  })

  const canSubmit = name.trim() !== "" && name.trim().length <= 50 && !save.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{habit ? "编辑习惯" : "新习惯"}</DialogTitle>
          <DialogDescription>{habit ? "调整名称、图标与颜色" : "创建一个习惯，从今天开始打卡"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="habit-name">名称</Label>
            <Input id="habit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="如 早睡、阅读 30 分钟" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="habit-icon">图标（emoji，可选）</Label>
            <Input id="habit-icon" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={16} placeholder="如 🌙" className="w-28" />
          </div>
          <div className="space-y-1.5">
            <Label>颜色</Label>
            <div className="flex gap-2 pt-0.5">
              {COLORS.map((c) => (
                <button key={c} type="button" title={c} aria-label={`颜色 ${c}`} onClick={() => setColor(c)}
                  className={`size-6 rounded-full transition-transform ${color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "hover:scale-110"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={!canSubmit} onClick={() => save.mutate()}>
            {save.isPending ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function HabitSection() {
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
    onSuccess: () => { toast.success("已打卡"); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "打卡失败"),
  })
  const uncheck = useMutation({
    mutationFn: (id: number) => api.uncheckHabit(id),
    onSuccess: () => { toast.success("已撤销打卡"); invalidateAll() },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.status === 404) {
        // 服务端本就无该记录（状态漂移）→ invalidate ["habits"] 拉齐服务端真值，视为撤销成功
        invalidateAll(); toast.success("已撤销打卡")
      } else {
        toast.error(e instanceof ApiError ? e.message : "撤销失败")
      }
    },
  })
  const archive = useMutation({
    mutationFn: (id: number) => api.updateHabit(id, { archived: true }),
    onSuccess: () => { toast.success("已归档"); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "归档失败"),
  })
  const del = useMutation({
    mutationFn: (id: number) => api.deleteHabit(id),
    onSuccess: () => { toast.success("已删除"); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "删除失败"),
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
          习惯打卡
          <span className="text-xs font-normal text-muted-foreground tnum">今日 {checkedToday}/{totalToday}</span>
        </CardTitle>
        <CardAction>
          <Button size="sm" onClick={() => openDialog(null)}><Plus className="size-4" /> 新习惯</Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {habitsQ.isError ? (
          <ErrorState title="加载习惯失败" message={errorText(habitsQ.error)} onRetry={() => habitsQ.refetch()} />
        ) : habitsQ.isPending ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[52px] rounded-lg" />)}</div>
        ) : habits.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有习惯，点右上角「新习惯」创建第一个</p>
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
                      <Check className="size-4" /> 已打卡
                    </Button>
                  ) : (
                    <Button size="sm" disabled={check.isPending} onClick={() => check.mutate(h.id)}>打卡</Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`管理 ${h.name}`}><MoreHorizontal className="size-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openDialog(h)}>
                        <Pencil className="size-4" /> 编辑
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setConfirm({ kind: "archive", habit: h })}>
                        <Archive className="size-4" /> 归档
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "delete", habit: h })}>
                        <Trash2 className="size-4" /> 删除
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
          <ErrorState title="加载热力图失败" message={errorText(heatmapQ.error)} onRetry={() => heatmapQ.refetch()} />
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
              <AlertDialogTitle>{CONFIRM_META[confirm.kind].title(confirm.habit.name)}</AlertDialogTitle>
              <AlertDialogDescription>{CONFIRM_META[confirm.kind].desc}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                className={confirm.kind === "delete" ? "bg-destructive/10 text-destructive hover:bg-destructive/20" : ""}
                onClick={() => runConfirm(confirm)}>
                {CONFIRM_META[confirm.kind].action}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  )
}
