import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, ApiError } from "@/lib/api"
import { formatDate } from "@/lib/format"
import type { Habit } from "@/lib/types"
import { ErrorState, errorText } from "@/components/ErrorState"
import { AdminNav } from "@/components/admin/AdminNav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

// 8 色板与 LifePage HabitDialog 同款（hex ≤16 字符，符合后端 color max=16 约束）
const COLORS = ["#6366f1", "#0ea5e9", "#14b8a6", "#22c55e", "#eab308", "#f97316", "#ef4444", "#ec4899"]
const DEFAULT_COLOR = COLORS[0]

// 编辑对话框：HabitDialog 的简化内联版（仅编辑，无新建）；key 重挂载实现 open 时回填
function HabitEditDialog({ open, onOpenChange, habit, onSaved }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  habit: Habit
  onSaved: () => void
}) {
  const [name, setName] = useState(habit.name)
  const [icon, setIcon] = useState(habit.icon ?? "")
  const [color, setColor] = useState(habit.color || DEFAULT_COLOR)

  const save = useMutation({
    mutationFn: () => api.updateHabit(habit.id, { name: name.trim(), icon: icon.trim(), color }),
    onSuccess: () => { toast.success("已更新"); onOpenChange(false); onSaved() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "保存失败"),
  })

  const canSubmit = name.trim() !== "" && name.trim().length <= 50 && !save.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑习惯</DialogTitle>
          <DialogDescription>调整名称、图标与颜色</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="admin-habit-name">名称</Label>
            <Input id="admin-habit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-habit-icon">图标（emoji，可选）</Label>
            <Input id="admin-habit-icon" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={16} placeholder="如 🌙" className="w-28" />
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

export default function AdminHabits() {
  const qc = useQueryClient()
  // all=1 含归档：管理页需要看到并恢复已归档习惯
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["habits", "all"],
    queryFn: () => api.getHabits({ all: true }),
  })
  const habits = data?.habits ?? []

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["habits"] })
    qc.invalidateQueries({ queryKey: ["habit-heatmap"] })
    qc.invalidateQueries({ queryKey: ["dashboard"] })
  }

  const toggleArchive = useMutation({
    mutationFn: (h: Habit) => api.updateHabit(h.id, { archived: !h.archived }),
    onSuccess: (_r, h) => { toast.success(h.archived ? "已取消归档" : "已归档"); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "操作失败"),
  })
  const del = useMutation({
    mutationFn: (id: number) => api.deleteHabit(id),
    onSuccess: () => { toast.success("已删除"); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "删除失败"),
  })

  // 每次打开递增 seq 作对话框 key：重挂载实现「open 时回填」（HabitSection 同款）
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogState, setDialogState] = useState<{ seq: number; habit: Habit | null }>({ seq: 0, habit: null })
  const openDialog = (habit: Habit) => {
    setDialogState((s) => ({ seq: s.seq + 1, habit }))
    setDialogOpen(true)
  }

  return (
    <div className="max-w-4xl space-y-4">
      <AdminNav />
      <div>
        <h1 className="text-xl font-semibold">习惯管理</h1>
        <p className="text-sm text-muted-foreground">全部习惯（含已归档），可编辑、归档与删除</p>
      </div>

      {isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : isError ? (
        <ErrorState title="加载习惯失败" message={errorText(error)} onRetry={refetch} />
      ) : habits.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          还没有习惯，去「生活」页创建第一个
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto shadow-[0_1px_3px_rgba(0,0,0,.06)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">图标</TableHead><TableHead>名称</TableHead><TableHead>状态</TableHead>
                <TableHead>创建日期</TableHead><TableHead className="w-44">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {habits.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="text-xl leading-none">{h.icon || "⭐"}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      <span className="truncate">{h.name}</span>
                      {h.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: h.color }} />}
                    </span>
                  </TableCell>
                  <TableCell>{h.archived ? <Badge variant="secondary">已归档</Badge> : <Badge>进行中</Badge>}</TableCell>
                  <TableCell className="tnum text-muted-foreground">{formatDate(h.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2 text-sm">
                      <button className="text-primary hover:underline" onClick={() => openDialog(h)}>编辑</button>
                      <button className="text-muted-foreground hover:underline disabled:opacity-50"
                        disabled={toggleArchive.isPending} onClick={() => toggleArchive.mutate(h)}>
                        {h.archived ? "取消归档" : "归档"}
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><button className="text-destructive hover:underline">删除</button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除习惯「{h.name}」？</AlertDialogTitle>
                            <AlertDialogDescription>该习惯的全部打卡记录将一并删除，无法恢复</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive/10 text-destructive hover:bg-destructive/20" onClick={() => del.mutate(h.id)}>删除</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialogState.habit && (
        <HabitEditDialog key={dialogState.seq} open={dialogOpen} onOpenChange={setDialogOpen}
          habit={dialogState.habit} onSaved={invalidateAll} />
      )}
    </div>
  )
}
