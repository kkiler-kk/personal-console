import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Moon, Search, Sun, User, LogOut, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useAuth } from "@/context/AuthContext"
import { useTheme } from "@/context/ThemeContext"
import { CommandPalette } from "./CommandPalette"

export function Topbar() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <header className="h-14 shrink-0 border-b border-border bg-card flex items-center gap-2 px-4">
      <Button variant="outline" size="sm" className="gap-2 text-muted-foreground" onClick={() => setOpen(true)}>
        <Search className="size-4" /> 搜索 <kbd className="text-xs">⌘K</kbd>
      </Button>
      <div className="flex-1" />
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="切换主题">
        {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="用户菜单">
            {user?.avatar ? <img src={user.avatar} className="size-7 rounded-full object-cover" alt="" /> : <User className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate("/admin")}><Settings2 className="size-4" /> 管理后台</DropdownMenuItem>
          <DropdownMenuItem onClick={() => { logout(); navigate("/login") }}><LogOut className="size-4" /> 退出登录</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </header>
  )
}
