import { NavLink } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { LayoutDashboard, TrendingUp, Languages, Sprout, PenLine } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

// labelKey 指向 i18n 键（nav.*），消费点用 t(labelKey) 取当前语言文案
export const NAV_ITEMS: { to: string; labelKey: string; icon: LucideIcon }[] = [
  { to: "/", labelKey: "nav.overview", icon: LayoutDashboard },
  { to: "/invest", labelKey: "nav.invest", icon: TrendingUp },
  { to: "/learn", labelKey: "nav.learn", icon: Languages },
  { to: "/life", labelKey: "nav.life", icon: Sprout },
  { to: "/blog", labelKey: "nav.blog", icon: PenLine },
]

export function Sidebar() {
  const { t } = useTranslation()
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="h-14 flex items-center px-5 font-semibold text-lg">{t("nav.brand")}</div>
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map(({ to, labelKey, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"}
            className={({ isActive }) => cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}>
            <Icon className="size-4" /> {t(labelKey)}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
