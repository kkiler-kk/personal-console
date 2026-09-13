import { AlertCircle, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

// errorText 统一提取查询错误文案（仓库惯例：instanceof Error 三元的收敛版）
// 注：fallback "未知错误" 为硬编码——本函数非 hook 无法直接 t()，签名改造涉及全站消费点，
// 留待各模块任务（Task 2-4）接线 t 时处理，Task 5 硬编码审计兜底。
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "未知错误"
}

// ErrorState 全站统一错误态（task 4.5）：居中 AlertCircle 图标 + 文案 + 可选重试按钮。
// 用于替换 isError 分支的永久骨架屏 / 误导性空态（如「还没有评论」），onRetry 传 refetch。
// title 缺省走 i18n（errors.loadFailed）；message 由调用方传入（通常为 errorText(e)，后端消息不译）。
export function ErrorState({ title, message, onRetry }: {
  title?: string
  message?: string
  onRetry?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
      <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
      <p className="text-sm font-medium">{title ?? t("errors.loadFailed")}</p>
      {message && <p className="max-w-sm text-xs break-all text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-1.5" onClick={onRetry}>
          <RefreshCw className="size-3.5" /> {t("common.retry")}
        </Button>
      )}
    </div>
  )
}
