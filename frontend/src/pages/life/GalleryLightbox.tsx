import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, ImagePlus, Trash2 } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { GalleryItem } from "@/lib/types"
import { ErrorState, errorText } from "@/components/ErrorState"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/AuthContext"

// 灯箱：大图 object-contain、左右循环切换（个人相册张数少，循环比禁用顺手）、Esc/遮罩关闭（Dialog 默认）、←/→ 键盘切换
function GalleryLightbox({ items, index, onIndexChange, onClose }: {
  items: GalleryItem[]; index: number; onIndexChange: (i: number) => void; onClose: () => void
}) {
  const item = items[index]
  if (!item) return null // 越界防御（删除导致列表收缩等）
  const total = items.length
  const step = (d: number) => onIndexChange((index + d + total) % total)

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        className="gap-2 sm:max-w-3xl"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") step(-1)
          else if (e.key === "ArrowRight") step(1)
        }}>
        <DialogTitle className="truncate pr-8 text-xs font-normal text-muted-foreground">{item.filename}</DialogTitle>
        <img src={item.url} alt={item.filename} className="max-h-[80vh] w-full rounded-lg object-contain" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tnum">{index + 1} / {total}</span>
          {total > 1 && <span>← → 切换 · Esc 关闭</span>}
        </div>
        {total > 1 && (
          <>
            <Button variant="outline" size="icon" aria-label="上一张" onClick={() => step(-1)}
              className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-background/80 shadow">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon" aria-label="下一张" onClick={() => step(1)}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-background/80 shadow">
              <ChevronRight className="size-4" />
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// 照片墙区块：既有上传/删除/网格/admin 门控逻辑自 LifePage 原样迁移，新增点击开灯箱
export function GallerySection() {
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ["gallery"], queryFn: api.getGallery })
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
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "上传失败"),
  })
  const del = useMutation({
    mutationFn: (filename: string) => api.deleteGalleryFile(filename),
    onSuccess: () => {
      toast.success("已删除")
      qc.invalidateQueries({ queryKey: ["gallery"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "删除失败"),
  })

  return (
    <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
      <CardHeader>
        <CardTitle>照片墙</CardTitle>
        {isAdmin && (
          <CardAction>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = "" }} />
            <Button size="sm" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" /> 上传照片</Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {isError ? (
          <ErrorState title="加载照片失败" message={errorText(error)} onRetry={refetch} />
        ) : isPending ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}</div>
        ) : items.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">还没有照片{isAdmin ? "，点右上角上传第一张" : ""}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {items.map((item, i) => (
              <div key={item.filename} className="group relative aspect-square overflow-hidden rounded-xl border border-border">
                <img src={item.url} alt={item.filename} className="size-full cursor-zoom-in object-cover" loading="lazy"
                  onClick={() => setLightboxIndex(i)} />
                {isAdmin && (
                  <button onClick={() => del.mutate(item.filename)} aria-label={`删除 ${item.filename}`}
                    className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {lightboxIndex !== null && (
        <GalleryLightbox items={items} index={lightboxIndex} onIndexChange={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </Card>
  )
}
