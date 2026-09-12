import { Link } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export function StatCard({ title, value, sub, icon: Icon, href }: {
  title: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; href?: string
}) {
  const inner = (
    <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
      <CardContent className="p-5 flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold tnum mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1 tnum">{sub}</p>}
        </div>
        <div className="size-9 rounded-lg bg-accent flex items-center justify-center">
          <Icon className="size-4.5 text-accent-foreground" />
        </div>
      </CardContent>
    </Card>
  )
  return href ? <Link to={href} className="block hover:opacity-90 transition-opacity">{inner}</Link> : inner
}
