import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { TradesTimeBucket } from "../api/client";
import "./TradesTimeSeriesChart.css";

interface TradesTimeSeriesChartProps {
  data: TradesTimeBucket[];
  /**
   * Optional height in pixels for the chart area.
   * Defaults to 280 to preserve existing behavior.
   */
  height?: number;
  loading?: boolean;
}

const TOOLTIP_STYLE = {
  background: "var(--surface-hover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
} as const;

export function TradesTimeSeriesChart({
  data,
  height = 280,
  loading,
}: TradesTimeSeriesChartProps) {
  if (loading) {
    return (
      <div
        className="trend-chart trend-chart-loading chart-panel-skeleton"
        style={{ minHeight: height }}
        aria-busy="true"
        aria-label="Loading chart"
      />
    );
  }

  if (!data.length) {
    return (
      <div className="trend-chart empty">
        <p>No trade history available for this selection.</p>
      </div>
    );
  }

  const chartData = data.map((bucket) => ({
    time: new Date(bucket.bucketStart).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    volume: bucket.volume,
    trades: bucket.tradeCount,
  }));

  const denseAxis = chartData.length > 36;

  return (
    <div className="trend-chart trades-time-series-chart">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={chartData}
          margin={{
            top: 16,
            right: 28,
            left: 12,
            bottom: denseAxis ? 48 : 40,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="time"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickLine={false}
            minTickGap={denseAxis ? 28 : undefined}
            angle={denseAxis ? -32 : 0}
            textAnchor={denseAxis ? "end" : "middle"}
            height={denseAxis ? 56 : 36}
            label={{
              value: "Time (bucket start, local)",
              position: "insideBottom",
              offset: denseAxis ? -2 : 2,
              fill: "var(--text-muted)",
              fontSize: 11,
            }}
            stroke="var(--border)"
          />
          <YAxis
            yAxisId="left"
            width={56}
            tick={{ fill: "var(--chart-axis-left)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(v) =>
              v >= 1e6
                ? `${(v / 1e6).toFixed(1)}M`
                : v >= 1e3
                  ? `${(v / 1e3).toFixed(0)}k`
                  : `${v}`
            }
            label={{
              value: "Volume (USD)",
              angle: -90,
              position: "insideLeft",
              offset: 2,
              fill: "var(--chart-axis-left)",
              fontSize: 11,
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            width={48}
            tick={{ fill: "var(--chart-axis-right)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            label={{
              value: "Trades (count)",
              angle: 90,
              position: "insideRight",
              offset: 4,
              fill: "var(--chart-axis-right)",
              fontSize: 11,
            }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "var(--text-muted)" }}
            itemStyle={{ color: "var(--text)" }}
            formatter={(value: number, name: string) => {
              if (String(name).includes("Volume")) {
                return [`$${value.toLocaleString()}`, name];
              }
              return [value.toLocaleString(), name];
            }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="line"
            wrapperStyle={{
              paddingBottom: 6,
              color: "var(--text)",
            }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="volume"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name="Volume (USD)"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="trades"
            stroke="#f97316"
            strokeWidth={1.5}
            dot={false}
            name="Trades (count)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
