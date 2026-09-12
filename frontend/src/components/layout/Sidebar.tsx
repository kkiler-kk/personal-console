import { NavLink } from "react-router-dom"
import { LayoutDashboard, TrendingUp, Languages, Dumbbell, Sprout, PenLine } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

export const NAV_ITEMS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "总览", icon: LayoutDashboard },
  { to: "/invest", label: "投资", icon: TrendingUp },
  { to: "/learn", label: "学习", icon: Languages },
  { to: "/fitness", label: "健身", icon: Dumbbell },
  { to: "/life", label: "生活", icon: Sprout },
  { to: "/blog", label: "博客", icon: PenLine },
]

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="h-14 flex items-center px-5 font-semibold text-lg">KK 控制台</div>
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"}
            className={({ isActive }) => cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}>
            <Icon className="size-4" /> {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
