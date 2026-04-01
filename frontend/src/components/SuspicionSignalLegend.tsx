import { SUSPICION_SIGNAL_DISCLAIMER } from "./suspicion";
import "./SuspicionSignalLegend.css";

/** Key for 🔴/🟡/🟢 labels on each trending bar (sits directly under the bar chart). */
export function SuspicionSignalLegend() {
  return (
    <div
      className="suspicion-signal-legend"
      aria-label="Suspicion signal levels for trending market bars"
    >
      <p className="suspicion-signal-legend-title">Suspicion signal key</p>
      <ul className="suspicion-signal-legend-items">
        <li>
          <span className="suspicion-signal-legend-pill suspicion-signal-high">
            🔴 HIGH
          </span>
          <span className="suspicion-signal-legend-desc">
            Stronger overlap of volume, whale, and structural flags.
          </span>
        </li>
        <li>
          <span className="suspicion-signal-legend-pill suspicion-signal-medium">
            🟡 MED
          </span>
          <span className="suspicion-signal-legend-desc">
            Some elevated activity or rank-driven signal.
          </span>
        </li>
        <li>
          <span className="suspicion-signal-legend-pill suspicion-signal-low">
            🟢 LOW
          </span>
          <span className="suspicion-signal-legend-desc">
            Fewer heuristic hits on the inputs we can observe.
          </span>
        </li>
      </ul>
      <p className="suspicion-signal-legend-disclaimer">
        {SUSPICION_SIGNAL_DISCLAIMER}
      </p>
    </div>
  );
}
