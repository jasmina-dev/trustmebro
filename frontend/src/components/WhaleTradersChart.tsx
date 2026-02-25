import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { WhaleTrader } from '../api/client'

interface WhaleTradersChartProps {
  data: WhaleTrader[]
}

const COLORS = ['#0ea5e9', '#22c55e', '#6366f1', '#f97316', '#e11d48']

export function WhaleTradersChart({ data }: WhaleTradersChartProps) {
  if (!data.length) {
    return (
      <div className="trend-chart empty">
        <p>No large traders detected for this selection.</p>
      </div>
    )
  }

  const chartData = data.map((t) => ({
    label: `${t.address.slice(0, 6)}…${t.address.slice(-4)}`,
    volume: t.volume,
    share: t.shareOfTotalVolume * 100,
  }))

  return (
    <div className="trend-chart">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 16, left: 40, bottom: 8 }}>
          <XAxis
            type="number"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tickFormatter={(v) =>
              v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : `${v}`
            }
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            width={80}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text)',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'volume') {
                return [`$${value.toLocaleString()}`, 'Volume']
              }
              return [`${value.toFixed(1)}%`, 'Share of total']
            }}
          />
          <Bar dataKey="volume" radius={[0, 4, 4, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

