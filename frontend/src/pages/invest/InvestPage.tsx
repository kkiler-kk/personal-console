import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Wallet, TrendingUp, Activity, Layers, Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { Asset, AssetType, PositionRow, PositionsResp } from "@/lib/types"
import { formatMoney, formatDate, formatDateTime } from "@/lib/format"
import { MASK, maskValue, useInvestMask } from "@/lib/mask"
import { CURRENCY_SYMBOL, convertFromCNY, useDisplayCurrency } from "@/lib/displayCurrency"
import { cn } from "@/lib/utils"
import { StatCard } from "@/components/StatCard"
import { ErrorState, errorText } from "@/components/ErrorState"
import { ValueChart } from "@/components/charts/ValueChart"
import { AssetDialog } from "@/pages/invest/AssetDialog"
import { TradeDialog } from "@/pages/invest/TradeDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

const TYPE_LABEL: Record<AssetType, string> = { stock: "股票", etf: "ETF", metal: "黄金", fund: "基金", other: "其他" }
// 类型 Badge 变体：fund 用 secondary 与 etf（outline）区分，其余保持既有 outline
const TYPE_VARIANT: Record<AssetType, "secondary" | "outline"> = { stock: "outline", etf: "outline", metal: "outline", fund: "secondary", other: "outline" }

// 持仓表类型筛选 Tab：只过滤持仓表行；汇总卡/曲线/占比/流水保持全局口径。
// invalid 行按其 asset.type 归组（与行过滤同一谓词），「全部」计数恒等于 positions.length。
type TypeFilter = "all" | AssetType
const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "全部" }, { value: "stock", label: "股票" }, { value: "etf", label: "ETF" },
  { value: "fund", label: "基金" }, { value: "metal", label: "黄金" }, { value: "other", label: "其他" },
]

// 涨绿跌红（仓库约定）：up #16a34a / down #dc2626
const pnlCls = (v: number | null) => v == null ? "" : v >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"
const signedMoney = (v: number, cur: "USD" | "CNY") => `${v >= 0 ? "+" : "−"}${formatMoney(Math.abs(v), cur)}`
const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`
const fmtQty = (n: number) => n.toLocaleString("zh-CN", { maximumFractionDigits: 4 })

// 持仓表列头排序：纯前端视图态（不写后端 sort_order）。三态循环 null→desc→asc→null，
// 回到 null 即恢复自定义（拖拽/后端 sort_order）顺序。可排序列 = 7 个数值列。
type SortKey = "quantity" | "avg_cost" | "price" | "day_change_pct" | "pe_ttm" | "market_value" | "unrealized_pnl"
type SortDir = "asc" | "desc"
const SORT_LABEL: Record<SortKey, string> = {
  quantity: "数量", avg_cost: "均价", price: "现价", day_change_pct: "日涨跌",
  pe_ttm: "PE(TTM)", market_value: "市值", unrealized_pnl: "浮动盈亏",
}
// 从 PositionRow 取排序键值；quantity/avg_cost 后端恒非 null，其余可空（null 恒沉底）
const sortVal = (p: PositionRow, k: SortKey): number | null => p[k]
// 比较器：null 值无论 asc/desc 恒沉底（无数据排最后）；非空按键值方向比较；相等保持原（自定义）序
function cmpPos(a: PositionRow, b: PositionRow, k: SortKey, dir: SortDir): number {
  const av = sortVal(a, k); const bv = sortVal(b, k)
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  return dir === "asc" ? av - bv : bv - av
}

// HTML5 DnD 插入位：指针位于目标行上半 = 插到该行前（top），下半 = 插到该行后（bottom）
function dropHalf(clientY: number, el: HTMLElement): "top" | "bottom" {
  const r = el.getBoundingClientRect()
  return clientY < r.top + r.height / 2 ? "top" : "bottom"
}

// stale 报价的 price_updated_at 可能是 Go 零值时间（0001-01-01…），年份 <2000 视为未知
function priceTimeLabel(iso: string | null): string {
  if (!iso) return "时间未知"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return "时间未知"
  return formatDateTime(iso)
}

export default function InvestPage() {
  const qc = useQueryClient()
  // 隐私遮蔽开关：隐藏数量/均价/市值/盈亏等个人数字（现价/日涨跌/PE 等公开行情不隐藏）
  const [masked, setMasked] = useInvestMask()
  // 汇总层显示币种（¥/$ 切换）：与 Dashboard 同源（localStorage + storage 事件），只影响下方三张汇总卡
  const { currency, toggle } = useDisplayCurrency()
  // 持仓表类型筛选：仅作用于持仓表行，与遮蔽开关正交（Tab 不含金额，遮蔽逻辑在单元格内不变）
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  // 列头三态排序态：sortKey===null 即自定义序（后端 sort_order，拖拽可用）
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  // 点击列头三态循环：无排序→desc→asc→无排序（换列点击则从 desc 重新开始）
  const cycleSort = (key: SortKey) => {
    if (sortKey !== key) { setSortKey(key); setSortDir("desc") }
    else if (sortDir === "desc") { setSortDir("asc") }
    else { setSortKey(null); setSortDir("desc") }
  }
  const positionsQ = useQuery({ queryKey: ["positions"], queryFn: api.getPositions, refetchInterval: 60_000 })
  const historyQ = useQuery({ queryKey: ["positions-history", 90], queryFn: () => api.getPositionsHistory(90) })
  const tradesQ = useQuery({ queryKey: ["trades"], queryFn: () => api.getTrades() })
  const assetsQ = useQuery({ queryKey: ["assets"], queryFn: api.getAssets })

  // 后端 Go nil slice → JSON null，数组消费处统一 ?? [] 兜底。
  // positions 经 useMemo 固定引用：作为下方 visiblePositions useMemo 的依赖，避免每次渲染新数组触发重算
  const positions = useMemo(() => positionsQ.data?.positions ?? [], [positionsQ.data])
  const summary = positionsQ.data?.summary
  const assets = assetsQ.data?.assets ?? []
  const history = historyQ.data?.points ?? []
  const trades = (tradesQ.data?.trades ?? []).slice(0, 50)

  // Tab 计数与行过滤同源：同一 positions、同一 `p.asset.type === v` 谓词，保证角标数与可见行数一致。
  // 排序模式（sortKey 非空）：副本稳定排序（并列保持自定义序），null 值恒沉底；拖拽仅在自定义序可用
  const visiblePositions = useMemo(() => {
    const base = typeFilter === "all" ? positions : positions.filter((p) => p.asset.type === typeFilter)
    if (sortKey === null) return base
    return [...base].sort((a, b) => cmpPos(a, b, sortKey, sortDir))
  }, [positions, typeFilter, sortKey, sortDir])
  const countByFilter = (v: TypeFilter) => (v === "all" ? positions : positions.filter((p) => p.asset.type === v)).length

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

  // 自定义顺序拖拽（HTML5 原生 DnD，未引库）：仅「全部」筛选 + sortKey===null 时可拖。
  // 触屏不支持 HTML5 DnD——桌面特性：触屏下把手不可拖但不影响表格滚动/点击。
  const dragEnabled = sortKey === null && typeFilter === "all"
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  // 插入位视觉预览：目标行上/下边框高亮（随指针在目标行上/下半区切换）
  const [overPos, setOverPos] = useState<{ index: number; half: "top" | "bottom" } | null>(null)

  // 乐观更新：drop 时先 setQueryData 改写 ["positions"] 缓存立即渲染新序，再发 reorder；
  // 失败 onError toast + invalidate 拉回服务端真实顺序（回滚），成功后 invalidate 同步 sort_order
  const saveOrder = useMutation({
    mutationFn: (ids: number[]) => api.reorderAssets(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] })
      qc.invalidateQueries({ queryKey: ["positions"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e: unknown) => {
      toast.error(e instanceof ApiError ? e.message : "保存顺序失败")
      qc.invalidateQueries({ queryKey: ["positions"] })
      qc.invalidateQueries({ queryKey: ["assets"] })
    },
  })

  // drop → 计算新序 → 乐观写缓存 → 提交全量 asset id（后端要求 ids 与资产全集严格一致）
  const applyReorder = (src: number, target: number, half: "top" | "bottom") => {
    // dragEnabled ⇒ visiblePositions === positions（全部筛选 + 无排序），行索引与全量一一对应
    const rows = positions
    let dest = half === "top" ? target : target + 1
    if (src < dest) dest -= 1 // 移除源行后，其后索引整体左移一位
    if (dest === src) return // 落回原位：no-op，不发请求
    const next = [...rows]
    const [moved] = next.splice(src, 1)
    next.splice(dest, 0, moved)
    qc.setQueryData<PositionsResp>(["positions"], (old) => (old ? { ...old, positions: next } : old))
    saveOrder.mutate(next.map((r) => r.asset.id))
  }

  const heldCount = positions.filter((p) => p.quantity > 0).length
  const fx = summary?.fx_usdcny ?? 1
  // 汇率不可用（缺失/<=0）时禁用切换，且展示币种强制回落 CNY——
  // 防御持久化的 USD 偏好配上坏汇率后把未换算的 CNY 数值错挂 US$ 前缀
  const fxUsable = Number.isFinite(fx) && fx > 0
  const displayCurrency = currency === "USD" && fxUsable ? "USD" : "CNY"
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
  // price > 0 对齐后端 binding gt=0（task 4.5）：前端先拦，避免裸 binding 英文错误 toast
  const priceValid = priceVal.trim() !== "" && Number.isFinite(priceValNum) && priceValNum > 0

  // 可排序列头：点击三态循环，箭头指示当前态（无排序时淡显 ArrowUpDown 提示可点）；
  // aria-sort 供辅助技术/自动化断言消费。按钮不含金额数字，遮蔽态零泄露
  const sortHead = (key: SortKey) => (
    <TableHead className="text-right"
      aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => cycleSort(key)} data-sort-key={key}
        className="inline-flex cursor-pointer items-center justify-end gap-1 hover:opacity-70"
        title={sortKey === key ? (sortDir === "desc" ? "降序 · 点击切换升序" : "升序 · 点击恢复自定义顺序") : "点击按此列降序排序"}>
        {SORT_LABEL[key]}
        {sortKey === key
          ? (sortDir === "desc" ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />)
          : <ArrowUpDown className="size-3.5 opacity-40" />}
      </button>
    </TableHead>
  )

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2"><TrendingUp className="size-5" /> 投资</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon"
            aria-label={masked ? "显示金额数字" : "隐藏金额数字"}
            title={masked ? "显示金额数字" : "隐藏金额数字"}
            onClick={() => setMasked(!masked)}>
            {masked ? <EyeOff /> : <Eye />}
          </Button>
          <TradeDialog assets={assets} onSaved={invalidateAll} />
          <AssetDialog onCreated={invalidateAll} />
        </div>
      </div>

      {/* positions isError → 统一错误态（task 4.5）：汇总卡/持仓表整体不渲染，避免误导性「还没有资产」空态 */}
      {positionsQ.isError ? (
        <ErrorState title="加载持仓失败" message={errorText(positionsQ.error)} onRetry={() => positionsQ.refetch()} />
      ) : (
        <>
          {/* 汇总 4 卡 */}
          {positionsQ.isPending ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)}</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 遮蔽时盈亏色也归中性（pnlCls(null)），避免红绿泄露盈亏方向；汇率为公开行情不遮蔽 */}
              {/* 币种切换按钮在总资产卡 action 槽：显示目标币种符号（当前 ¥ → "$"）；fx 不可用禁用。
                  遮蔽优先于币种：三卡先判 masked（MASK/中性色），非遮蔽才走 convertFromCNY 换算；pct 无币种不换算 */}
              <StatCard title="总资产" icon={Wallet}
                action={
                  <Button variant="ghost" size="icon-sm" data-testid="currency-toggle"
                    disabled={!fxUsable}
                    aria-label={fxUsable ? (displayCurrency === "CNY" ? "切换为美元显示" : "切换为人民币显示") : "汇率不可用"}
                    title={fxUsable ? (displayCurrency === "CNY" ? "切换为美元显示" : "切换为人民币显示") : "汇率不可用"}
                    onClick={toggle}>
                    <span className="tnum text-sm">{CURRENCY_SYMBOL[displayCurrency === "CNY" ? "USD" : "CNY"]}</span>
                  </Button>
                }
                value={summary ? maskValue(formatMoney(convertFromCNY(summary.total_value_cny, displayCurrency, fx), displayCurrency), masked) : "—"}
                sub={summary ? `1 USD = ¥${fx.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}` : undefined} />
              <StatCard title="总盈亏" icon={TrendingUp}
                value={summary ? (masked ? MASK : <span className={pnlCls(summary.total_pnl_cny)}>{signedMoney(convertFromCNY(summary.total_pnl_cny, displayCurrency, fx), displayCurrency)}</span>) : "—"}
                sub={summary ? (masked ? MASK : <span className={pnlCls(summary.total_pnl_cny)}>{signedPct(summary.total_pnl_pct)}</span>) : undefined} />
              <StatCard title="今日盈亏" icon={Activity}
                value={summary?.day_pnl_cny == null ? "—" : masked ? MASK : <span className={pnlCls(summary.day_pnl_cny)}>{signedMoney(convertFromCNY(summary.day_pnl_cny, displayCurrency, fx), displayCurrency)}</span>} />
              <StatCard title="持仓数" icon={Layers} value={String(heldCount)} sub="个资产" />
            </div>
          )}

          {/* 持仓表 */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">持仓</h2>
              {/* 类型筛选 Tab：只过滤下方持仓表行；汇总卡/曲线/占比/流水保持全局口径不随筛选变 */}
              <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                <TabsList>
                  {TYPE_FILTERS.map((f) => (
                    <TabsTrigger key={f.value} value={f.value}>
                      {f.label}
                      <span className="rounded-full bg-muted-foreground/15 px-1.5 text-[10px] leading-4 tnum">{countByFilter(f.value)}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <div className="rounded-xl border border-border bg-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" aria-label="拖拽把手" />
                    <TableHead>资产</TableHead>
                    {sortHead("quantity")}
                    {sortHead("avg_cost")}
                    {sortHead("price")}
                    {sortHead("day_change_pct")}
                    {sortHead("pe_ttm")}
                    {sortHead("market_value")}
                    {sortHead("unrealized_pnl")}
                    <TableHead className="text-right">已实现</TableHead>
                    <TableHead className="w-28">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiblePositions.length === 0 ? (
                    <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-10">
                      {positions.length === 0 ? "还没有资产，点右上角「添加资产」开始" : "该类型下暂无持仓"}
                    </TableCell></TableRow>
                  ) : visiblePositions.map((p, i) => {
                    const a = p.asset
                    const invalid = p.invalid === true
                    const cleared = !invalid && p.quantity === 0
                    // 拖拽预览：仅高亮当前悬停目标行（源行半透明）；drop 语义见 applyReorder
                    const isOver = overPos?.index === i && dragIndex !== null && dragIndex !== i
                    return (
                      <TableRow key={a.id}
                        className={cn(
                          cleared && "opacity-60",
                          dragIndex === i && "opacity-40",
                          isOver && (overPos?.half === "top" ? "border-t-2 border-t-primary" : "border-b-2 border-b-primary"),
                        )}
                        draggable={dragEnabled}
                        onDragStart={(e) => {
                          if (!dragEnabled) return
                          setDragIndex(i)
                          e.dataTransfer.effectAllowed = "move"
                          e.dataTransfer.setData("text/plain", String(i))
                        }}
                        onDragOver={(e) => {
                          if (!dragEnabled || dragIndex === null) return
                          e.preventDefault() // 不 preventDefault 浏览器不允许 drop
                          e.dataTransfer.dropEffect = "move"
                          const half = dropHalf(e.clientY, e.currentTarget)
                          // dragover 高频触发：值未变时返回 prev 避免无谓重渲染
                          setOverPos((prev) => (prev?.index === i && prev.half === half ? prev : { index: i, half }))
                        }}
                        onDragLeave={() => setOverPos((prev) => (prev?.index === i ? null : prev))}
                        onDrop={(e) => {
                          if (!dragEnabled || dragIndex === null) return
                          e.preventDefault()
                          const src = dragIndex
                          const half = dropHalf(e.clientY, e.currentTarget)
                          setDragIndex(null)
                          setOverPos(null)
                          applyReorder(src, i, half)
                        }}
                        onDragEnd={() => { setDragIndex(null); setOverPos(null) }}
                      >
                        {/* 拖拽把手：纯图标不含数字，遮蔽态无金额泄露；筛选/排序态禁用并提示恢复方式 */}
                        <TableCell className="w-8 pr-0">
                          <span className={cn("flex items-center",
                            dragEnabled ? "cursor-grab text-muted-foreground" : "cursor-not-allowed text-muted-foreground/30")}
                            title={dragEnabled ? "拖拽调整顺序" : "切换回『全部』且取消列排序后可拖拽"}>
                            <GripVertical className="size-4" />
                          </span>
                        </TableCell>
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
                            <Badge variant={TYPE_VARIANT[a.type] ?? "outline"}>{TYPE_LABEL[a.type] ?? "其他"}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tnum">{maskValue(fmtQty(p.quantity), masked)}</TableCell>
                        <TableCell className="text-right tnum">{maskValue(formatMoney(p.avg_cost, a.currency), masked)}</TableCell>
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
                        <TableCell className="text-right tnum">{p.market_value != null ? maskValue(formatMoney(p.market_value, a.currency), masked) : "—"}</TableCell>
                        <TableCell className={`text-right tnum ${pnlCls(masked ? null : p.unrealized_pnl)}`}>
                          {p.unrealized_pnl != null ? maskValue(signedMoney(p.unrealized_pnl, a.currency), masked) : "—"}
                        </TableCell>
                        <TableCell className={`text-right tnum ${pnlCls(masked ? null : p.realized_pnl)}`}>{maskValue(signedMoney(p.realized_pnl, a.currency), masked)}</TableCell>
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
        </>
      )}

      {/* 收益曲线 + 资产占比 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="space-y-2 lg:col-span-2">
          <h2 className="text-sm font-medium text-muted-foreground">收益曲线（近 90 天 · CNY）</h2>
          <div className="rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,.06)] p-4">
            {masked ? (
              // 遮蔽时整卡占位：Y 轴刻度会泄露绝对金额，不渲染 ValueChart
              <p className="text-sm text-muted-foreground py-16 text-center">数字已隐藏</p>
            ) : historyQ.isError ? (
              <ErrorState title="加载收益曲线失败" message={errorText(historyQ.error)} onRetry={() => historyQ.refetch()} />
            ) : history.length === 0 ? (
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
                    <TableCell className="text-right tnum">{maskValue(fmtQty(t.quantity), masked)}</TableCell>
                    <TableCell className="text-right tnum">{maskValue(formatMoney(t.price, cur), masked)}</TableCell>
                    <TableCell className="text-right tnum">{maskValue(formatMoney(t.fee, cur), masked)}</TableCell>
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
                              {formatDate(t.traded_at)} · {a?.name ?? ""} · {t.side === "buy" ? "买入" : "卖出"} {maskValue(fmtQty(t.quantity), masked)}，删除后持仓将重新计算。
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
