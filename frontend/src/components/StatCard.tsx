import { Link } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export function StatCard({ title, value, sub, icon: Icon, href, action }: {
  title: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; href?: string
  /** 右上角小操作位（如图标按钮），渲染在 icon 左侧、可点区域高于整卡链接 */
  action?: ReactNode
}) {
  const inner = (
    <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
      <CardContent className="p-5 flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold tnum mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1 tnum">{sub}</p>}
        </div>
        <div className="flex items-start gap-1.5">
          {action && <div className="relative z-10">{action}</div>}
          <div className="size-9 rounded-lg bg-accent flex items-center justify-center">
            <Icon className="size-4.5 text-accent-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
  if (!href) return inner
  if (action) {
    // stretched-link：<a> 覆盖整卡负责导航，action 在文档流内以 z-10 浮于其上，
    // 避免 <a> 内嵌 <button> 的非法交互嵌套（键盘/读屏各自可达）
    return (
      <div className="relative transition-opacity hover:opacity-90">
        {inner}
        <Link to={href} aria-label={title} className="absolute inset-0 z-0 rounded-xl" />
      </div>
    )
  }
  return <Link to={href} className="block hover:opacity-90 transition-opacity">{inner}</Link>
}
