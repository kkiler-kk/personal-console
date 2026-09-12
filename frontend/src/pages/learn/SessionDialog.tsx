import { useState, type ReactNode } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { format } from "date-fns"
import { Plus } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { ActivityType, Lang } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ACTIVITY_LABELS, LANGS, LANG_META } from "./constants"

const MINUTE_PRESETS = [15, 30, 60, 90]
const ACTIVITY_OPTIONS = Object.entries(ACTIVITY_LABELS) as [ActivityType, string][]

export function SessionDialog({ onSaved, trigger }: { onSaved?: () => void; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [lang, setLang] = useState<Lang>("en")
  const [activity, setActivity] = useState<ActivityType>("vocab")
  const [minutes, setMinutes] = useState("")
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"))
  const [note, setNote] = useState("")

  // 打开时重置表单（AssetDialog 同款：在 onOpenChange 中重置，不走 effect）
  const reset = () => {
    setLang("en"); setActivity("vocab"); setMinutes("")
    setDate(format(new Date(), "yyyy-MM-dd")); setNote("")
  }

  const create = useMutation({
    mutationFn: () => api.createLearnSession({
      lang,
      activity,
      minutes: Number(minutes),
      date,
      note: note.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success("已记录学习")
      setOpen(false); onSaved?.()
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "提交失败"),
  })

  const m = Number(minutes)
  // 后端 minutes 绑定为 int（gte=0）：小数会被 400，前端先行拦截
  const canSubmit = minutes.trim() !== "" && Number.isInteger(m) && m >= 0 && date !== "" && !create.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset() }}>
      <DialogTrigger asChild>
        {trigger ?? <Button><Plus className="size-4" /> 记录学习</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>记录学习</DialogTitle>
          <DialogDescription>记一笔学习时长，连续天数与统计将自动更新</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>语言</Label>
              <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGS.map((l) => (
                    <SelectItem key={l} value={l}>{LANG_META[l].flag} {LANG_META[l].name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select value={activity} onValueChange={(v) => setActivity(v as ActivityType)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="session-minutes">分钟</Label>
            <Input id="session-minutes" type="number" min="0" step="1" inputMode="numeric"
              value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="如 30" />
            <div className="flex gap-1.5 pt-1">
              {MINUTE_PRESETS.map((p) => (
                <Button key={p} type="button" size="xs" variant={minutes === String(p) ? "secondary" : "outline"}
                  className="tnum" onClick={() => setMinutes(String(p))}>
                  {p} 分钟
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="session-date">日期</Label>
            <Input id="session-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="session-note">备注</Label>
            <Input id="session-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选，如「精听 BBC 6 Minute」" maxLength={200} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
          <Button disabled={!canSubmit} onClick={() => create.mutate()}>
            {create.isPending ? "提交中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
