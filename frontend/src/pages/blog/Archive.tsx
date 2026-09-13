import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { ErrorState, errorText } from "@/components/ErrorState"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Archive() {
  const { t } = useTranslation()
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ["archive"], queryFn: api.getArchive })
  const byYear = (data?.archives ?? []).reduce<Record<number, { month: number; count: number }[]>>((acc, a) => {
    (acc[a.year] ??= []).push(a); return acc
  }, {})
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">{t("blog.archive")}</h1>
      {/* isError → 统一错误态（task 4.5）：替代永久骨架屏 */}
      {isError ? (
        <ErrorState title={t("blog.archiveLoadFailed")} message={errorText(error)} onRetry={refetch} />
      ) : isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        Object.entries(byYear).map(([year, months]) => (
          <Card key={year} className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
            {/* 年卡头复用 common.yearLabel（zh「{{year}} 年」与原「{year} 年」逐字一致） */}
            <CardHeader><CardTitle className="text-base tnum">{t("common.yearLabel", { year })}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {months.sort((a, b) => a.month - b.month).map((m) => (
                <Link key={m.month} to={`/blog?year=${year}&month=${m.month}`}
                  className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/40 tnum">
                  {/* blog.month：zh 带空格「N 月」逐字保留，勿换 common.months */}
                  {t("blog.month", { m: m.month })} <span className="text-muted-foreground">({m.count})</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
