import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation()
  const [name, setName] = useState(habit.name)
  const [icon, setIcon] = useState(habit.icon ?? "")
  const [color, setColor] = useState(habit.color || DEFAULT_COLOR)

  const save = useMutation({
    mutationFn: () => api.updateHabit(habit.id, { name: name.trim(), icon: icon.trim(), color }),
    onSuccess: () => { toast.success(t("admin.toast.updated")); onOpenChange(false); onSaved() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("common.saveFailed")),
  })

  const canSubmit = name.trim() !== "" && name.trim().length <= 50 && !save.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.habits.editTitle")}</DialogTitle>
          <DialogDescription>{t("admin.habits.editDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="admin-habit-name">{t("admin.col.name")}</Label>
            <Input id="admin-habit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-habit-icon">{t("admin.habits.iconLabel")}</Label>
            <Input id="admin-habit-icon" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={16} placeholder={t("admin.habits.iconPlaceholder")} className="w-28" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.habits.colorLabel")}</Label>
            <div className="flex gap-2 pt-0.5">
              {COLORS.map((c) => (
                <button key={c} type="button" title={c} aria-label={t("admin.habits.colorAria", { color: c })} onClick={() => setColor(c)}
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

export default function AdminHabits() {
  const { t } = useTranslation()
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
    onSuccess: (_r, h) => { toast.success(h.archived ? t("admin.toast.unarchived") : t("admin.toast.archived")); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("admin.toast.actionFailed")),
  })
  const del = useMutation({
    mutationFn: (id: number) => api.deleteHabit(id),
    onSuccess: () => { toast.success(t("admin.toast.deleted")); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("admin.toast.deleteFailed")),
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
        <h1 className="text-xl font-semibold">{t("admin.habits.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.habits.desc")}</p>
      </div>

      {isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : isError ? (
        <ErrorState title={t("admin.habits.loadFailed")} message={errorText(error)} onRetry={refetch} />
      ) : habits.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("admin.habits.empty")}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto shadow-[0_1px_3px_rgba(0,0,0,.06)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">{t("admin.col.icon")}</TableHead><TableHead>{t("admin.col.name")}</TableHead><TableHead>{t("admin.col.status")}</TableHead>
                <TableHead>{t("admin.col.createdAt")}</TableHead><TableHead className="w-44">{t("admin.col.actions")}</TableHead>
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
                  <TableCell>{h.archived ? <Badge variant="secondary">{t("admin.habits.archived")}</Badge> : <Badge>{t("admin.habits.active")}</Badge>}</TableCell>
                  <TableCell className="tnum text-muted-foreground">{formatDate(h.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2 text-sm">
                      <button className="text-primary hover:underline" onClick={() => openDialog(h)}>{t("common.edit")}</button>
                      <button className="text-muted-foreground hover:underline disabled:opacity-50"
                        disabled={toggleArchive.isPending} onClick={() => toggleArchive.mutate(h)}>
                        {h.archived ? t("admin.habits.unarchive") : t("admin.habits.archive")}
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><button className="text-destructive hover:underline">{t("common.delete")}</button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("admin.habits.deleteTitle", { name: h.name })}</AlertDialogTitle>
                            <AlertDialogDescription>{t("admin.habits.deleteDesc")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive/10 text-destructive hover:bg-destructive/20" onClick={() => del.mutate(h.id)}>{t("common.delete")}</AlertDialogAction>
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
