import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { CurvePoint } from "@/lib/types"

export function ValueChart({ points, height = 260 }: { points: CurvePoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="vFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} minTickGap={40} />
        <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v: number) => `¥${(v / 1000).toFixed(1)}k`} domain={["auto", "auto"]} />
        <Tooltip formatter={(v) => `¥${Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`} labelFormatter={(l) => `日期 ${l}`} />
        <Area type="monotone" dataKey="value" name="市值" stroke="#4f46e5" fill="url(#vFill)" strokeWidth={2} isAnimationActive={false} />
        <Area type="monotone" dataKey="cost" name="成本" stroke="#9ca3af" fill="none" strokeWidth={1.5} strokeDasharray="4 3" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
