import type { LucideIcon } from "lucide-react"

export function PagePlaceholder({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="size-14 rounded-2xl bg-accent flex items-center justify-center mb-4">
        <Icon className="size-7 text-accent-foreground" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
    </div>
  )
}
