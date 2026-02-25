import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { PreDeadlineWindow } from '../api/client'

interface PreDeadlineChartProps {
  window: PreDeadlineWindow
  totalVolume: number
}

const COLORS = ['#f97316', '#e5e7eb']

export function PreDeadlineChart({ window, totalVolume }: PreDeadlineChartProps) {
  if (!totalVolume || totalVolume <= 0) {
    return (
      <div className="trend-chart empty">
        <p>No volume observed yet for this selection.</p>
      </div>
    )
  }

  const lateVolume = window.volume
  const otherVolume = Math.max(0, totalVolume - lateVolume)
  const data = [
    { name: 'Final window', value: lateVolume },
    { name: 'Earlier period', value: otherVolume },
  ]

  return (
    <div className="trend-chart">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text)',
            }}
            formatter={(value: number, name: string) => [
              `$${value.toLocaleString()}`,
              name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="predeadline-summary">
        In the final <strong>{window.windowHours} hours</strong> before the latest trade,{' '}
        <strong>{(window.shareOfTotalVolume * 100).toFixed(1)}%</strong> of volume
        ({`$${window.volume.toLocaleString()}`}) occurred.
      </p>
    </div>
  )
}

