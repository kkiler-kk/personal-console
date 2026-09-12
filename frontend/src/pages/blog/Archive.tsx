import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Archive() {
  const { data, isPending } = useQuery({ queryKey: ["archive"], queryFn: api.getArchive })
  if (isPending) return <Skeleton className="h-64 rounded-xl max-w-2xl" />
  const byYear = (data?.archives ?? []).reduce<Record<number, { month: number; count: number }[]>>((acc, a) => {
    (acc[a.year] ??= []).push(a); return acc
  }, {})
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">归档</h1>
      {Object.entries(byYear).map(([year, months]) => (
        <Card key={year} className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
          <CardHeader><CardTitle className="text-base tnum">{year} 年</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {months.sort((a, b) => a.month - b.month).map((m) => (
              <Link key={m.month} to={`/blog?year=${year}&month=${m.month}`}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/40 tnum">
                {m.month} 月 <span className="text-muted-foreground">({m.count})</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
