import { useEffect, useState, type ReactNode } from "react"
import { useMutation } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation()
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
      toast.success(t("invest.toast.tradeCreated"))
      setOpen(false); onSaved?.()
    },
    // 超卖等 400 直接透出后端文案（如「卖出数量超过持仓」），非 ApiError 才走本地壳文案
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("invest.toast.submitFailed")),
  })

  const qty = Number(quantity)
  // price > 0 对齐后端 binding gt=0（task 4.5）：前端先拦，避免裸 binding 英文错误 toast
  const canSubmit =
    assetId !== "" && quantity.trim() !== "" && Number.isFinite(qty) && qty > 0 &&
    price.trim() !== "" && Number.isFinite(Number(price)) && Number(price) > 0 &&
    tradedAt !== "" && !create.isPending

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button><Plus className="size-4" /> {t("invest.trade.record")}</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("invest.trade.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("invest.trade.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>{t("invest.trade.asset")}</Label>
            <Select value={assetId} onValueChange={(v) => {
              setAssetId(v)
              const a = assets.find((x) => String(x.id) === v)
              setPrice(a?.current_price != null ? String(a.current_price) : "")
            }}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("invest.trade.selectAsset")} /></SelectTrigger>
              <SelectContent>
                {assets.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}（{a.symbol}）</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("invest.trade.side")}</Label>
              <Select value={side} onValueChange={(v) => setSide(v as "buy" | "sell")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">{t("invest.side.buy")}</SelectItem>
                  <SelectItem value="sell">{t("invest.side.sell")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trade-date">{t("invest.trade.date")}</Label>
              <Input id="trade-date" type="date" value={tradedAt} onChange={(e) => setTradedAt(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trade-qty">{t("invest.trade.quantity")}</Label>
              <Input id="trade-qty" type="number" min="0" step="any" inputMode="decimal"
                value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trade-price">{t("invest.trade.price", { cur })}</Label>
              <Input id="trade-price" type="number" min="0" step="any" inputMode="decimal"
                value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trade-fee">{t("invest.trade.fee", { cur })}</Label>
              <Input id="trade-fee" type="number" min="0" step="any" inputMode="decimal"
                value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trade-note">{t("invest.trade.note")}</Label>
            <Input id="trade-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("common.optional")} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button disabled={!canSubmit} onClick={() => create.mutate()}>
            {create.isPending ? t("common.submitting") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
