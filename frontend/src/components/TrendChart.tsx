import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

interface ChartPoint {
  name: string
  volume: number
}

interface TrendChartProps {
  data: ChartPoint[]
}

const COLORS = ['#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a']

export function TrendChart({ data }: TrendChartProps) {
  if (!data.length) {
    return (
      <div className="trend-chart empty">
        <p>No volume data to display. Try another category or wait for more data.</p>
      </div>
    )
  }

  return (
    <div className="trend-chart">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}k`)}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text)',
            }}
            formatter={(value: number) => [
              `$${value.toLocaleString()}`,
              'Volume',
            ]}
            labelStyle={{ color: 'var(--text-muted)' }}
          />
          <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
