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

const SUSPICION_TICK: Record<
  SuspicionLevel,
  { label: string; chipClass: string; dotClass: string }
> = {
  high: {
    label: "High",
    chipClass: "trend-market-signal trend-market-signal-high",
    dotClass: "trend-market-dot trend-market-dot-high",
  },
  medium: {
    label: "Med",
    chipClass: "trend-market-signal trend-market-signal-medium",
    dotClass: "trend-market-dot trend-market-dot-medium",
  },
  low: {
    label: "Low",
    chipClass: "trend-market-signal trend-market-signal-low",
    dotClass: "trend-market-dot trend-market-dot-low",
  },
};

function compactVolume(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

export function TrendChart({
  data,
  height = 280,
  selectedEventId,
  onBarClick,
  loading,
}: TrendChartProps) {
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

  const maxVolume = Math.max(...data.map((d) => d.volume), 1);

  return (
    <div className="trend-chart trend-list-chart">
      <div className="trend-list-header">
        <span className="trend-list-title">Top markets</span>
        <span className="trend-list-subtitle">Sorted by volume</span>
      </div>

      <div className="trend-list" style={{ maxHeight: height }}>
        {data.map((row, index) => {
          const selected = row.eventId === selectedEventId;
          const signal = SUSPICION_TICK[row.suspicion];
          const barPct = Math.max(
            4,
            Math.round((row.volume / maxVolume) * 100),
          );

          return (
            <button
              key={row.eventId}
              type="button"
              className={`trend-market-row ${selected ? "selected" : ""}`}
              onClick={() => onBarClick?.(row.eventId)}
              aria-pressed={selected}
              title={row.fullName ?? row.name}
            >
              <span className="trend-market-rank">{index + 1}</span>

              <span className="trend-market-main">
                <span className="trend-market-name">
                  {row.fullName ?? row.name}
                </span>
                <span className="trend-market-meta">
                  {compactVolume(row.volume)}
                </span>
              </span>

              <span className="trend-market-right">
                <span className={signal.chipClass}>
                  <span className={signal.dotClass} />
                  {signal.label}
                </span>
                <span className="trend-market-bar-wrap" aria-hidden="true">
                  <span
                    className="trend-market-bar"
                    style={{ width: `${barPct}%` }}
                  />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
