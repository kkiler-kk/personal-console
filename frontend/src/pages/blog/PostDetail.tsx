import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { CalendarDays, Eye } from "lucide-react"
import { api } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { Markdown } from "@/components/blog/Markdown"
import { CommentSection } from "@/components/blog/CommentSection"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function PostDetail() {
  const { t } = useTranslation()
  const { slug } = useParams<{ slug: string }>()
  const { data: post, isPending, error } = useQuery({
    queryKey: ["post", slug],
    queryFn: () => api.getPost(slug!),
  })
  if (isPending) return <div className="max-w-3xl space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64" /></div>
  if (error || !post) return <p className="text-muted-foreground">{t("blog.notFound")}</p>

  return (
    <article className="max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{post.title}</h1>
      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{formatDate(post.created_at)}</span>
        <span className="inline-flex items-center gap-1 tnum"><Eye className="size-3.5" />{post.view_count}</span>
        {post.category && <Badge variant="secondary">{post.category.name}</Badge>}
        {/* 形参用 tag：t 是 useTranslation 的翻译函数，勿遮蔽（PostEditor 同款） */}
        {post.tags?.map((tag) => <Badge key={tag.id} variant="outline">{tag.name}</Badge>)}
      </div>
      <div className="mt-6"><Markdown content={post.content} /></div>
      <CommentSection slug={post.slug} />
    </article>
  )
}
