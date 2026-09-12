import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { AssetType } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

type Preset = "us" | "gold" | "manual"

const GOLD_SYMBOL = "GOLD_CNY_G"

const PRESETS: { value: Preset; label: string; hint: string }[] = [
  { value: "us", label: "美股 / ETF", hint: "Yahoo 自动报价 · USD" },
  { value: "gold", label: "银行积存金", hint: "系统计算金价 · CNY" },
  { value: "manual", label: "手动资产", hint: "手动维护现价" },
]

const US_TYPES: { value: AssetType; label: string }[] = [
  { value: "stock", label: "股票" }, { value: "etf", label: "ETF" },
]
const ALL_TYPES: { value: AssetType; label: string }[] = [
  { value: "stock", label: "股票" }, { value: "etf", label: "ETF" },
  { value: "metal", label: "黄金" }, { value: "other", label: "其他" },
]

export function AssetDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<Preset>("us")
  const [symbol, setSymbol] = useState("")
  const [name, setName] = useState("")
  const [type, setType] = useState<AssetType>("stock")
  const [currency, setCurrency] = useState<"USD" | "CNY">("USD")

  const reset = () => {
    setPreset("us"); setSymbol(""); setName(""); setType("stock"); setCurrency("USD")
  }

  const selectPreset = (p: Preset) => {
    setPreset(p)
    if (p === "gold") {
      setSymbol(GOLD_SYMBOL); setType("metal"); setCurrency("CNY")
      setName((n) => n.trim() === "" ? "银行积存金" : n)
    } else if (p === "us") {
      setType("stock"); setCurrency("USD")
    }
  }

  const create = useMutation({
    mutationFn: () => {
      if (preset === "gold") {
        return api.createAsset({
          symbol: GOLD_SYMBOL, name: name.trim() || "银行积存金",
          type: "metal", price_source: "computed_gold_cny", currency: "CNY",
        })
      }
      if (preset === "us") {
        return api.createAsset({
          symbol: symbol.trim().toUpperCase(), name: name.trim(),
          type, price_source: "yahoo", currency: "USD",
        })
      }
      return api.createAsset({
        symbol: symbol.trim().toUpperCase(), name: name.trim(),
        type, price_source: "manual", currency,
      })
    },
    onSuccess: () => {
      toast.success(preset === "manual" ? "已创建，请在持仓表点「改价」录入现价" : "已添加资产")
      setOpen(false); reset(); onCreated?.()
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "创建失败"),
  })

  const symbolOk = preset === "gold" || symbol.trim().length > 0
  const nameOk = preset === "gold" || name.trim().length > 0
  const canSubmit = symbolOk && nameOk && !create.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Plus className="size-4" /> 添加资产</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加资产</DialogTitle>
          <DialogDescription>选择资产类型，价格来源将自动配置</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => (
              <label key={p.value}
                className={`cursor-pointer rounded-lg border p-2.5 text-center transition-colors ${preset === p.value ? "border-primary bg-accent" : "border-border hover:bg-muted/50"}`}>
                <input type="radio" name="asset-preset" value={p.value} checked={preset === p.value}
                  onChange={() => selectPreset(p.value)} className="sr-only" />
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground leading-tight">{p.hint}</span>
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asset-symbol">代码</Label>
            {preset === "gold" ? (
              <Input id="asset-symbol" value={GOLD_SYMBOL} readOnly className="bg-muted text-muted-foreground" />
            ) : (
              <Input id="asset-symbol" placeholder={preset === "us" ? "如 AAPL、VOO" : "自定义代码"}
                value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asset-name">名称</Label>
            <Input id="asset-name" placeholder={preset === "gold" ? "银行积存金" : "如 苹果、标普500ETF"}
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select value={type} onValueChange={(v) => setType(v as AssetType)} disabled={preset === "gold"}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(preset === "us" ? US_TYPES : ALL_TYPES).map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>币种</Label>
              {preset === "manual" ? (
                <Select value={currency} onValueChange={(v) => setCurrency(v as "USD" | "CNY")}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="CNY">CNY</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input value={preset === "us" ? "USD" : "CNY"} readOnly className="bg-muted text-muted-foreground" />
              )}
            </div>
          </div>

          {preset === "manual" && (
            <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2">
              手动资产不会自动取价，创建后请在持仓表点「改价」录入现价。
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { setOpen(false); reset() }}>取消</Button>
          <Button disabled={!canSubmit} onClick={() => create.mutate()}>
            {create.isPending ? "创建中…" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
