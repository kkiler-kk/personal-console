import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { api, ApiError } from "@/lib/api"
import { formatDuration } from "@/lib/duration"
import { ErrorState, errorText } from "@/components/ErrorState"
import { AdminNav } from "@/components/admin/AdminNav"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
// Task 3 同步：constants 迁 i18n（LANG_NAME_KEY/ACTIVITY_KEY）与 formatDuration(minutes, t) 签名变更；
// 本页其余文案（表头/确认框/toast 等）属 Task 4 admin.* 范围，暂留硬编码
import { ACTIVITY_KEY, LANG_NAME_KEY } from "@/pages/learn/constants"

const LIMIT = 100

export default function AdminSessions() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["learn-sessions", LIMIT],
    queryFn: () => api.getLearnSessions(LIMIT),
  })
  const sessions = data?.sessions ?? []
  const total = data?.total ?? 0

  const del = useMutation({
    mutationFn: (id: number) => api.deleteLearnSession(id),
    onSuccess: () => {
      toast.success("已删除")
      // 明细/统计/日历/Dashboard 今日学习时长同源，一并失效
      qc.invalidateQueries({ queryKey: ["learn-sessions"] })
      qc.invalidateQueries({ queryKey: ["learn-stats"] })
      qc.invalidateQueries({ queryKey: ["learn-calendar"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "删除失败"),
  })

  return (
    <div className="max-w-5xl space-y-4">
      <AdminNav />
      <div>
        <h1 className="text-xl font-semibold">学习记录</h1>
        <p className="text-sm text-muted-foreground">逐条学习明细，可删除误录</p>
      </div>

      {isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : isError ? (
        <ErrorState title="加载学习记录失败" message={errorText(error)} onRetry={refetch} />
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          还没有学习记录
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card overflow-x-auto shadow-[0_1px_3px_rgba(0,0,0,.06)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead><TableHead>语言</TableHead><TableHead>类型</TableHead>
                  <TableHead className="tnum">时长</TableHead><TableHead>备注</TableHead><TableHead className="w-20">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="tnum text-muted-foreground">{s.session_date.slice(0, 10)}</TableCell>
                    <TableCell><Badge variant="secondary">{LANG_NAME_KEY[s.lang] ? t(LANG_NAME_KEY[s.lang]) : s.lang}</Badge></TableCell>
                    <TableCell>{ACTIVITY_KEY[s.activity] ? t(ACTIVITY_KEY[s.activity]) : s.activity}</TableCell>
                    <TableCell className="tnum">{formatDuration(s.minutes, t)}</TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">{s.note || "—"}</TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><button className="text-sm text-destructive hover:underline">删除</button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除这条学习记录？</AlertDialogTitle>
                            <AlertDialogDescription>{s.session_date.slice(0, 10)} · {LANG_NAME_KEY[s.lang] ? t(LANG_NAME_KEY[s.lang]) : s.lang} · {formatDuration(s.minutes, t)}，此操作不可恢复</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive/10 text-destructive hover:bg-destructive/20" onClick={() => del.mutate(s.id)}>删除</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground tnum">
            {total > LIMIT ? `仅显示最近 ${LIMIT} 条（共 ${total} 条）` : `共 ${total} 条`}
          </p>
        </>
      )}
    </div>
  )
}
