import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { X } from "lucide-react"
import { api, type PostInput } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Markdown } from "@/components/blog/Markdown"

export default function PostEditor() {
  const { id } = useParams<{ id: string }>()
  const editing = id !== undefined
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [content, setContent] = useState("")
  const [tagInput, setTagInput] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [categoryId, setCategoryId] = useState<string>("none")
  const [published, setPublished] = useState(true)
  const [preview, setPreview] = useState(false)

  const { data: cats } = useQuery({ queryKey: ["categories"], queryFn: api.getCategories })
  const { data: adminPosts } = useQuery({
    queryKey: ["admin-posts-all"], queryFn: () => api.getAdminPosts({ page: 1, size: 200 }), enabled: editing,
  })
  useEffect(() => {
    if (!editing || !adminPosts) return
    const p = adminPosts.posts.find((x) => String(x.id) === id)
    if (p) {
      setTitle(p.title); setSummary(p.summary); setContent(p.content)
      setTags((p.tags ?? []).map((t) => t.name))
      setCategoryId(p.category_id ? String(p.category_id) : "none")
      setPublished(p.status === "published")
    }
  }, [editing, id, adminPosts])

  const save = useMutation({
    mutationFn: (): Promise<unknown> => {
      const body: PostInput = {
        title, summary, content, tags,
        category_id: categoryId === "none" ? null : Number(categoryId),
        status: published ? "published" : "draft",
      }
      return editing ? api.updatePost(Number(id), body) : api.createPost(body)
    },
    onSuccess: () => {
      toast.success(editing ? "已更新" : "已创建")
      // 前缀匹配：同时失效 ["admin-posts", page] 与 ["admin-posts-all"]；前台列表 ["posts", …] 一并失效
      qc.invalidateQueries({ queryKey: ["admin-posts"] })
      qc.invalidateQueries({ queryKey: ["posts"] })
      navigate("/admin/posts")
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  })

  const upload = useMutation({
    mutationFn: (f: File) => api.uploadImage(f),
    onSuccess: (r) => { setContent((c) => `${c}\n\n![图片](${r.url})\n`); toast.success("图片已插入") },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "上传失败"),
  })

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput("")
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{editing ? "编辑文章" : "写文章"}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreview(!preview)}>{preview ? "编辑" : "预览"}</Button>
          <Button size="sm" disabled={save.isPending || !title || !content} onClick={() => save.mutate()}>
            {save.isPending ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>

      {preview ? (
        <div className="rounded-xl border border-border bg-card p-6"><Markdown content={content} /></div>
      ) : (
        <>
          <div className="space-y-2"><Label>标题</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-2"><Label>摘要（可选）</Label><Input value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>正文（Markdown）</Label>
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = "" }} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>插入图片</Button>
              </div>
            </div>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={18} className="font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label>标签</Label>
            <div className="flex gap-2">
              <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag() } }} placeholder="回车添加" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Badge key={t} variant="secondary">{t}<button onClick={() => setTags(tags.filter((x) => x !== t))}><X className="size-3 ml-1" /></button></Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 items-end">
            <div className="space-y-2">
              <Label>分类</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">无分类</SelectItem>
                  {cats?.categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch id="pub" checked={published} onCheckedChange={setPublished} />
              <Label htmlFor="pub">{published ? "发布" : "存为草稿"}</Label>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
