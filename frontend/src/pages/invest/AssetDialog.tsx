import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { AssetType } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

type Preset = "us" | "ashare" | "gold" | "fundcn" | "manual"

const GOLD_SYMBOL = "GOLD_CNY_G"
// A 股代码形态轻校验：仅 toast 提示，不阻塞提交（后端与 Yahoo 才是权威）
const ASHARE_SYMBOL_RE = /^\d{6}\.(SS|SZ)$/i
// 中国基金代码形态轻校验：仅 toast 提示，不阻塞提交（后端 fund_cn 分支才是权威）
const FUND_CN_SYMBOL_RE = /^\d{6}$/

// 预设顺序（label/hint 走 i18n：invest.preset.{value}.label / .hint）
const PRESET_ORDER: Preset[] = ["us", "ashare", "gold", "fundcn", "manual"]
// 类型 Select 可选项（label 复用类型 Badge 键 invest.type.{value}）
const US_TYPE_VALUES: AssetType[] = ["stock", "etf"]
const ALL_TYPE_VALUES: AssetType[] = ["stock", "etf", "metal", "fund", "other"]

export function AssetDialog({ onCreated }: { onCreated?: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<Preset>("us")
  const [symbol, setSymbol] = useState("")
  const [name, setName] = useState("")
  const [type, setType] = useState<AssetType>("stock")
  const [currency, setCurrency] = useState<"USD" | "CNY">("USD")

  // gold 预设默认资产名（随 UI 语言）：与 gold 预设 label 同源，用作自动填充 + 哨兵清除 + create 兜底
  const goldName = t("invest.preset.gold.label")

  const reset = () => {
    setPreset("us"); setSymbol(""); setName(""); setType("stock"); setCurrency("USD")
  }

  const selectPreset = (p: Preset) => {
    setPreset(p)
    if (p === "gold") {
      setSymbol(GOLD_SYMBOL); setType("metal"); setCurrency("CNY")
      setName((n) => n.trim() === "" ? goldName : n)
    } else {
      // 清除 gold 预设自动填充的残留值（仅当值恰为默认填充，不吞用户手动输入）。
      // fundcn 自身无自动填充值，切离时无需额外清理，type/currency 由下方目标分支重置
      //（manual 分支刻意保留用户已选 type/currency，与 gold→manual 既有行为一致）。
      setSymbol((s) => s === GOLD_SYMBOL ? "" : s)
      setName((n) => n === goldName ? "" : n)
      if (p === "us") {
        setType("stock"); setCurrency("USD")
      } else if (p === "ashare") {
        setType("stock"); setCurrency("CNY")
      } else if (p === "fundcn") {
        setType("fund"); setCurrency("CNY")
      }
    }
  }

  const create = useMutation({
    mutationFn: () => {
      if (preset === "gold") {
        return api.createAsset({
          symbol: GOLD_SYMBOL, name: name.trim() || goldName,
          type: "metal", price_source: "computed_gold_cny", currency: "CNY",
        })
      }
      if (preset === "fundcn") {
        // type/price_source/currency 硬编码，与后端 fund_cn 强制分支契约一致（symbol 为纯 6 位数字）
        return api.createAsset({
          symbol: symbol.trim().toUpperCase(), name: name.trim(),
          type: "fund", price_source: "fund_cn", currency: "CNY",
        })
      }
      if (preset === "ashare") {
        return api.createAsset({
          symbol: symbol.trim().toUpperCase(), name: name.trim(),
          type, price_source: "yahoo", currency: "CNY",
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
      toast.success(preset === "manual" ? t("invest.toast.createdManual") : t("invest.toast.assetCreated"))
      setOpen(false); reset(); onCreated?.()
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("invest.toast.createFailed")),
  })

  const symbolOk = preset === "gold" || symbol.trim().length > 0
  const nameOk = preset === "gold" || name.trim().length > 0
  const canSubmit = symbolOk && nameOk && !create.isPending

  // A 股 / 中国基金代码提交前轻校验：形态不符仅 toast 提示，不 return（后端仍是权威）
  const handleSubmit = () => {
    if (preset === "ashare" && !ASHARE_SYMBOL_RE.test(symbol.trim())) {
      toast.warning(t("invest.toast.ashareHint"))
    }
    if (preset === "fundcn" && !FUND_CN_SYMBOL_RE.test(symbol.trim())) {
      toast.warning(t("invest.toast.fundcnHint"))
    }
    create.mutate()
  }

  const symbolPlaceholder =
    preset === "us" ? t("invest.asset.symbolPlaceholderUs")
    : preset === "ashare" ? t("invest.asset.symbolPlaceholderAshare")
    : preset === "fundcn" ? t("invest.asset.symbolPlaceholderFundcn")
    : t("invest.asset.symbolPlaceholderManual")

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Plus className="size-4" /> {t("invest.asset.add")}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("invest.asset.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("invest.asset.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-2">
            {PRESET_ORDER.map((v) => (
              <label key={v}
                className={`cursor-pointer rounded-lg border p-2.5 text-center transition-colors ${preset === v ? "border-primary bg-accent" : "border-border hover:bg-muted/50"}`}>
                <input type="radio" name="asset-preset" value={v} checked={preset === v}
                  onChange={() => selectPreset(v)} className="sr-only" />
                <span className="block text-sm font-medium">{t(`invest.preset.${v}.label`)}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground leading-tight">{t(`invest.preset.${v}.hint`)}</span>
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asset-symbol">{t("invest.asset.symbol")}</Label>
            {preset === "gold" ? (
              <Input id="asset-symbol" value={GOLD_SYMBOL} readOnly className="bg-muted text-muted-foreground" />
            ) : (
              <Input id="asset-symbol" placeholder={symbolPlaceholder}
                value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asset-name">{t("invest.asset.name")}</Label>
            <Input id="asset-name" placeholder={preset === "gold" ? goldName : t("invest.asset.namePlaceholder")}
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("invest.asset.type")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as AssetType)} disabled={preset === "gold" || preset === "fundcn"}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(preset === "us" || preset === "ashare" ? US_TYPE_VALUES : ALL_TYPE_VALUES).map((opt) => (
                    <SelectItem key={opt} value={opt}>{t(`invest.type.${opt}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("invest.asset.currency")}</Label>
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
              {t("invest.asset.manualNote")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { setOpen(false); reset() }}>{t("common.cancel")}</Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            {create.isPending ? t("common.creating") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
