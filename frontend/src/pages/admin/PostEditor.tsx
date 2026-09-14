import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
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
import { AdminNav } from "@/components/admin/AdminNav"

export default function PostEditor() {
  const { t } = useTranslation()
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
    queryKey: ["admin-posts", "all"], queryFn: () => api.getAdminPosts({ page: 1, size: 200 }), enabled: editing,
  })
  useEffect(() => {
    if (!editing || !adminPosts) return
    const p = adminPosts.posts.find((x) => String(x.id) === id)
    if (p) {
      setTitle(p.title); setSummary(p.summary); setContent(p.content)
      setTags((p.tags ?? []).map((tg) => tg.name))
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
      toast.success(editing ? t("admin.toast.updated") : t("admin.toast.created"))
      // 前缀失效 ["admin-posts", page] 与 ["admin-posts", "all"]（编辑器回填数据）；前台列表 ["posts", …] 一并失效
      qc.invalidateQueries({ queryKey: ["admin-posts"] })
      qc.invalidateQueries({ queryKey: ["posts"] })
      navigate("/admin/posts")
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("common.saveFailed")),
  })

  const upload = useMutation({
    mutationFn: (f: File) => api.uploadImage(f),
    // alt 固定语言中性 "image"：Markdown 正文持久化存储，不得随插入时的 UI 语言渗入本地化文本（原 admin.editor.imageAlt 键已随之删除）
    onSuccess: (r) => { setContent((c) => `${c}\n\n![image](${r.url})\n`); toast.success(t("admin.editor.imageInserted")) },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("admin.editor.uploadFailed")),
  })

  const addTag = () => {
    const tg = tagInput.trim()
    if (tg && !tags.includes(tg)) setTags([...tags, tg])
    setTagInput("")
  }

  return (
    <div className="max-w-3xl space-y-4">
      <AdminNav />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{editing ? t("admin.editor.editTitle") : t("admin.editor.newTitle")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreview(!preview)}>{preview ? t("common.edit") : t("admin.editor.preview")}</Button>
          <Button size="sm" disabled={save.isPending || !title || !content} onClick={() => save.mutate()}>
            {save.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>

      {preview ? (
        <div className="rounded-xl border border-border bg-card p-6"><Markdown content={content} /></div>
      ) : (
        <>
          <div className="space-y-2"><Label>{t("admin.col.title")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-2"><Label>{t("admin.editor.summary")}</Label><Input value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("admin.editor.content")}</Label>
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = "" }} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>{t("admin.editor.insertImage")}</Button>
              </div>
            </div>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={18} className="font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label>{t("admin.editor.tags")}</Label>
            <div className="flex gap-2">
              <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag() } }} placeholder={t("admin.editor.tagPlaceholder")} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}<button type="button" aria-label={t("admin.editor.removeTagAria", { tag })} onClick={() => setTags(tags.filter((x) => x !== tag))}><X className="size-3 ml-1" /></button></Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 items-end">
            <div className="space-y-2">
              <Label>{t("admin.editor.category")}</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("admin.editor.noCategory")}</SelectItem>
                  {cats?.categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch id="pub" checked={published} onCheckedChange={setPublished} />
              <Label htmlFor="pub">{published ? t("admin.editor.publish") : t("admin.editor.saveDraft")}</Label>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
