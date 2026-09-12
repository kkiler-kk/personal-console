import { Link } from "react-router-dom"
import { CalendarDays, Eye, Tag as TagIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { formatDate } from "@/lib/format"
import type { Post } from "@/lib/types"

export function PostCard({ post }: { post: Post }) {
  return (
    <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)] hover:border-primary/40 transition-colors">
      <CardContent className="p-5">
        <Link to={`/blog/${post.slug}`} className="text-lg font-semibold hover:text-primary">{post.title}</Link>
        {post.summary && <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{post.summary}</p>}
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{formatDate(post.created_at)}</span>
          <span className="inline-flex items-center gap-1 tnum"><Eye className="size-3.5" />{post.view_count}</span>
          {post.category && (
            <Link to={`/blog/category/${post.category.slug}`}>
              <Badge variant="secondary">{post.category.name}</Badge>
            </Link>
          )}
          {post.tags?.map((t) => (
            <Link key={t.id} to={`/blog/tag/${t.name}`} className="inline-flex items-center gap-0.5 hover:text-primary">
              <TagIcon className="size-3" />{t.name}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
