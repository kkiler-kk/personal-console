import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ThumbsUp, Trash2, CornerDownRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { ErrorState, errorText } from "@/components/ErrorState"
import type { Comment } from "@/lib/types"

const getEmail = () => localStorage.getItem("comment_email") || ""
const setEmail = (e: string) => localStorage.setItem("comment_email", e)

function CommentItem({ c, slug, onReply }: { c: Comment; slug: string; onReply: (id: number) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [liked, setLiked] = useState(false)
  const email = getEmail()

  const like = useMutation({
    mutationFn: () => api.likeComment(c.id, email),
    onSuccess: (r) => { setLiked(r.liked); c.like_count = r.like_count; qc.invalidateQueries({ queryKey: ["comments", slug] }) },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("blog.comment.likeFailed")),
  })
  // 后端 DELETE /api/comments/:id 只支持 email 验证；can_delete=true 已蕴含 email 匹配
  const del = useMutation({
    mutationFn: () => {
      if (!email) { toast.error(t("blog.comment.emailMissing")); return Promise.reject(new Error("missing email")) }
      return api.deleteComment(c.id, email)
    },
    onSuccess: () => { toast.success(t("blog.comment.deleted")); qc.invalidateQueries({ queryKey: ["comments", slug] }) },
    onError: (e: unknown) => { if (e instanceof Error && e.message === "missing email") return; toast.error(e instanceof Error ? e.message : t("blog.comment.deleteFailed")) },
  })

  return (
    <div className="py-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{c.name}</span>
        <span className="text-xs text-muted-foreground tnum">{formatDateTime(c.created_at)}</span>
      </div>
      <p className="text-sm mt-1 whitespace-pre-wrap">{c.content}</p>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
        <button className={"inline-flex items-center gap-1 hover:text-primary " + (liked ? "text-primary" : "")}
          onClick={() => like.mutate()}><ThumbsUp className="size-3.5" /><span className="tnum">{c.like_count}</span></button>
        <button className="inline-flex items-center gap-1 hover:text-primary" onClick={() => onReply(c.id)}>
          <CornerDownRight className="size-3.5" />{t("blog.comment.reply")}</button>
        {c.can_delete && (
          <button className="inline-flex items-center gap-1 hover:text-destructive" onClick={() => del.mutate()}>
            <Trash2 className="size-3.5" />{t("common.delete")}</button>
        )}
      </div>
      {c.replies?.map((r) => (
        <div key={r.id} className="ml-6 border-l-2 border-border pl-4"><CommentItem c={r} slug={slug} onReply={onReply} /></div>
      ))}
    </div>
  )
}

export function CommentSection({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const email = getEmail()
  const [name, setName] = useState(() => localStorage.getItem("comment_name") || "")
  const [mail, setMail] = useState(email)
  const [content, setContent] = useState("")
  const [parentId, setParentId] = useState<number | undefined>()

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["comments", slug, email],
    queryFn: () => api.getComments(slug, email || undefined),
  })
  // 后端空列表返回 null（Go nil slice），兜底为空数组
  const comments = data?.comments ?? []
  const create = useMutation({
    mutationFn: () => api.createComment(slug, { name, email: mail, content, parent_id: parentId }),
    onSuccess: () => {
      toast.success(t("blog.comment.created")); setContent(""); setParentId(undefined)
      localStorage.setItem("comment_name", name); setEmail(mail)
      qc.invalidateQueries({ queryKey: ["comments", slug] })
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("blog.comment.createFailed")),
  })

  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold mb-3">
        {data ? t("blog.comment.titleWithCount", { n: data.total }) : t("blog.comment.title")}
      </h2>
      <div className="rounded-xl border border-border p-4 space-y-3 mb-4">
        {parentId && (
          <p className="text-xs text-muted-foreground">{t("blog.comment.replyTo", { id: parentId })} <button className="underline" onClick={() => setParentId(undefined)}>{t("common.cancel")}</button></p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder={t("blog.comment.nickname")} value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder={t("blog.comment.emailPlaceholder")} type="email" value={mail} onChange={(e) => setMail(e.target.value)} />
        </div>
        <Textarea placeholder={t("blog.comment.contentPlaceholder")} value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
        <Button size="sm" disabled={create.isPending || !name || !mail || !content} onClick={() => create.mutate()}>
          {create.isPending ? t("blog.comment.sending") : t("blog.comment.submit")}
        </Button>
      </div>
      <div className="divide-y divide-border">
        {/* isError → 统一错误态（task 4.5）：替代误导性「还没有评论」空态 */}
        {isError ? <ErrorState title={t("blog.comment.loadFailed")} message={errorText(error)} onRetry={refetch} />
          : isPending ? <p className="text-sm text-muted-foreground py-4">{t("common.loading")}</p>
          : comments.length === 0 ? <p className="text-sm text-muted-foreground py-4">{t("blog.comment.empty")}</p>
          : comments.map((c) => <CommentItem key={c.id} c={c} slug={slug} onReply={setParentId} />)}
      </div>
    </section>
  )
}
