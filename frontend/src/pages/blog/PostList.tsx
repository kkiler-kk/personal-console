import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { PostCard } from "@/components/blog/PostCard"
import { Pagination } from "@/components/blog/Pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

const PAGE_SIZE = 10

export function PostListPage({ category, tag, title, year, month, showArchive }: {
  category?: string; tag?: string; title?: string; year?: number; month?: number; showArchive?: boolean
}) {
  const [page, setPage] = useState(1)
  const { data, isPending } = useQuery({
    queryKey: ["posts", page, category, tag, year, month],
    queryFn: () => api.getPosts({ page, size: PAGE_SIZE, category, tag, year, month }),
  })
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title ?? "博客"}</h1>
        {showArchive && (
          <Button variant="outline" size="sm" asChild><Link to="/blog/archive">归档</Link></Button>
        )}
      </div>
      {/* 后端空列表返回 null（Go nil slice），需兜底为空数组 */}
      {isPending || !data
        ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        : (data.posts ?? []).map((p) => <PostCard key={p.id} post={p} />)}
      {data && <Pagination page={data.page} size={data.size} total={data.total} onChange={setPage} />}
    </div>
  )
}

export default function PostList() {
  const [params] = useSearchParams()
  const year = params.get("year") ? Number(params.get("year")) : undefined
  const month = params.get("month") ? Number(params.get("month")) : undefined
  // key：year/month 变化时重挂载，避免沿用旧 page 导致过滤后落在空页
  return <PostListPage key={`${year ?? ""}-${month ?? ""}`} year={year} month={month}
    title={year ? `${year} 年${month ? ` ${month} 月` : ""}` : "博客"}
    showArchive={!year} />
}
