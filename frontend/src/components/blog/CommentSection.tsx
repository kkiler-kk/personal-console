import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
  const qc = useQueryClient()
  const [liked, setLiked] = useState(false)
  const email = getEmail()

  const like = useMutation({
    mutationFn: () => api.likeComment(c.id, email),
    onSuccess: (r) => { setLiked(r.liked); c.like_count = r.like_count; qc.invalidateQueries({ queryKey: ["comments", slug] }) },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "点赞失败"),
  })
  // 后端 DELETE /api/comments/:id 只支持 email 验证；can_delete=true 已蕴含 email 匹配
  const del = useMutation({
    mutationFn: () => {
      if (!email) { toast.error("请先在评论框填写邮箱"); return Promise.reject(new Error("missing email")) }
      return api.deleteComment(c.id, email)
    },
    onSuccess: () => { toast.success("已删除"); qc.invalidateQueries({ queryKey: ["comments", slug] }) },
    onError: (e: unknown) => { if (e instanceof Error && e.message === "missing email") return; toast.error(e instanceof Error ? e.message : "删除失败") },
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
          <CornerDownRight className="size-3.5" />回复</button>
        {c.can_delete && (
          <button className="inline-flex items-center gap-1 hover:text-destructive" onClick={() => del.mutate()}>
            <Trash2 className="size-3.5" />删除</button>
        )}
      </div>
      {c.replies?.map((r) => (
        <div key={r.id} className="ml-6 border-l-2 border-border pl-4"><CommentItem c={r} slug={slug} onReply={onReply} /></div>
      ))}
    </div>
  )
}

export function CommentSection({ slug }: { slug: string }) {
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
      toast.success("评论成功"); setContent(""); setParentId(undefined)
      localStorage.setItem("comment_name", name); setEmail(mail)
      qc.invalidateQueries({ queryKey: ["comments", slug] })
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "评论失败"),
  })

  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold mb-3">评论 {data ? `(${data.total})` : ""}</h2>
      <div className="rounded-xl border border-border p-4 space-y-3 mb-4">
        {parentId && (
          <p className="text-xs text-muted-foreground">回复 #{parentId} <button className="underline" onClick={() => setParentId(undefined)}>取消</button></p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="昵称" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="邮箱（用于识别你的评论/点赞）" type="email" value={mail} onChange={(e) => setMail(e.target.value)} />
        </div>
        <Textarea placeholder="说点什么…" value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
        <Button size="sm" disabled={create.isPending || !name || !mail || !content} onClick={() => create.mutate()}>
          {create.isPending ? "发送中…" : "评论"}
        </Button>
      </div>
      <div className="divide-y divide-border">
        {/* isError → 统一错误态（task 4.5）：替代误导性「还没有评论」空态 */}
        {isError ? <ErrorState title="加载评论失败" message={errorText(error)} onRetry={refetch} />
          : isPending ? <p className="text-sm text-muted-foreground py-4">加载中…</p>
          : comments.length === 0 ? <p className="text-sm text-muted-foreground py-4">还没有评论，来抢沙发</p>
          : comments.map((c) => <CommentItem key={c.id} c={c} slug={slug} onReply={setParentId} />)}
      </div>
    </section>
  )
}
