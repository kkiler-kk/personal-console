import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { Pencil } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { Lang, LanguageProfile } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { LANG_META } from "./constants"

export function ProfileDialog({ lang, initial, onSaved }: {
  lang: Lang; initial?: LanguageProfile | null; onSaved?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [level, setLevel] = useState("")
  const [goal, setGoal] = useState("")
  const [note, setNote] = useState("")

  // 打开时用现有档案回填（AssetDialog 同款：在 onOpenChange 中重置，不走 effect）
  const fill = () => {
    setLevel(initial?.level ?? ""); setGoal(initial?.goal ?? ""); setNote(initial?.note ?? "")
  }

  const save = useMutation({
    mutationFn: () => api.updateLearnProfile(lang, {
      level: level.trim(), goal: goal.trim(), note: note.trim(),
    }),
    onSuccess: () => {
      toast.success("已保存档案")
      setOpen(false); onSaved?.()
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "保存失败"),
  })

  // 后端 binding：level required max=50；goal/note max=500
  const canSubmit =
    level.trim() !== "" && level.trim().length <= 50 &&
    goal.trim().length <= 500 && note.trim().length <= 500 && !save.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) fill() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil className="size-3.5" /> 编辑</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{LANG_META[lang].flag} {LANG_META[lang].name}学习档案</DialogTitle>
          <DialogDescription>记录当前水平、目标与备注，随时可改</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="profile-level">水平（必填）</Label>
            <Input id="profile-level" value={level} onChange={(e) => setLevel(e.target.value)}
              placeholder="如 B1 / 中级 / CET-6" maxLength={50} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-goal">目标</Label>
            <Input id="profile-goal" value={goal} onChange={(e) => setGoal(e.target.value)}
              placeholder="如 年底能无字幕看懂西语剧集" maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-note">备注</Label>
            <Textarea id="profile-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="可选：教材、方法、心得…" maxLength={500} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
          <Button disabled={!canSubmit} onClick={() => save.mutate()}>
            {save.isPending ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
