import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { api } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Pagination } from "@/components/blog/Pagination"

export default function AdminPosts() {
  const [page, setPage] = useState(1)
  const qc = useQueryClient()
  const { data, isPending } = useQuery({ queryKey: ["admin-posts", page], queryFn: () => api.getAdminPosts({ page, size: 15 }) })
  const del = useMutation({
    mutationFn: (id: number) => api.deletePost(id),
    onSuccess: () => { toast.success("已删除"); qc.invalidateQueries({ queryKey: ["admin-posts"] }) },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  })

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">文章管理</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/admin/categories">分类管理</Link></Button>
          <Button asChild><Link to="/admin/posts/new"><Plus className="size-4" /> 写文章</Link></Button>
        </div>
      </div>
      {isPending ? <p className="text-sm text-muted-foreground">加载中…</p> : (
        <>
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>标题</TableHead><TableHead>状态</TableHead><TableHead className="tnum">浏览</TableHead><TableHead>日期</TableHead><TableHead className="w-32">操作</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data?.posts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium max-w-64 truncate">{p.title}</TableCell>
                    <TableCell>{p.status === "published" ? <Badge>已发布</Badge> : <Badge variant="secondary">草稿</Badge>}</TableCell>
                    <TableCell className="tnum">{p.view_count}</TableCell>
                    <TableCell className="tnum text-muted-foreground">{formatDate(p.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2 text-sm">
                        <Link className="text-primary hover:underline" to={`/admin/posts/${p.id}/edit`}>编辑</Link>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><button className="text-destructive hover:underline">删除</button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>删除《{p.title}》？</AlertDialogTitle>
                              <AlertDialogDescription>此操作不可恢复</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => del.mutate(p.id)}>删除</AlertDialogAction>
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
