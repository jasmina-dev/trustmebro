import type { PolymarketEvent } from "../api/client";
import "./MarketList.css";

/** Matches nav order so multi-tag rows read consistently. */
const TAG_DISPLAY_ORDER = [
  "Politics",
  "Economy",
  "Entertainment",
  "Technology",
  "Crypto",
  "Climate",
  "Other",
] as const;

/**
 * Cards show event-level copy, but categories are inferred per market too.
 * Union event + all merged markets so chips match any outcome's keywords.
 */
function tagsForEventCard(event: PolymarketEvent): string[] {
  const byLower = new Map<string, string>();
  const add = (raw: string | undefined) => {
    const t = raw?.trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (!byLower.has(k)) byLower.set(k, t);
  };
  for (const c of event.tmCategories ?? []) add(c);
  for (const m of event.markets ?? []) {
    for (const c of m.tmCategories ?? []) add(c);
  }
  const labels = Array.from(byLower.values());
  const idx = new Map(TAG_DISPLAY_ORDER.map((c, i) => [c.toLowerCase(), i]));
  return labels.sort((a, b) => {
    const ia = idx.get(a.toLowerCase()) ?? 100;
    const ib = idx.get(b.toLowerCase()) ?? 100;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}

interface MarketListProps {
  events: PolymarketEvent[];
}

const POLYMARKET_BASE_URL = "https://polymarket.com";

function eventUrl(event: PolymarketEvent): string | undefined {
  const slug = event.slug?.trim();
  return slug ? `${POLYMARKET_BASE_URL}/event/${slug}` : undefined;
}

function formatVolume(v: number | undefined): string {
  if (v == null || v === 0) return "—";
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

/** Gamma sometimes returns outcomePrices as a JSON array string or a real array. */
function firstYesProbability(raw: unknown): number | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const v = parseFloat(String(raw[0]));
    return Number.isFinite(v) ? v : null;
  }
  const s = String(raw).trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s) as unknown;
      if (Array.isArray(arr) && arr.length > 0) {
        const v = parseFloat(String(arr[0]));
        return Number.isFinite(v) ? v : null;
      }
    } catch {
      /* fall through */
    }
  }
  const first =
    s
      .split(",")[0]
      ?.replace(/^\[?\s*"?/, "")
      .replace(/"?\s*$/, "") ?? "";
  const v = parseFloat(first);
  return Number.isFinite(v) ? v : null;
}

function tagModifierClass(label: string): string {
  const key = label.trim().toLowerCase();
  const variants: Record<string, string> = {
    politics: "event-tag--politics",
    economy: "event-tag--economy",
    entertainment: "event-tag--entertainment",
    technology: "event-tag--technology",
    crypto: "event-tag--crypto",
    climate: "event-tag--climate",
    other: "event-tag--other",
  };
  return variants[key] ?? "event-tag--other";
}

function TagChips({ labels }: { labels: string[] }) {
  if (!labels.length) return null;
  return (
    <ul className="event-tag-list" aria-label="Categories">
      {labels.map((label, i) => (
        <li
          key={`${label}-${i}`}
          className={`event-tag ${tagModifierClass(label)}`}
        >
          {label}
        </li>
      ))}
    </ul>
  );
}

export function MarketList({ events }: MarketListProps) {
  if (!events.length) {
    return (
      <div className="market-list empty">
        <p>No events match the selected category.</p>
      </div>
    );
  }

  return (
    <ul className="market-list">
      {events.slice(0, 50).map((event) => {
        const volume =
          event.markets?.reduce(
            (s, m) => s + (m.volumeNum ?? (m.volume as number) ?? 0),
            0,
          ) ?? 0;
        const pYes = firstYesProbability(event.markets?.[0]?.outcomePrices);
        const yesDisplay =
          pYes != null ? `${(pYes <= 1 ? pYes * 100 : pYes).toFixed(0)}¢` : "—";

        const tags = tagsForEventCard(event);
        const url = eventUrl(event);

        return (
          <li key={event.id} className="market-card">
            <div className="market-card-main">
              <div className="market-card-head">
                {url ? (
                  <a
                    className="market-title market-title-link"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {event.title}
                  </a>
                ) : (
                  <h3 className="market-title">{event.title}</h3>
                )}
                {tags.length > 0 ? <TagChips labels={tags} /> : null}
              </div>
              {event.description && (
                <p className="market-desc">
                  {event.description.slice(0, 120)}
                  {event.description.length > 120 ? "…" : ""}
                </p>
              )}
              <div className="market-meta">
                <span className="meta-volume">Vol: {formatVolume(volume)}</span>
                {event.markets?.[0] && (
                  <span className="meta-price">Yes: {yesDisplay}</span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
