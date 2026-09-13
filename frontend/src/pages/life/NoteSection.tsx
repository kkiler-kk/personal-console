import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { ErrorState, errorText } from "@/components/ErrorState"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

export function NoteSection() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const catsQ = useQuery({ queryKey: ["categories"], queryFn: api.getCategories })
  // ["notes"] = getPosts(category:notes) 的专用键（与 ["posts", ...] 分页列表键隔离）
  const notesQ = useQuery({ queryKey: ["notes"], queryFn: () => api.getPosts({ category: "notes", size: 20 }) })
  const [content, setContent] = useState("")

  const notesCat = (catsQ.data?.categories ?? []).find((c) => c.slug === "notes")
  const notes = notesQ.data?.posts ?? []

  const invalidateNotes = () => {
    qc.invalidateQueries({ queryKey: ["notes"] })
    qc.invalidateQueries({ queryKey: ["posts"] })
    qc.invalidateQueries({ queryKey: ["dashboard"] })
  }

  const create = useMutation({
    mutationFn: () => {
      const body = content.trim()
      // title = 内容首行截 30 字符（不足全取；首行天然无换行）；Array.from 按码点切割：
      // .slice 按 UTF-16 code unit 会把 emoji 代理对劈出孤立代理（JSON→Go 持久化为 U+FFFD 不可自愈）
      const title = Array.from(body.split(/\r?\n/)[0].trim()).slice(0, 30).join("")
      return api.createPost({ title, content: body, category_id: notesCat?.id, status: "published" })
    },
    onSuccess: () => {
      toast.success(t("life.note.created"))
      setContent("")
      invalidateNotes()
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("life.note.publishFailed")),
  })
  const del = useMutation({
    mutationFn: (id: number) => api.deletePost(id),
    onSuccess: () => { toast.success(t("life.deleted")); invalidateNotes() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("life.deleteFailed")),
  })

  // 种子分类被删的优雅降级：找不到 slug=notes → 输入框禁用 + 提示
  const canSubmit = content.trim() !== "" && !!notesCat && !create.isPending
  const submit = () => { if (canSubmit) create.mutate() }

  return (
    <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
      <CardHeader>
        <CardTitle>{t("life.note.title")}</CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/blog/category/notes">{t("life.note.viewMore")}</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {catsQ.isError ? (
          <ErrorState title={t("life.note.categoriesFailed")} message={errorText(catsQ.error)} onRetry={() => catsQ.refetch()} />
        ) : catsQ.isPending ? (
          <Skeleton className="h-[76px] rounded-lg" />
        ) : notesCat ? (
          <div className="flex items-start gap-2">
            <Textarea rows={2} value={content} maxLength={2000}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit() }}
              placeholder={t("life.note.placeholder")} className="min-h-16 flex-1" />
            <Button disabled={!canSubmit} onClick={submit}>{create.isPending ? t("life.note.submitting") : t("life.note.submit")}</Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <Textarea rows={2} disabled placeholder={t("life.note.missingCategory")} className="min-h-16 flex-1" />
              <Button disabled>{t("life.note.submit")}</Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("life.note.missingCategory")}</p>
          </div>
        )}

        {notesQ.isError ? (
          <ErrorState title={t("life.note.loadFailed")} message={errorText(notesQ.error)} onRetry={() => notesQ.refetch()} />
        ) : notesQ.isPending ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("life.note.empty")}</p>
        ) : (
          <div className="space-y-2">
            {notes.map((p) => (
              <div key={p.id} className="flex items-start gap-2 rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground tnum">{formatDateTime(p.created_at)}</p>
                  <p className="mt-1 line-clamp-2 text-sm break-all whitespace-pre-line">{p.content || p.title}</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={t("life.note.deleteAria")} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("life.note.confirmTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("life.note.confirmDesc")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive/10 text-destructive hover:bg-destructive/20" onClick={() => del.mutate(p.id)}>{t("common.delete")}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
