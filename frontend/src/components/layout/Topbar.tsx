import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Globe, Moon, Search, Sun, User, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/context/AuthContext"
import { useTheme } from "@/context/ThemeContext"
import { useUiLanguage, type UiLang } from "@/i18n"
import { CommandPalette } from "./CommandPalette"

// 语言名为各自语言的内名（endonym），不随界面语言翻译——i18n 切换器惯例
const LANG_OPTIONS: { value: UiLang; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
]

export function Topbar() {
  const { user } = useAuth()
  const { theme, toggle } = useTheme()
  const { t } = useTranslation()
  const { lang, setLang } = useUiLanguage()
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
        <Search className="size-4" /> {t("common.search")} <kbd className="text-xs">⌘K</kbd>
      </Button>
      <div className="flex-1" />
      <Button variant="ghost" size="icon" onClick={toggle} aria-label={t("topbar.toggleTheme")}>
        {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("topbar.language")}>
            <Globe className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as UiLang)}>
            {LANG_OPTIONS.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label={t("topbar.userMenu")}>
            {user?.avatar ? <img src={user.avatar} className="size-7 rounded-full object-cover" alt="" /> : <User className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate("/admin")}><Settings2 className="size-4" /> {t("topbar.admin")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </header>
  )
}
