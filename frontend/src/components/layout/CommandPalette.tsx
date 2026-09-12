import { useNavigate } from "react-router-dom"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { NAV_ITEMS } from "./Sidebar"

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const go = (to: string) => { onOpenChange(false); navigate(to) }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="跳转到…" />
      <CommandList>
        <CommandEmpty>无匹配结果</CommandEmpty>
        <CommandGroup heading="导航">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <CommandItem key={to} onSelect={() => go(to)}><Icon className="size-4" /> {label}</CommandItem>
          ))}
          <CommandItem onSelect={() => go("/blog/archive")}>博客归档</CommandItem>
          <CommandItem onSelect={() => go("/admin/posts")}>管理后台</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
