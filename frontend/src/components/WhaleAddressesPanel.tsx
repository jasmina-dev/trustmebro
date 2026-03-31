import { useState } from "react";
import type { WhaleTrader } from "../api/client";
import "./WhaleAddressesPanel.css";

const POLYGONSCAN = "https://polygonscan.com/address/";

function truncateAddress(addr: string): string {
  const a = addr.startsWith("0x") ? addr : `0x${addr}`;
  if (a.length <= 14) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

interface WhaleAddressesPanelProps {
  data: WhaleTrader[];
}

export function WhaleAddressesPanel({ data }: WhaleAddressesPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyAddress(full: string) {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(full);
      window.setTimeout(() => setCopied((c) => (c === full ? null : c)), 2000);
    } catch {
      setCopied(null);
    }
  }

  if (!data.length) {
    return (
      <div className="whale-panel whale-panel-empty">
        <p>No large traders detected for this selection.</p>
      </div>
    );
  }

  const maxVol = Math.max(...data.map((w) => w.volume), 1);

  return (
    <ul className="whale-panel" aria-label="Whale trader addresses">
      {data.map((w) => {
        const full =
          w.address.startsWith("0x") ? w.address : `0x${w.address}`;
        const href = `${POLYGONSCAN}${full}`;
        const pct = (w.shareOfTotalVolume * 100).toFixed(1);
        const barPct = Math.min(100, (w.volume / maxVol) * 100);

        return (
          <li key={full} className="whale-panel-row">
            <div className="whale-panel-row-main">
              <div className="whale-panel-addr-line">
                <code className="whale-panel-addr" title={full}>
                  {truncateAddress(w.address)}
                </code>
                <div className="whale-panel-actions">
                  <button
                    type="button"
                    className="whale-panel-icon-btn"
                    onClick={() => copyAddress(full)}
                    aria-label={`Copy address ${truncateAddress(w.address)}`}
                  >
                    {copied === full ? "Copied" : "Copy"}
                  </button>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whale-panel-icon-link"
                    aria-label={`View ${truncateAddress(w.address)} on Polygon explorer`}
                    title="View on Polygonscan"
                  >
                    ↗
                  </a>
                </div>
              </div>
              <div className="whale-panel-metrics">
                <span className="whale-panel-vol">
                  ${w.volume.toLocaleString()}
                </span>
                <span className="whale-panel-share">{pct}% of window</span>
              </div>
              <div
                className="whale-panel-bar"
                role="presentation"
                aria-hidden
              >
                <span
                  className="whale-panel-bar-fill"
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
