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
// Task 3 同步：constants 迁 i18n（LANG_NAME_KEY/ACTIVITY_KEY）与 formatDuration(minutes, t) 签名变更
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
      toast.success(t("admin.toast.deleted"))
      // 明细/统计/日历/Dashboard 今日学习时长同源，一并失效
      qc.invalidateQueries({ queryKey: ["learn-sessions"] })
      qc.invalidateQueries({ queryKey: ["learn-stats"] })
      qc.invalidateQueries({ queryKey: ["learn-calendar"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("admin.toast.deleteFailed")),
  })

  // 语言/时长展示值（表格与删除确认框共用）：白名单外回退原值，惯例同 LearnPage
  const langLabel = (lang: string) => (LANG_NAME_KEY[lang as keyof typeof LANG_NAME_KEY] ? t(LANG_NAME_KEY[lang as keyof typeof LANG_NAME_KEY]) : lang)

  return (
    <div className="max-w-5xl space-y-4">
      <AdminNav />
      <div>
        <h1 className="text-xl font-semibold">{t("admin.sessions.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.sessions.desc")}</p>
      </div>

      {isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : isError ? (
        <ErrorState title={t("admin.sessions.loadFailed")} message={errorText(error)} onRetry={refetch} />
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("admin.sessions.empty")}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card overflow-x-auto shadow-[0_1px_3px_rgba(0,0,0,.06)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.col.date")}</TableHead><TableHead>{t("admin.col.lang")}</TableHead><TableHead>{t("admin.col.type")}</TableHead>
                  <TableHead className="tnum">{t("admin.col.duration")}</TableHead><TableHead>{t("admin.col.note")}</TableHead><TableHead className="w-20">{t("admin.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="tnum text-muted-foreground">{s.session_date.slice(0, 10)}</TableCell>
                    <TableCell><Badge variant="secondary">{langLabel(s.lang)}</Badge></TableCell>
                    <TableCell>{ACTIVITY_KEY[s.activity] ? t(ACTIVITY_KEY[s.activity]) : s.activity}</TableCell>
                    <TableCell className="tnum">{formatDuration(s.minutes, t)}</TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">{s.note || "—"}</TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><button className="text-sm text-destructive hover:underline">{t("common.delete")}</button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("admin.sessions.deleteTitle")}</AlertDialogTitle>
                            {/* 整句插值（不做碎片拼接）：zh「{{date}} · {{lang}} · {{duration}}，此操作不可恢复」逐字保持 */}
                            <AlertDialogDescription>
                              {t("admin.sessions.deleteDesc", {
                                date: s.session_date.slice(0, 10),
                                lang: langLabel(s.lang),
                                duration: formatDuration(s.minutes, t),
                              })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive/10 text-destructive hover:bg-destructive/20" onClick={() => del.mutate(s.id)}>{t("common.delete")}</AlertDialogAction>
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
            {total > LIMIT ? t("admin.sessions.countLimited", { limit: LIMIT, total }) : t("admin.sessions.countTotal", { total })}
          </p>
        </>
      )}
    </div>
  )
}
