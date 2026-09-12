import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Wallet, TrendingUp, Activity, Layers, Plus, Pencil, Trash2 } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { Asset, AssetType } from "@/lib/types"
import { formatMoney, formatDate, formatDateTime } from "@/lib/format"
import { StatCard } from "@/components/StatCard"
import { ValueChart } from "@/components/charts/ValueChart"
import { AssetDialog } from "@/pages/invest/AssetDialog"
import { TradeDialog } from "@/pages/invest/TradeDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

const TYPE_LABEL: Record<AssetType, string> = { stock: "股票", etf: "ETF", metal: "黄金", other: "其他" }

// 涨绿跌红（仓库约定）：up #16a34a / down #dc2626
const pnlCls = (v: number | null) => v == null ? "" : v >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"
const signedMoney = (v: number, cur: "USD" | "CNY") => `${v >= 0 ? "+" : "−"}${formatMoney(Math.abs(v), cur)}`
const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`
const fmtQty = (n: number) => n.toLocaleString("zh-CN", { maximumFractionDigits: 4 })

// stale 报价的 price_updated_at 可能是 Go 零值时间（0001-01-01…），年份 <2000 视为未知
function priceTimeLabel(iso: string | null): string {
  if (!iso) return "时间未知"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return "时间未知"
  return formatDateTime(iso)
}

export default function InvestPage() {
  const qc = useQueryClient()
  const positionsQ = useQuery({ queryKey: ["positions"], queryFn: api.getPositions, refetchInterval: 60_000 })
  const historyQ = useQuery({ queryKey: ["positions-history", 90], queryFn: () => api.getPositionsHistory(90) })
  const tradesQ = useQuery({ queryKey: ["trades"], queryFn: () => api.getTrades() })
  const assetsQ = useQuery({ queryKey: ["assets"], queryFn: api.getAssets })

  // 后端 Go nil slice → JSON null，数组消费处统一 ?? [] 兜底
  const positions = positionsQ.data?.positions ?? []
  const summary = positionsQ.data?.summary
  const assets = assetsQ.data?.assets ?? []
  const history = historyQ.data?.points ?? []
  const trades = (tradesQ.data?.trades ?? []).slice(0, 50)

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["positions"] })
    qc.invalidateQueries({ queryKey: ["trades"] })
    qc.invalidateQueries({ queryKey: ["assets"] })
    qc.invalidateQueries({ queryKey: ["dashboard"] })
    qc.invalidateQueries({ queryKey: ["positions-history"] })
  }

  // 改价（manual 资产）对话框状态
  const [priceAsset, setPriceAsset] = useState<Asset | null>(null)
  const [priceVal, setPriceVal] = useState("")
  const openPrice = (a: Asset) => { setPriceAsset(a); setPriceVal(a.current_price != null ? String(a.current_price) : "") }

  const updatePrice = useMutation({
    mutationFn: ({ id, price }: { id: number; price: number }) => api.updateAssetPrice(id, price),
    onSuccess: () => { toast.success("已更新价格"); setPriceAsset(null); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "改价失败"),
  })
  const delAsset = useMutation({
    mutationFn: (id: number) => api.deleteAsset(id),
    onSuccess: () => { toast.success("已删除资产"); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "删除失败"),
  })
  const delTrade = useMutation({
    mutationFn: (id: number) => api.deleteTrade(id),
    onSuccess: () => { toast.success("已删除交易"); invalidateAll() },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "删除失败"),
  })

  const heldCount = positions.filter((p) => p.quantity > 0).length
  const fx = summary?.fx_usdcny ?? 1
  const totalVal = summary?.total_value_cny ?? 0
  // 资产占比：每资产原币市值折算 CNY 后占总值百分比（spec 饼图降级为占比条，YAGNI）
  const allocation = positions
    .filter((p) => p.market_value != null && p.market_value > 0)
    .map((p) => ({
      key: p.asset.symbol, name: p.asset.name, symbol: p.asset.symbol,
      valueCny: (p.market_value as number) * (p.asset.currency === "USD" ? fx : 1),
    }))
    .sort((a, b) => b.valueCny - a.valueCny)

  const priceValNum = Number(priceVal)
  const priceValid = priceVal.trim() !== "" && Number.isFinite(priceValNum) && priceValNum >= 0

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2"><TrendingUp className="size-5" /> 投资</h1>
        <div className="flex items-center gap-2">
          <TradeDialog assets={assets} onSaved={invalidateAll} />
          <AssetDialog onCreated={invalidateAll} />
        </div>
      </div>

      {positionsQ.isError && (
        <p className="text-sm text-destructive">加载持仓失败：{positionsQ.error instanceof Error ? positionsQ.error.message : "未知错误"}</p>
      )}

      {/* 汇总 4 卡 */}
      {positionsQ.isPending ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)}</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard title="总资产" icon={Wallet}
            value={summary ? formatMoney(summary.total_value_cny, "CNY") : "—"}
            sub={summary ? `1 USD = ¥${fx.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}` : undefined} />
          <StatCard title="总盈亏" icon={TrendingUp}
            value={summary ? <span className={pnlCls(summary.total_pnl_cny)}>{signedMoney(summary.total_pnl_cny, "CNY")}</span> : "—"}
            sub={summary ? <span className={pnlCls(summary.total_pnl_cny)}>{signedPct(summary.total_pnl_pct)}</span> : undefined} />
          <StatCard title="今日盈亏" icon={Activity}
            value={summary?.day_pnl_cny == null ? "—" : <span className={pnlCls(summary.day_pnl_cny)}>{signedMoney(summary.day_pnl_cny, "CNY")}</span>} />
          <StatCard title="持仓数" icon={Layers} value={String(heldCount)} sub="个资产" />
        </div>
      )}

      {/* 持仓表 */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">持仓</h2>
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>资产</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="text-right">均价</TableHead>
                <TableHead className="text-right">现价</TableHead>
                <TableHead className="text-right">日涨跌</TableHead>
                <TableHead className="text-right">PE(TTM)</TableHead>
                <TableHead className="text-right">市值</TableHead>
                <TableHead className="text-right">浮动盈亏</TableHead>
                <TableHead className="text-right">已实现</TableHead>
                <TableHead className="w-28">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">还没有资产，点右上角「添加资产」开始</TableCell></TableRow>
              ) : positions.map((p) => {
                const a = p.asset
                const invalid = p.invalid === true
                const cleared = !invalid && p.quantity === 0
                return (
                  <TableRow key={a.id} className={cleared ? "opacity-60" : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="font-medium flex items-center gap-1.5">
                            <span className="truncate">{a.name}</span>
                            {invalid ? (
                              <Badge variant="destructive" title="交易序列存在超卖，请检查该资产的流水">数据异常</Badge>
                            ) : cleared ? (
                              <Badge variant="secondary">已清仓</Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground tnum">{a.symbol}</div>
                        </div>
                        <Badge variant="outline">{TYPE_LABEL[a.type] ?? "其他"}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tnum">{fmtQty(p.quantity)}</TableCell>
                    <TableCell className="text-right tnum">{formatMoney(p.avg_cost, a.currency)}</TableCell>
                    <TableCell className="text-right tnum">
                      <span className="inline-flex items-center justify-end gap-1">
                        {p.price != null ? formatMoney(p.price, a.currency) : "—"}
                        {p.stale && (
                          <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                            title={`报价可能延迟（更新于 ${priceTimeLabel(p.price_updated_at)}）`} />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className={`text-right tnum ${pnlCls(p.day_change_pct)}`}>
                      {p.day_change_pct != null ? signedPct(p.day_change_pct) : "—"}
                    </TableCell>
                    <TableCell className="text-right tnum">{p.pe_ttm != null ? p.pe_ttm.toFixed(1) : "—"}</TableCell>
                    <TableCell className="text-right tnum">{p.market_value != null ? formatMoney(p.market_value, a.currency) : "—"}</TableCell>
                    <TableCell className={`text-right tnum ${pnlCls(p.unrealized_pnl)}`}>
                      {p.unrealized_pnl != null ? signedMoney(p.unrealized_pnl, a.currency) : "—"}
                    </TableCell>
                    <TableCell className={`text-right tnum ${pnlCls(p.realized_pnl)}`}>{signedMoney(p.realized_pnl, a.currency)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <TradeDialog assets={assets} initialAssetId={a.id} onSaved={invalidateAll}
                          trigger={<Button variant="ghost" size="icon-sm" title="录交易"><Plus className="size-4" /></Button>} />
                        {a.price_source === "manual" && (
                          <Button variant="ghost" size="icon-sm" title="改价" onClick={() => openPrice(a)}><Pencil className="size-4" /></Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon-sm" title="删除资产" className="text-destructive"><Trash2 className="size-4" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>删除资产「{a.name}」？</AlertDialogTitle>
                              <AlertDialogDescription>需先删除该资产的全部交易记录，否则无法删除。</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => delAsset.mutate(a.id)}>删除</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* 收益曲线 + 资产占比 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="space-y-2 lg:col-span-2">
          <h2 className="text-sm font-medium text-muted-foreground">收益曲线（近 90 天 · CNY）</h2>
          <div className="rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,.06)] p-4">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground py-16 text-center">录入交易并等待每日快照后生成曲线</p>
            ) : (
              <ValueChart points={history} />
            )}
          </div>
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">资产占比</h2>
          <div className="rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,.06)] p-4 space-y-3">
            {allocation.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">暂无市值数据</p>
            ) : allocation.map((x) => {
              const pct = totalVal > 0 ? (x.valueCny / totalVal) * 100 : 0
              return (
                <div key={x.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{x.name} <span className="text-xs text-muted-foreground tnum">{x.symbol}</span></span>
                    <span className="tnum text-muted-foreground shrink-0">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {/* 交易流水（最近 50） */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">交易流水（最近 50 笔）</h2>
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>资产</TableHead>
                <TableHead>方向</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="text-right">单价</TableHead>
                <TableHead className="text-right">费用</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="w-14" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">暂无交易记录</TableCell></TableRow>
              ) : trades.map((t) => {
                const a = t.asset
                const cur = a?.currency ?? "USD"
                return (
                  <TableRow key={t.id}>
                    <TableCell className="tnum text-muted-foreground whitespace-nowrap">{formatDate(t.traded_at)}</TableCell>
                    <TableCell className="font-medium">{a?.name ?? `#${t.asset_id}`}</TableCell>
                    <TableCell><Badge variant={t.side === "buy" ? "secondary" : "destructive"}>{t.side === "buy" ? "买入" : "卖出"}</Badge></TableCell>
                    <TableCell className="text-right tnum">{fmtQty(t.quantity)}</TableCell>
                    <TableCell className="text-right tnum">{formatMoney(t.price, cur)}</TableCell>
                    <TableCell className="text-right tnum">{formatMoney(t.fee, cur)}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[180px] truncate">{t.note || "—"}</TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon-sm" title="删除交易" className="text-destructive"><Trash2 className="size-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除这笔交易？</AlertDialogTitle>
                            <AlertDialogDescription>
                              {formatDate(t.traded_at)} · {a?.name ?? ""} · {t.side === "buy" ? "买入" : "卖出"} {fmtQty(t.quantity)}，删除后持仓将重新计算。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => delTrade.mutate(t.id)}>删除</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* 改价对话框（manual 资产） */}
      <Dialog open={priceAsset != null} onOpenChange={(o) => { if (!o) setPriceAsset(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>修改现价</DialogTitle>
            <DialogDescription>{priceAsset?.name}（{priceAsset?.symbol}）</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label htmlFor="price-input">现价（{priceAsset?.currency === "CNY" ? "¥" : "$"}）</Label>
            <Input id="price-input" type="number" min="0" step="any" inputMode="decimal"
              value={priceVal} onChange={(e) => setPriceVal(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPriceAsset(null)}>取消</Button>
            <Button disabled={!priceValid || updatePrice.isPending}
              onClick={() => priceAsset && updatePrice.mutate({ id: priceAsset.id, price: priceValNum })}>
              {updatePrice.isPending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
