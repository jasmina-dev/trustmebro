import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

interface ProbabilityBucket {
  bucket: string
  count: number
}

interface ProbabilityHistogramProps {
  data: ProbabilityBucket[]
}

const COLORS = ['#0ea5e9', '#22c55e', '#6366f1', '#f97316', '#e11d48']

export function ProbabilityHistogram({ data }: ProbabilityHistogramProps) {
  if (!data.length || data.every((d) => d.count === 0)) {
    return (
      <div className="probability-chart empty">
        <p>No probability data available yet for this selection.</p>
      </div>
    )
  }

  return (
    <div className="probability-chart">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis
            dataKey="bucket"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text)',
            }}
            formatter={(value: number) => [value, 'Markets']}
            labelStyle={{ color: 'var(--text-muted)' }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

