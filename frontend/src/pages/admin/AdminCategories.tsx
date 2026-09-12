import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Section } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

const SECTIONS: { value: Section; label: string }[] = [
  { value: "blog", label: "博客" }, { value: "invest", label: "投资" },
  { value: "learn", label: "学习" }, { value: "fitness", label: "健身" }, { value: "life", label: "生活" },
]

export default function AdminCategories() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["categories"], queryFn: api.getCategories })
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [section, setSection] = useState<Section>("blog")

  const create = useMutation({
    mutationFn: () => api.createCategory({ name, slug, section }),
    onSuccess: () => { toast.success("已创建"); setName(""); setSlug(""); qc.invalidateQueries({ queryKey: ["categories"] }) },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "创建失败"),
  })
  const updateSection = useMutation({
    mutationFn: (c: { id: number; name: string; slug: string; section: Section }) => api.updateCategory(c.id, c),
    onSuccess: () => { toast.success("已更新"); qc.invalidateQueries({ queryKey: ["categories"] }) },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "更新失败"),
  })
  const del = useMutation({
    mutationFn: (id: number) => api.deleteCategory(id),
    onSuccess: () => { toast.success("已删除"); qc.invalidateQueries({ queryKey: ["categories"] }) },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  })

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">分类管理</h1>
        <Button variant="outline" asChild><Link to="/admin/posts">返回文章</Link></Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-3 items-end">
        <div className="space-y-1"><p className="text-xs text-muted-foreground">名称</p><Input value={name} onChange={(e) => setName(e.target.value)} className="w-36" /></div>
        <div className="space-y-1"><p className="text-xs text-muted-foreground">Slug</p><Input value={slug} onChange={(e) => setSlug(e.target.value)} className="w-36" /></div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">板块</p>
          <Select value={section} onValueChange={(v) => setSection(v as Section)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button disabled={create.isPending || !name || !slug} onClick={() => create.mutate()}>新建分类</Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>Slug</TableHead><TableHead>板块</TableHead><TableHead className="w-20">操作</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.slug}</TableCell>
                <TableCell>
                  <Select value={c.section} onValueChange={(v) => updateSection.mutate({ id: c.id, name: c.name, slug: c.slug, section: v as Section })}>
                    <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><button className="text-sm text-destructive hover:underline">删除</button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>删除分类「{c.name}」？</AlertDialogTitle>
                        <AlertDialogDescription>该分类下文章将变为无分类</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={() => del.mutate(c.id)}>删除</AlertDialogAction>
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
