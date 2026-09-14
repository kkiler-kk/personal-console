import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2 } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { GalleryItem } from "@/lib/types"
import { formatFileSize } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ErrorState, errorText } from "@/components/ErrorState"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Skeleton } from "@/components/ui/skeleton"

// 缩略图（masonry 单项）：加载前 skeleton 占位（原图高度未知，aspect 占位缓解 columns 重排抖动），
// onLoad 渐显；悬停/键盘聚焦（group-focus-within）显示渐变信息浮层——日期/大小/文件名 + 删除入口。
// 浮层整体 pointer-events-none（点击穿透到 img 开灯箱），仅删除按钮与文件名（title 全名 tooltip）可交互。
// ref 的 complete 兜底：缓存图可能在 onLoad 挂载前已就绪。
function GalleryThumb({ item, onZoom, onDelete }: { item: GalleryItem; onZoom: () => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="group relative mb-3 break-inside-avoid overflow-hidden rounded-xl border border-border">
      {!loaded && <div aria-hidden className="aspect-[4/3] w-full animate-pulse bg-muted" />}
      <img
        src={item.url} alt={item.filename} loading="lazy"
        ref={(el) => { if (el?.complete) setLoaded(true) }}
        onLoad={() => setLoaded(true)}
        onClick={onZoom}
        className={cn("w-full cursor-zoom-in object-cover transition-opacity duration-300",
          loaded ? "h-auto opacity-100" : "absolute inset-0 size-full opacity-0")} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button type="button" onClick={onDelete} aria-label={t("life.gallery.deleteAria", { name: item.filename })}
          className="pointer-events-auto absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-black/50 text-white transition-colors hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none">
          <Trash2 className="size-4" />
        </button>
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-2.5 py-2 text-[11px] leading-4 text-white">
          <span className="tnum shrink-0">{item.mod_time.slice(0, 10)}</span>
          <span className="tnum shrink-0 opacity-80">{formatFileSize(item.size)}</span>
          <span className="pointer-events-auto truncate opacity-80" title={item.filename}>{item.filename}</span>
        </div>
      </div>
    </div>
  )
}

// 灯箱大图：onLoad 前 spinner 占位（key=url 由父级保证切图重挂载），加载后渐显；object-contain 保比例
function LightboxImage({ item }: { item: GalleryItem }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="relative">
      {!loaded && (
        <div aria-hidden className="flex h-64 w-full items-center justify-center rounded-lg bg-muted">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <img
        src={item.url} alt={item.filename}
        ref={(el) => { if (el?.complete) setLoaded(true) }}
        onLoad={() => setLoaded(true)}
        className={cn("max-h-[80vh] w-full rounded-lg object-contain transition-opacity duration-300",
          loaded ? "opacity-100" : "absolute inset-0 opacity-0")} />
    </div>
  )
}

// 灯箱：大图 object-contain、左右循环切换（个人相册张数少，循环比禁用顺手）、Esc/遮罩关闭（Dialog 默认）、←/→ 键盘切换
// 标题栏 = 文件名 + 日期/大小（信息密度，语言中性：yyyy-MM-dd + 文件大小单位三语通用）
function GalleryLightbox({ items, index, onIndexChange, onClose }: {
  items: GalleryItem[]; index: number; onIndexChange: (i: number) => void; onClose: () => void
}) {
  const { t } = useTranslation()
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
        <div className="flex items-baseline justify-between gap-3 pr-8">
          <DialogTitle className="truncate text-xs font-normal text-muted-foreground">{item.filename}</DialogTitle>
          <span className="tnum shrink-0 text-xs text-muted-foreground">{item.mod_time.slice(0, 10)} · {formatFileSize(item.size)}</span>
        </div>
        <LightboxImage key={item.url} item={item} />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tnum">{index + 1} / {total}</span>
          {total > 1 && <span>{t("life.gallery.lightboxHint")}</span>}
        </div>
        {total > 1 && (
          <>
            <Button variant="outline" size="icon" aria-label={t("life.gallery.prev")} onClick={() => step(-1)}
              className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-background/80 shadow">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon" aria-label={t("life.gallery.next")} onClick={() => step(1)}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-background/80 shadow">
              <ChevronRight className="size-4" />
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// 照片墙区块：masonry 瀑布流（CSS columns，保原图比例）+ 悬停信息浮层 + 灯箱；删除走 AlertDialog 二次确认（误触即删修复）
// 单用户本地部署：访问者即主人，上传/删除入口恒显示（原 isAdmin 门控已随去认证移除）
export function GallerySection() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [confirmFile, setConfirmFile] = useState<string | null>(null) // 待确认删除的文件名（null = 确认框关闭）
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ["gallery"], queryFn: api.getGallery })
  // 后端 Go nil slice 会序列化为 null（uploads 目录无图片时 items 为 null），此处兜底为空数组
  const items = data?.items ?? []

  const upload = useMutation({
    mutationFn: (f: File) => api.uploadImage(f),
    onSuccess: () => {
      toast.success(t("life.gallery.uploaded"))
      // ["dashboard"] 一并失效：首页「照片」统计卡与照片墙联动（后端该接口有 60s Redis 缓存，最多等 60s 生效）
      qc.invalidateQueries({ queryKey: ["gallery"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("life.gallery.uploadFailed")),
  })
  const del = useMutation({
    mutationFn: (filename: string) => api.deleteGalleryFile(filename),
    onSuccess: () => {
      toast.success(t("life.deleted"))
      qc.invalidateQueries({ queryKey: ["gallery"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("life.deleteFailed")),
  })

  return (
    <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
      <CardHeader>
        <CardTitle>{t("life.gallery.title")}</CardTitle>
        <CardAction>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = "" }} />
          <Button size="sm" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" /> {t("life.gallery.upload")}</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isError ? (
          <ErrorState title={t("life.gallery.loadFailed")} message={errorText(error)} onRetry={refetch} />
        ) : isPending ? (
          <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="mb-3 aspect-square w-full break-inside-avoid rounded-xl" />)}</div>
        ) : items.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{t("life.gallery.empty")}</p>
        ) : (
          <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">
            {items.map((item, i) => (
              <GalleryThumb key={item.filename} item={item}
                onZoom={() => setLightboxIndex(i)}
                onDelete={() => setConfirmFile(item.filename)} />
            ))}
          </div>
        )}
      </CardContent>

      {lightboxIndex !== null && (
        <GalleryLightbox items={items} index={lightboxIndex} onIndexChange={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}

      {/* 删除确认（AlertDialog 惯例同 HabitSection）：确认即触发 del mutation，Radix Action 点击自动关框 */}
      {confirmFile !== null && (
        <AlertDialog open onOpenChange={(o) => { if (!o) setConfirmFile(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("life.gallery.confirmDeleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("life.gallery.confirmDeleteDesc")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive/10 text-destructive hover:bg-destructive/20"
                onClick={() => del.mutate(confirmFile)}>
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  )
}
