import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { CalendarDays, Eye } from "lucide-react"
import { api } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { Markdown } from "@/components/blog/Markdown"
import { CommentSection } from "@/components/blog/CommentSection"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function PostDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { data: post, isPending, error } = useQuery({
    queryKey: ["post", slug],
    queryFn: () => api.getPost(slug!),
  })
  if (isPending) return <div className="max-w-3xl space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64" /></div>
  if (error || !post) return <p className="text-muted-foreground">文章不存在</p>

  return (
    <article className="max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{post.title}</h1>
      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{formatDate(post.created_at)}</span>
        <span className="inline-flex items-center gap-1 tnum"><Eye className="size-3.5" />{post.view_count}</span>
        {post.category && <Badge variant="secondary">{post.category.name}</Badge>}
        {post.tags?.map((t) => <Badge key={t.id} variant="outline">{t.name}</Badge>)}
      </div>
      <div className="mt-6"><Markdown content={post.content} /></div>
      <CommentSection slug={post.slug} />
    </article>
  )
}
