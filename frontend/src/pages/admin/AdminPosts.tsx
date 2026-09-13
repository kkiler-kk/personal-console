import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { api } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Pagination } from "@/components/blog/Pagination"
import { AdminNav } from "@/components/admin/AdminNav"

export default function AdminPosts() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const qc = useQueryClient()
  const { data, isPending } = useQuery({ queryKey: ["admin-posts", page], queryFn: () => api.getAdminPosts({ page, size: 15 }) })
  const del = useMutation({
    mutationFn: (id: number) => api.deletePost(id),
    // 与 PostEditor 同款双域失效：管理列表 + 前台列表/总览计数（["posts"] 前缀）
    onSuccess: () => { toast.success(t("admin.toast.deleted")); qc.invalidateQueries({ queryKey: ["admin-posts"] }); qc.invalidateQueries({ queryKey: ["posts"] }) },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("admin.toast.deleteFailed")),
  })

  return (
    <div className="max-w-5xl space-y-4">
      <AdminNav />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("admin.posts.title")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/admin/categories">{t("admin.categories.title")}</Link></Button>
          <Button asChild><Link to="/admin/posts/new"><Plus className="size-4" /> {t("admin.editor.newTitle")}</Link></Button>
        </div>
      </div>
      {isPending ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : (
        <>
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>{t("admin.col.title")}</TableHead><TableHead>{t("admin.col.status")}</TableHead><TableHead className="tnum">{t("admin.col.views")}</TableHead><TableHead>{t("admin.col.date")}</TableHead><TableHead className="w-32">{t("admin.col.actions")}</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data?.posts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium max-w-64 truncate">{p.title}</TableCell>
                    <TableCell>{p.status === "published" ? <Badge>{t("admin.posts.published")}</Badge> : <Badge variant="secondary">{t("admin.posts.draft")}</Badge>}</TableCell>
                    <TableCell className="tnum">{p.view_count}</TableCell>
                    <TableCell className="tnum text-muted-foreground">{formatDate(p.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2 text-sm">
                        <Link className="text-primary hover:underline" to={`/admin/posts/${p.id}/edit`}>{t("common.edit")}</Link>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><button className="text-destructive hover:underline">{t("common.delete")}</button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("admin.posts.confirmDeleteTitle", { title: p.title })}</AlertDialogTitle>
                              <AlertDialogDescription>{t("admin.posts.confirmDeleteDesc")}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => del.mutate(p.id)}>{t("common.delete")}</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {data && <Pagination page={data.page} size={data.size} total={data.total} onChange={setPage} />}
        </>
      )}
    </div>
  )
}
