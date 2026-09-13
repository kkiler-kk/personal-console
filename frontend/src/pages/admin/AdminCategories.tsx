import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Section } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { AdminNav } from "@/components/admin/AdminNav"

// 板块显示名复用 nav.*（blog/invest/learn/life 四板块）；fitness 为已取消模块的遗留枚举值
// （历史分类可能仍携带该值，需可显示），文案键 admin.section.fitness
const SECTIONS: { value: Section; labelKey: string }[] = [
  { value: "blog", labelKey: "nav.blog" }, { value: "invest", labelKey: "nav.invest" },
  { value: "learn", labelKey: "nav.learn" }, { value: "fitness", labelKey: "admin.section.fitness" }, { value: "life", labelKey: "nav.life" },
]

export default function AdminCategories() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["categories"], queryFn: api.getCategories })
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [section, setSection] = useState<Section>("blog")

  const create = useMutation({
    mutationFn: () => api.createCategory({ name, slug, section }),
    onSuccess: () => { toast.success(t("admin.toast.created")); setName(""); setSlug(""); qc.invalidateQueries({ queryKey: ["categories"] }) },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("admin.toast.createFailed")),
  })
  const updateSection = useMutation({
    mutationFn: (c: { id: number; name: string; slug: string; section: Section }) => api.updateCategory(c.id, c),
    onSuccess: () => { toast.success(t("admin.toast.updated")); qc.invalidateQueries({ queryKey: ["categories"] }) },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("admin.toast.updateFailed")),
  })
  const del = useMutation({
    mutationFn: (id: number) => api.deleteCategory(id),
    onSuccess: () => { toast.success(t("admin.toast.deleted")); qc.invalidateQueries({ queryKey: ["categories"] }) },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("admin.toast.deleteFailed")),
  })

  return (
    <div className="max-w-3xl space-y-4">
      <AdminNav />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("admin.categories.title")}</h1>
        <Button variant="outline" asChild><Link to="/admin/posts">{t("admin.categories.backToPosts")}</Link></Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-3 items-end">
        <div className="space-y-1"><p className="text-xs text-muted-foreground">{t("admin.col.name")}</p><Input value={name} onChange={(e) => setName(e.target.value)} className="w-36" /></div>
        <div className="space-y-1"><p className="text-xs text-muted-foreground">Slug</p><Input value={slug} onChange={(e) => setSlug(e.target.value)} className="w-36" /></div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("admin.col.section")}</p>
          <Select value={section} onValueChange={(v) => setSection(v as Section)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{t(s.labelKey)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button disabled={create.isPending || !name || !slug} onClick={() => create.mutate()}>{t("admin.categories.create")}</Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>{t("admin.col.name")}</TableHead><TableHead>Slug</TableHead><TableHead>{t("admin.col.section")}</TableHead><TableHead className="w-20">{t("admin.col.actions")}</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.slug}</TableCell>
                <TableCell>
                  <Select value={c.section} onValueChange={(v) => updateSection.mutate({ id: c.id, name: c.name, slug: c.slug, section: v as Section })}>
                    <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{t(s.labelKey)}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><button className="text-sm text-destructive hover:underline">{t("common.delete")}</button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("admin.categories.deleteTitle", { name: c.name })}</AlertDialogTitle>
                        <AlertDialogDescription>{t("admin.categories.deleteDesc")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => del.mutate(c.id)}>{t("common.delete")}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
