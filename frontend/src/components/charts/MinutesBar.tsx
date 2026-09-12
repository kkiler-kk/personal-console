import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

export function MinutesBar({ data, height = 180 }: { data: { date: string; minutes: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "currentColor" }} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
        <YAxis tick={{ fontSize: 11, fill: "currentColor" }} width={56} unit="m" />
        <Tooltip formatter={(v) => [`${v} 分钟`, "时长"]} labelFormatter={(l) => `日期 ${l}`} />
        <Bar dataKey="minutes" fill="#4f46e5" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
