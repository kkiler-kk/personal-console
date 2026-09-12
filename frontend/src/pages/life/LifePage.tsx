import { useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ImagePlus, Trash2, Sprout } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/AuthContext"

export default function LifePage() {
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const { data, isPending } = useQuery({ queryKey: ["gallery"], queryFn: api.getGallery })
  // 后端 Go nil slice 会序列化为 null（uploads 目录无图片时 items 为 null），此处兜底为空数组
  const items = data?.items ?? []

  const upload = useMutation({
    mutationFn: (f: File) => api.uploadImage(f),
    onSuccess: () => {
      toast.success("已上传")
      // ["dashboard"] 一并失效：首页「照片」统计卡与照片墙联动（后端该接口有 60s Redis 缓存，最多等 60s 生效）
      qc.invalidateQueries({ queryKey: ["gallery"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "上传失败"),
  })
  const del = useMutation({
    mutationFn: (filename: string) => api.deleteGalleryFile(filename),
    onSuccess: () => {
      toast.success("已删除")
      qc.invalidateQueries({ queryKey: ["gallery"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  })

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2"><Sprout className="size-5" /> 生活</h1>
        {isAdmin && (
          <>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = "" }} />
            <Button size="sm" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" /> 上传照片</Button>
          </>
        )}
      </div>

      {isPending ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-16 text-center">还没有照片，点右上角上传第一张</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {items.map((item) => (
            <div key={item.filename} className="group relative aspect-square rounded-xl overflow-hidden border border-border">
              <img src={item.url} alt={item.filename} className="size-full object-cover" loading="lazy" />
              {isAdmin && (
                <button onClick={() => del.mutate(item.filename)} aria-label={`删除 ${item.filename}`}
                  className="absolute top-2 right-2 size-7 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">习惯打卡与随手记将在阶段 5 上线</p>
    </div>
  )
}
