import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"

// 管理后台横向导航条：挂在全部 admin 页面顶部。
// /admin 用 end 精确匹配（否则会在所有 /admin/* 子路由恒为 active）；
// /admin/posts 前缀匹配可覆盖 new/:id/edit，符合预期高亮。
const ITEMS: { to: string; label: string; end?: boolean }[] = [
  { to: "/admin", label: "总览", end: true },
  { to: "/admin/posts", label: "文章" },
  { to: "/admin/categories", label: "分类" },
  { to: "/admin/sessions", label: "学习记录" },
  { to: "/admin/habits", label: "习惯" },
  { to: "/admin/profile", label: "资料" },
]

export function AdminNav() {
  return (
    <nav aria-label="管理后台导航" className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1.5 shadow-[0_1px_3px_rgba(0,0,0,.06)]">
      {ITEMS.map(({ to, label, end }) => (
        <NavLink key={to} to={to} end={end}
          className={({ isActive }) => cn(
            "rounded-lg px-3 py-1.5 text-sm transition-colors",
            isActive ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
