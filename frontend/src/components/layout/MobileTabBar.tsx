import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"
import { NAV_ITEMS } from "./Sidebar"

export function MobileTabBar() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card flex">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === "/"}
          className={({ isActive }) => cn(
            "flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px]",
            isActive ? "text-primary font-medium" : "text-muted-foreground",
          )}>
          <Icon className="size-5" /> {label}
        </NavLink>
      ))}
    </nav>
  )
}
