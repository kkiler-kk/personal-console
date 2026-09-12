import { useEffect, useState, type ReactNode } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { format } from "date-fns"
import { Plus } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { Asset } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export function TradeDialog({ assets, onSaved, initialAssetId, trigger }: {
  assets: Asset[]; onSaved?: () => void; initialAssetId?: number; trigger?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [assetId, setAssetId] = useState("")
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [quantity, setQuantity] = useState("")
  const [price, setPrice] = useState("")
  const [fee, setFee] = useState("0")
  const [tradedAt, setTradedAt] = useState(() => format(new Date(), "yyyy-MM-dd"))
  const [note, setNote] = useState("")

  // 打开时重置表单，并预选资产 + 用其现价预填价格
  useEffect(() => {
    if (!open) return
    const aid = initialAssetId != null ? String(initialAssetId) : ""
    setAssetId(aid)
    const a = assets.find((x) => String(x.id) === aid)
    setPrice(a?.current_price != null ? String(a.current_price) : "")
    setSide("buy"); setQuantity(""); setFee("0"); setNote("")
    setTradedAt(format(new Date(), "yyyy-MM-dd"))
    // 仅在打开/预选资产变化时重置；assets 故意不入依赖以免报价刷新清空已填表单
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialAssetId])

  const selected = assets.find((a) => String(a.id) === assetId)
  const cur = selected?.currency === "CNY" ? "¥" : "$"

  const create = useMutation({
    mutationFn: () => api.createTrade({
      asset_id: Number(assetId),
      side,
      quantity: Number(quantity),
      price: Number(price),
      fee: Number(fee) || 0,
      traded_at: tradedAt,
      note: note.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success("已记录交易")
      setOpen(false); onSaved?.()
    },
    // 超卖等 400 直接透出后端文案（如「卖出数量超过持仓」）
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "提交失败"),
  })

  const qty = Number(quantity)
  const canSubmit =
    assetId !== "" && quantity.trim() !== "" && Number.isFinite(qty) && qty > 0 &&
    price.trim() !== "" && Number.isFinite(Number(price)) && Number(price) >= 0 &&
    tradedAt !== "" && !create.isPending

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button><Plus className="size-4" /> 录交易</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>录入交易</DialogTitle>
          <DialogDescription>买入或卖出一笔资产，价格默认取现价</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>资产</Label>
            <Select value={assetId} onValueChange={(v) => {
              setAssetId(v)
              const a = assets.find((x) => String(x.id) === v)
              setPrice(a?.current_price != null ? String(a.current_price) : "")
            }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="选择资产" /></SelectTrigger>
              <SelectContent>
                {assets.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}（{a.symbol}）</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>方向</Label>
              <Select value={side} onValueChange={(v) => setSide(v as "buy" | "sell")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">买入</SelectItem>
                  <SelectItem value="sell">卖出</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trade-date">日期</Label>
              <Input id="trade-date" type="date" value={tradedAt} onChange={(e) => setTradedAt(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trade-qty">数量</Label>
              <Input id="trade-qty" type="number" min="0" step="any" inputMode="decimal"
                value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trade-price">价格（{cur}）</Label>
              <Input id="trade-price" type="number" min="0" step="any" inputMode="decimal"
                value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trade-fee">费用（{cur}）</Label>
              <Input id="trade-fee" type="number" min="0" step="any" inputMode="decimal"
                value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trade-note">备注</Label>
            <Input id="trade-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选" />
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
