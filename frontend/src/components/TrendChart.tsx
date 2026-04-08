import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Rectangle,
  Cell,
} from "recharts";
import type { SuspicionLevel } from "./suspicion";
import "./TrendChart.css";

export interface TrendChartRow {
  /** Unique key for axis + selection */
  eventId: string;
  /** Short label shown under the bar */
  name: string;
  /** Full label shown in tooltip */
  fullName?: string;
  volume: number;
  suspicion: SuspicionLevel;
}

interface TrendChartProps {
  data: TrendChartRow[];
  height?: number;
  selectedEventId?: string | null;
  onBarClick?: (eventId: string) => void;
  loading?: boolean;
}

const BAR_COLOR = "#2563eb";

const SUSPICION_TICK: Record<
  SuspicionLevel,
  { pill: string; label: string; fill: string }
> = {
  high: { pill: "🔴", label: "High", fill: "#f87171" },
  medium: { pill: "🟡", label: "Med", fill: "#fbbf24" },
  low: { pill: "🟢", label: "Low", fill: "#4ade80" },
};

function TrendMarketTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: TrendChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const ui = SUSPICION_TICK[row.suspicion];

  return (
    <div className="trend-chart-tooltip">
      <p className="trend-chart-tooltip-title">{row.fullName ?? row.name}</p>{" "}
      <p className="trend-chart-tooltip-line">
        <span className="trend-chart-tooltip-muted">Volume</span>{" "}
        <span className="trend-chart-tooltip-strong">
          ${row.volume.toLocaleString()}
        </span>
      </p>
      <p className="trend-chart-tooltip-line">
        <span className="trend-chart-tooltip-muted">Suspicion</span>{" "}
        <span style={{ color: ui.fill, fontWeight: 600 }}>
          {ui.pill} {ui.label}
        </span>
      </p>
    </div>
  );
}

function TrendXAxisTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  dataMap: Map<string, TrendChartRow>;
}) {
  const { x = 0, y = 0, payload, dataMap } = props;
  const row = payload?.value ? dataMap.get(payload.value) : undefined;
  const name = row?.name ?? "";
  const suspicion = row?.suspicion ?? "low";
  const ui = SUSPICION_TICK[suspicion];
  const short = name.length > 16 ? `${name.slice(0, 16)}…` : name;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={10}
        textAnchor="middle"
        fill="var(--text-muted)"
        fontSize={10}
      >
        {short}
      </text>
      <text
        x={0}
        y={0}
        dy={24}
        textAnchor="middle"
        fill={ui.fill}
        fontSize={9}
        fontWeight={600}
      >
        {`${ui.pill} ${ui.label}`}
      </text>
    </g>
  );
}

export function TrendChart({
  data,
  height = 280,
  selectedEventId,
  onBarClick,
  loading,
}: TrendChartProps) {
  const dataMap = new Map(data.map((d) => [d.eventId, d]));

  if (loading) {
    return (
      <div
        className="trend-chart trend-chart-loading chart-panel-skeleton"
        style={{ minHeight: height }}
        aria-busy="true"
        aria-label="Loading trending markets"
      />
    );
  }

  if (!data.length) {
    return (
      <div className="trend-chart empty">
        <p>
          No volume data to display. Try another category or wait for more data.
        </p>
      </div>
    );
  }

  const chartBottomMargin = 64;

  return (
    <div className="trend-chart trend-bar-chart">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 28, right: 12, left: 10, bottom: chartBottomMargin }}
        >
          <XAxis
            dataKey="eventId"
            type="category"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval={0}
            tick={(tickProps) => (
              <TrendXAxisTick {...tickProps} dataMap={dataMap} />
            )}
            height={chartBottomMargin}
            label={{
              value: "Event (short label + suspicion signal)",
              position: "insideBottom",
              offset: 0,
              fill: "var(--text-muted)",
              fontSize: 11,
            }}
            stroke="var(--border)"
          />
          <YAxis
            width={52}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(v) =>
              v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}k`
            }
          />
          <Tooltip content={<TrendMarketTooltip />} cursor={false} />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{
              color: "var(--text)",
              fontSize: "0.8rem",
              paddingBottom: 4,
            }}
          />
          <Bar
            name="Notional volume (USD)"
            dataKey="volume"
            fill={BAR_COLOR}
            radius={[4, 4, 0, 0]}
            cursor={onBarClick ? "pointer" : "default"}
            activeBar={(props: unknown) => {
              const barProps = props as { payload?: TrendChartRow };
              const selected = barProps.payload?.eventId === selectedEventId;
              return (
                <Rectangle
                  {...barProps}
                  fill={BAR_COLOR}
                  fillOpacity={selected ? 1 : 0.78}
                  stroke={selected ? "#f97316" : "var(--trend-bar-hover-stroke)"}
                  strokeWidth={selected ? 2 : 1.5}
                />
              );
            }}
            onClick={(state) => {
              const row = state?.payload as TrendChartRow | undefined;
              if (row?.eventId && onBarClick) onBarClick(row.eventId);
            }}
          >
            {data.map((row) => {
              const selected = row.eventId === selectedEventId;
              return (
                <Cell
                  key={row.eventId}
                  fill={BAR_COLOR}
                  fillOpacity={selected ? 1 : 0.78}
                  stroke={selected ? "#f97316" : "transparent"}
                  strokeWidth={selected ? 2 : 0}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {onBarClick && (
        <p className="trend-chart-hint hint">
          Click a bar to focus cash flow, activity, and the event list on that
          market. Click the same bar again to clear.
        </p>
      )}
    </div>
  );
}
