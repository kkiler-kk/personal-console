import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

// errorText 统一提取查询错误文案（仓库惯例：instanceof Error 三元的收敛版）
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "未知错误"
}

// ErrorState 全站统一错误态（task 4.5）：居中 AlertCircle 图标 + 文案 + 可选重试按钮。
// 用于替换 isError 分支的永久骨架屏 / 误导性空态（如「还没有评论」），onRetry 传 refetch。
export function ErrorState({ title = "加载失败", message, onRetry }: {
  title?: string
  message?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
      <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      {message && <p className="max-w-sm text-xs break-all text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-1.5" onClick={onRetry}>
          <RefreshCw className="size-3.5" /> 重试
        </Button>
      )}
    </div>
  )
}
