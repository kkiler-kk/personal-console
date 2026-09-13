import { NavLink } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

// 管理后台横向导航条：挂在全部 admin 页面顶部。
// /admin 用 end 精确匹配（否则会在所有 /admin/* 子路由恒为 active）；
// /admin/posts 前缀匹配可覆盖 new/:id/edit，符合预期高亮。
// label 走 i18n 键（admin.nav.*），键在渲染期由 useTranslation 求值以随语言切换即时更新。
const ITEMS: { to: string; labelKey: string; end?: boolean }[] = [
  { to: "/admin", labelKey: "admin.nav.overview", end: true },
  { to: "/admin/posts", labelKey: "admin.nav.posts" },
  { to: "/admin/categories", labelKey: "admin.nav.categories" },
  { to: "/admin/sessions", labelKey: "admin.nav.sessions" },
  { to: "/admin/habits", labelKey: "admin.nav.habits" },
  { to: "/admin/profile", labelKey: "admin.nav.profile" },
]

export function AdminNav() {
  const { t } = useTranslation()
  return (
    <nav aria-label={t("admin.nav.aria")} className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1.5 shadow-[0_1px_3px_rgba(0,0,0,.06)]">
      {ITEMS.map(({ to, labelKey, end }) => (
        <NavLink key={to} to={to} end={end}
          className={({ isActive }) => cn(
            "rounded-lg px-3 py-1.5 text-sm transition-colors",
            isActive ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}>
          {t(labelKey)}
        </NavLink>
      ))}
    </nav>
  )
}
