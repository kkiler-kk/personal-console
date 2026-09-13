import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

export function Pagination({ page, size, total, onChange }: {
  page: number; size: number; total: number; onChange: (p: number) => void
}) {
  const { t } = useTranslation()
  const pages = Math.ceil(total / size)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>{t("blog.prevPage")}</Button>
      <span className="text-sm text-muted-foreground tnum">{t("blog.pageInfo", { page, pages })}</span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>{t("blog.nextPage")}</Button>
    </div>
  )
}
