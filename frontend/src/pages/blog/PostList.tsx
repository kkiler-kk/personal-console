import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { PostCard } from "@/components/blog/PostCard"
import { Pagination } from "@/components/blog/Pagination"
import { ErrorState, errorText } from "@/components/ErrorState"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

const PAGE_SIZE = 10

export function PostListPage({ category, tag, title, year, month, showArchive }: {
  category?: string; tag?: string; title?: string; year?: number; month?: number; showArchive?: boolean
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["posts", page, category, tag, year, month],
    queryFn: () => api.getPosts({ page, size: PAGE_SIZE, category, tag, year, month }),
  })
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title ?? t("blog.title")}</h1>
        {showArchive && (
          <Button variant="outline" size="sm" asChild><Link to="/blog/archive">{t("blog.archive")}</Link></Button>
        )}
      </div>
      {/* isError → 统一错误态（task 4.5）：替代永久骨架屏；空列表返回 null（Go nil slice）仍兜底为空数组 */}
      {isError ? (
        <ErrorState title={t("blog.loadFailed")} message={errorText(error)} onRetry={refetch} />
      ) : isPending || !data
        ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        : (data.posts ?? []).map((p) => <PostCard key={p.id} post={p} />)}
      {data && <Pagination page={data.page} size={data.size} total={data.total} onChange={setPage} />}
    </div>
  )
}

export default function PostList() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const year = params.get("year") ? Number(params.get("year")) : undefined
  const month = params.get("month") ? Number(params.get("month")) : undefined
  // 标题：年-only 复用 common.yearLabel（zh「{{year}} 年」逐字），年+月走 blog.yearMonthTitle 整句插值
  // （en/es 模板消费补零的 monthPadded → 2026-05；zh 用原始 month →「2026 年 5 月」）
  const title = year
    ? (month ? t("blog.yearMonthTitle", { year, month, monthPadded: String(month).padStart(2, "0") }) : t("common.yearLabel", { year }))
    : t("blog.title")
  // key：year/month 变化时重挂载，避免沿用旧 page 导致过滤后落在空页
  return <PostListPage key={`${year ?? ""}-${month ?? ""}`} year={year} month={month}
    title={title}
    showArchive={!year} />
}
