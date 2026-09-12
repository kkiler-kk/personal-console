import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

const MISSING_CATEGORY_HINT = "随手记分类缺失，请在分类管理中创建 slug=notes 的分类"

export function NoteSection() {
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
      toast.success("已记录")
      setContent("")
      invalidateNotes()
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "发布失败"),
  })
  const del = useMutation({
    mutationFn: (id: number) => api.deletePost(id),
    onSuccess: () => { toast.success("已删除"); invalidateNotes() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "删除失败"),
  })

  // 种子分类被删的优雅降级：找不到 slug=notes → 输入框禁用 + 提示
  const canSubmit = content.trim() !== "" && !!notesCat && !create.isPending
  const submit = () => { if (canSubmit) create.mutate() }

  return (
    <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
      <CardHeader>
        <CardTitle>随手记</CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/blog/category/notes">查看更多</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {catsQ.isError ? (
          <p className="text-sm text-destructive">加载分类失败：{catsQ.error instanceof Error ? catsQ.error.message : "未知错误"}</p>
        ) : catsQ.isPending ? (
          <Skeleton className="h-[76px] rounded-lg" />
        ) : notesCat ? (
          <div className="flex items-start gap-2">
            <Textarea rows={2} value={content} maxLength={2000}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit() }}
              placeholder="想到什么记一笔…（Ctrl+Enter 快速提交）" className="min-h-16 flex-1" />
            <Button disabled={!canSubmit} onClick={submit}>{create.isPending ? "记录中…" : "记一笔"}</Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <Textarea rows={2} disabled placeholder={MISSING_CATEGORY_HINT} className="min-h-16 flex-1" />
              <Button disabled>记一笔</Button>
            </div>
            <p className="text-xs text-muted-foreground">{MISSING_CATEGORY_HINT}</p>
          </div>
        )}

        {notesQ.isError ? (
          <p className="text-sm text-destructive">加载随手记失败：{notesQ.error instanceof Error ? notesQ.error.message : "未知错误"}</p>
        ) : notesQ.isPending ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有随手记，在上面记第一笔</p>
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
                    <Button variant="ghost" size="icon-sm" aria-label="删除随手记" className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>删除这条随手记？</AlertDialogTitle>
                      <AlertDialogDescription>删除后无法恢复</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive/10 text-destructive hover:bg-destructive/20" onClick={() => del.mutate(p.id)}>删除</AlertDialogAction>
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
