import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useTranslation } from "react-i18next"
import { formatDuration } from "@/lib/duration"

export function MinutesBar({ data, height = 180 }: { data: { date: string; minutes: number }[]; height?: number }) {
  const { t } = useTranslation()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "currentColor" }} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
        {/* 数据源仍是 minutes，仅展示层换算：刻度值 /60 保留一位小数，单位 h（国际通用缩写，语言无关保留） */}
        <YAxis tick={{ fontSize: 11, fill: "currentColor" }} width={56} unit="h" tickFormatter={(v: number) => (v / 60).toFixed(1)} />
        <Tooltip formatter={(v) => [formatDuration(Number(v), t), t("learn.chart.duration")]} labelFormatter={(l) => t("learn.chart.date", { date: l })} />
        <Bar dataKey="minutes" fill="#4f46e5" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
