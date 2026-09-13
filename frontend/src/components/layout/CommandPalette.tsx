import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { CheckSquare, FileText, Folder, Tag, TrendingUp } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { api } from "@/lib/api"
import { NAV_ITEMS } from "./Sidebar"

// 导航组全集：NAV_ITEMS + 固定两项（无图标保持原样）；q 非空时按 label 本地 includes 过滤
const NAV_ALL: { to: string; label: string; icon: LucideIcon | null }[] = [
  ...NAV_ITEMS,
  { to: "/blog/archive", label: "博客归档", icon: null },
  { to: "/admin/posts", label: "管理后台", icon: null },
]

const DEBOUNCE_MS = 250
// 后端 q 限 1..50 rune，越界必 400：前端同阈值门控，不发起注定失败的请求（brief 可选项，选择门控）
const MAX_Q = 50

// summary 副标题截 40 字符（JS length 按 UTF-16 code unit 计，CJK 常用字为 1，展示截断足够）
const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s)

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  // ⌘K 快速关/开会打断 radix 退出动画，DialogContent 不卸载（Presence 保留实例）：
  // open 上升沿递增 session，用 key 强制重挂 PaletteBody，保证每次打开输入框与查询状态归零
  // （渲染期派生 setState 是 React 官方 adjust-state-when-props-change 模式，条件守卫防循环）
  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSession((s) => s + 1)
  }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <PaletteBody key={session} onOpenChange={onOpenChange} />
    </CommandDialog>
  )
}

// 面板主体独立成组件：DialogContent 关闭即卸载（radix 默认无 forceMount），
// q/debounce/query 状态随之自然重置——无需手动清空，也保证关闭期间零请求
function PaletteBody({ onOpenChange }: { onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const go = (to: string) => { onOpenChange(false); navigate(to) }

  const [q, setQ] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  // debounce 250ms：cleanup 清掉上一个 timer，快速输入只在停顿后发一次请求
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [q])

  const trimmed = debouncedQ.trim()
  const searchActive = trimmed.length >= 1 && trimmed.length <= MAX_Q
  const { data, isFetching, isError } = useQuery({
    queryKey: ["search", debouncedQ],
    queryFn: () => api.search(trimmed),
    enabled: searchActive,
  })

  // 导航组本地过滤用即时 q（不走 debounce）：纯客户端操作，反馈即时
  const navQ = q.trim().toLowerCase()
  const navMatches = useMemo(
    () => (navQ ? NAV_ALL.filter((n) => n.label.toLowerCase().includes(navQ)) : NAV_ALL),
    [navQ],
  )

  return (
    // ui/command 的 CommandDialog 不含 Command root，需自行包裹；
    // shouldFilter=false 关闭 cmdk 内置模糊过滤——可见性完全由服务端结果 + 导航本地过滤决定
    <Command shouldFilter={false}>
      <CommandInput placeholder="搜索或跳转…" onValueChange={setQ} />
      <CommandList>
        {/* 搜索失败：面板内一行 text-destructive；同时隐藏 CommandEmpty 避免双重提示 */}
        {searchActive && isError && (
          <div className="px-2 py-1.5 text-sm text-destructive">搜索失败</div>
        )}
        <CommandEmpty className={searchActive && isError ? "hidden" : undefined}>
          {searchActive && isFetching ? "搜索中…" : "无匹配结果"}
        </CommandEmpty>

        {navMatches.length > 0 && (
          <CommandGroup heading="导航">
            {navMatches.map(({ to, label, icon: Icon }) => (
              <CommandItem key={to} value={`nav-${to}`} onSelect={() => go(to)}>
                {Icon ? <Icon className="size-4" /> : null} {label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {data && data.posts.length > 0 && (
          <CommandGroup heading="文章">
            {data.posts.map((p) => (
              <CommandItem key={p.id} value={`post-${p.id}`} onSelect={() => go(`/blog/${p.slug}`)}>
                <FileText className="size-4" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{p.title}</span>
                  {p.summary && (
                    <span className="truncate text-xs text-muted-foreground">{truncate(p.summary, 40)}</span>
                  )}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {data && data.assets.length > 0 && (
          <CommandGroup heading="资产">
            {data.assets.map((a) => (
              <CommandItem key={a.id} value={`asset-${a.id}`} onSelect={() => go("/invest")}>
                <TrendingUp className="size-4" /> {a.symbol}
                <span className="truncate text-xs text-muted-foreground">{a.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {data && data.habits.length > 0 && (
          <CommandGroup heading="习惯">
            {data.habits.map((h) => (
              <CommandItem key={h.id} value={`habit-${h.id}`} onSelect={() => go("/life")}>
                {/* habit.icon 为 emoji 字符串（同 HabitSection 惯例），无图标回退 CheckSquare */}
                {h.icon ? <span className="w-4 text-center leading-none">{h.icon}</span> : <CheckSquare className="size-4" />}
                {h.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {data && data.categories.length > 0 && (
          <CommandGroup heading="分类">
            {data.categories.map((c) => (
              <CommandItem key={c.id} value={`category-${c.id}`} onSelect={() => go(`/blog/category/${c.slug}`)}>
                <Folder className="size-4" /> {c.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {data && data.tags.length > 0 && (
          <CommandGroup heading="标签">
            {data.tags.map((t) => (
              <CommandItem key={t.id} value={`tag-${t.id}`} onSelect={() => go(`/blog/tag/${t.name}`)}>
                <Tag className="size-4" /> {t.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )
}
