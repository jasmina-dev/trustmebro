import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { TradesTimeBucket } from '../api/client'

interface TradesTimeSeriesChartProps {
  data: TradesTimeBucket[]
  /**
   * Optional height in pixels for the chart area.
   * Defaults to 280 to preserve existing behavior.
   */
  height?: number
}

export function TradesTimeSeriesChart({
  data,
  height = 280,
}: TradesTimeSeriesChartProps) {
  if (!data.length) {
    return (
      <div className="trend-chart empty">
        <p>No trade history available for this selection.</p>
      </div>
    )
  }

  const chartData = data.map((bucket) => ({
    time: new Date(bucket.bucketStart).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    volume: bucket.volume,
    trades: bucket.tradeCount,
  }))

  const denseAxis = chartData.length > 36

  return (
    <div className="trend-chart">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="time"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            minTickGap={denseAxis ? 28 : undefined}
            angle={denseAxis ? -32 : 0}
            textAnchor={denseAxis ? 'end' : 'middle'}
            height={denseAxis ? 52 : undefined}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tickFormatter={(v) =>
              v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : `${v}`
            }
          />
          <YAxis
            yAxisId="right"
            orientation="right"
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
            labelStyle={{ color: 'var(--text-muted)' }}
            formatter={(value: number, name: string) => {
              if (name === 'volume') {
                return [`$${value.toLocaleString()}`, 'Volume']
              }
              return [value.toLocaleString(), 'Trades']
            }}
          />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="volume"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name="Volume"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="trades"
            stroke="#f97316"
            strokeWidth={1.5}
            dot={false}
            name="Trades"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

