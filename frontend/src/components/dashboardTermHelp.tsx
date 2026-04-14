import { SUSPICION_SIGNAL_DISCLAIMER } from "./suspicion";
import { TermHelpIcon } from "./TermHelpIcon";

export function SuspicionTermHelp({ className }: { className?: string }) {
  return (
    <TermHelpIcon
      className={className}
      termLabel="Suspicion signal"
      dialogTitle="Suspicion signal"
    >
      <p>{SUSPICION_SIGNAL_DISCLAIMER}</p>
      <p>
        The level is computed from your current data slice: for example,{" "}
        <strong>high</strong> if the event is flagged for unusually high
        category volume or cross-market title inconsistencies; otherwise from
        how much of global trade notionals sit in this event&apos;s markets,
        late-window concentration, how concentrated flow is in the largest
        wallets on the trending bars, and the event&apos;s rank in the chart.
      </p>
    </TermHelpIcon>
  );
}

export function WhalesTermHelp({ className }: { className?: string }) {
  return (
    <TermHelpIcon
      className={className}
      termLabel="Whales"
      dialogTitle="Whales (whale addresses)"
    >
      <p>
        &quot;Whales&quot; here are the largest takers in the analytics window:
        the backend ranks wallet addresses by total trade{" "}
        <strong>notional</strong> (each trade&apos;s size × price), keeps the
        top ten, and reports each address&apos;s volume and{" "}
        <strong>share of total volume</strong> in that scope.
      </p>
      <p>
        Use it as a concentration check—heavy share in one or two addresses
        means flow is less broad-based—not as proof of who moved prices or why.
      </p>
    </TermHelpIcon>
  );
}

export function NotionalVolumeTermHelp({ className }: { className?: string }) {
  return (
    <TermHelpIcon
      className={className}
      termLabel="Notional volume"
      dialogTitle="Notional volume (USD)"
    >
      <p>
        On the <strong>trending markets</strong> bar chart, each bar is the sum
        of Polymarket&apos;s published <strong>market volumes</strong> across
        every market in that event—US dollar turnover the platform attributes to
        those markets.
      </p>
      <p>
        In <strong>trades analytics</strong> (cash flow, time series, whales),
        volume is the sum of individual trade notionals (size × price) fetched
        from the trades feed over your selected hours window.
      </p>
    </TermHelpIcon>
  );
}
