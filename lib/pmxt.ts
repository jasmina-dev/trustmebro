/**
 * PMXT client helpers.
 *
 * Two surfaces are exposed:
 *
 * 1. `router` — a thin wrapper over `GET https://api.pmxt.dev/v0/markets`
 *    (the PMXT Router). Use it for cross-venue search, category filtering,
 *    and closed-market history. Served from the PMXT catalog in ~10ms.
 *
 * 2. `poly` / `kalshi` — per-venue SDK clients from `pmxtjs`. Use them for
 *    things the Router does NOT expose: order books, live OHLCV candles,
 *    recent trades.
 *
 * The SDK supports `new pmxt.Polymarket({ pmxtApiKey })` (see
 * https://pmxt.dev/docs/quickstart) — when `pmxtApiKey` is set, the SDK
 * switches from "local sidecar" mode to the hosted API automatically.
 *
 * When `PMXT_API_KEY` is missing we expose lazily-throwing stubs so importing
 * this file never crashes in dev — the API routes detect missing keys and
 * serve deterministic mock data instead.
 */

import pmxt from "pmxtjs";
import type {
  PriceCandle,
  RouterResponse,
  UnifiedMarket,
  UnifiedOutcome,
} from "./types";
import { marketExchange } from "./utils";

const PMXT_BASE = "https://api.pmxt.dev";

export function hasPmxtKey(): boolean {
  return Boolean(process.env.PMXT_API_KEY?.startsWith("pmxt_"));
}

function requireKey(): string {
  const key = process.env.PMXT_API_KEY;
  if (!key) {
    throw new Error(
      "PMXT_API_KEY is not set. Either add it to .env.local or rely on mock mode.",
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// Router — cross-venue search.
// Docs: https://pmxt.dev/docs/router/markets
// ---------------------------------------------------------------------------

export interface RouterMarketsParams {
  query?: string;
  limit?: number;
  offset?: number;
  closed?: boolean;
  category?: string;
  exchange?: "polymarket" | "kalshi";
}

export const router = {
  /**
   * GET /v0/markets — returns the unified Market shape across every venue.
   *
   * The response envelope is `{ data: UnifiedMarket[], meta: { count, limit, offset } }`.
   */
  markets: async (
    params: RouterMarketsParams = {},
  ): Promise<RouterResponse<UnifiedMarket>> => {
    const url = new URL(`${PMXT_BASE}/v0/markets`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${requireKey()}`,
        Accept: "application/json",
      },
      // Next.js route handlers shouldn't cache PMXT responses themselves —
      // our Upstash layer owns that. `no-store` prevents the Next fetch cache
      // from silently holding stale results.
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(
        `PMXT router markets failed: ${res.status} ${res.statusText}`,
      );
    }
    const json = (await res.json()) as RouterResponse<UnifiedMarket>;
    // PMXT Router marks canonical venue as `sourceExchange`; the `exchange`
    // query param is not reliable enough to stamp rows from the request.
    for (const m of json.data) {
      const exchange = marketExchange(m);
      if (exchange) m.exchange = exchange;
    }
    return json;
  },
};

// ---------------------------------------------------------------------------
// Per-venue SDK clients.
// Used for: OHLCV price history (for TradingView charts).
// ---------------------------------------------------------------------------

function makeClient<T>(factory: () => T): () => T {
  let instance: T | null = null;
  return () => {
    if (!instance) instance = factory();
    return instance;
  };
}

// NOTE: `PolymarketOptions` in pmxtjs@2.31.2 omits `pmxtApiKey` from its type,
// but the runtime (via the base `ExchangeOptions`) accepts it — see
// https://pmxt.dev/docs/quickstart. We cast to keep the key explicit; the SDK
// also reads from the `PMXT_API_KEY` env var as a fallback.
export const poly = makeClient(
  () =>
    new pmxt.Polymarket({
      pmxtApiKey: requireKey(),
    } as unknown as ConstructorParameters<typeof pmxt.Polymarket>[0]),
);
export const kalshi = makeClient(
  () => new pmxt.Kalshi({ pmxtApiKey: requireKey() }),
);

/**
 * Fetch hourly OHLCV candles for a single outcome.
 *
 * Per the real API (https://pmxt.dev/docs/api-reference/fetch-o-h-l-c-v):
 *   GET /api/:exchange/fetchOHLCV?id=<outcomeId>&resolution=1h&limit=168
 *
 * Returns `PriceCandle[]` (already unpacked by the SDK).
 */
export async function fetchOhlcv(
  exchange: "polymarket" | "kalshi",
  outcomeId: string,
  { resolution = "1h", limit = 168 }: { resolution?: string; limit?: number } = {},
): Promise<PriceCandle[]> {
  const client = exchange === "polymarket" ? poly() : kalshi();
  const candles = await client.fetchOHLCV(outcomeId, { resolution, limit });
  return candles as PriceCandle[];
}

// ---------------------------------------------------------------------------
// Outcome ID resolution
// ---------------------------------------------------------------------------
//
// The PMXT SDK's `fetchOHLCV` has different identifier expectations per venue
// (see pmxtjs/MarketOutcome docs):
//   • Polymarket — CLOB token ID (a 30+ digit base-10 number)
//   • Kalshi    — Market ticker  (e.g. "FED-25JAN29-B4.75")
//
// The Router's unified `/v0/markets` response is supposed to map these into
// `outcomes[].outcomeId`, but in practice we sometimes receive Polymarket-style
// numeric IDs on Kalshi markets. When that happens, the Kalshi sidecar rejects
// the request with `BadRequest: Invalid Kalshi Ticker format`.
//
// This helper picks the best available ticker-shaped identifier from the
// market/outcome payload, falling back through known metadata locations.
// Returns `null` when no usable ticker can be found — callers should skip the
// probe rather than let the sidecar reject it.

const KALSHI_TICKER_RE = /^[A-Z0-9]+(?:[.-][A-Z0-9]+)+$/i;

function pickMetadataString(
  meta: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!meta) return undefined;
  for (const key of keys) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export function resolveOhlcvId(
  market: Pick<UnifiedMarket, "marketId" | "exchange"> & {
    metadata?: Record<string, unknown>;
  },
  outcome: Pick<UnifiedOutcome, "outcomeId" | "metadata">,
): string | null {
  const exchange = market.exchange ?? "polymarket";

  if (exchange === "polymarket") {
    return outcome.outcomeId && /^\d+$/.test(outcome.outcomeId)
      ? outcome.outcomeId
      : (outcome.outcomeId ?? null);
  }

  // Kalshi — require ticker shape; fall back through metadata and marketId.
  const candidates: Array<string | undefined> = [
    KALSHI_TICKER_RE.test(outcome.outcomeId ?? "") ? outcome.outcomeId : undefined,
    pickMetadataString(outcome.metadata, ["ticker", "kalshi_ticker", "kalshiTicker"]),
    pickMetadataString(market.metadata as Record<string, unknown> | undefined, [
      "ticker",
      "kalshi_ticker",
      "kalshiTicker",
    ]),
    KALSHI_TICKER_RE.test(market.marketId ?? "") ? market.marketId : undefined,
  ];
  for (const c of candidates) {
    if (c && KALSHI_TICKER_RE.test(c)) return c;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Archive (https://archive.pmxt.dev/).
//
// Archive format isn't formally documented — we treat the endpoint
// defensively: HEAD first, sniff the content-type, then parse JSON / NDJSON.
// ---------------------------------------------------------------------------

function pmxtArchiveBase(): URL | null {
  const raw = process.env.PMXT_ARCHIVE_URL ?? "https://archive.pmxt.dev/";
  try {
    const base = new URL(raw);
    if (base.protocol !== "http:" && base.protocol !== "https:") return null;
    return base;
  } catch {
    return null;
  }
}

/**
 * Resolves a path query segment against `PMXT_ARCHIVE_URL` (or the default
 * archive host). Returns null if the result would not be same-origin with that
 * base — e.g. absolute http(s) URLs, scheme-relative `//host/…`, or a
 * malformed base — so we never attach API credentials to arbitrary hosts.
 */
export function resolveArchiveRequestUrl(path: string): URL | null {
  const base = pmxtArchiveBase();
  if (!base) return null;

  const trimmed = path.trim();
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;

  let resolved: URL;
  try {
    resolved = new URL(trimmed, base);
  } catch {
    return null;
  }

  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    return null;
  }
  if (resolved.origin !== base.origin) return null;
  if (resolved.username !== "" || resolved.password !== "") return null;

  return resolved;
}

export async function fetchArchive(
  path = "",
): Promise<{ source: string; rows: unknown[] } | null> {
  const resolved = resolveArchiveRequestUrl(path);
  if (!resolved) return null;

  const url = resolved.toString();

  try {
    const res = await fetch(url, {
      headers: hasPmxtKey()
        ? { Authorization: `Bearer ${requireKey()}` }
        : {},
      cache: "no-store",
    });
    if (!res.ok) return null;

    const ct = res.headers.get("content-type") ?? "";
    const text = await res.text();

    if (ct.includes("json") && !ct.includes("ndjson")) {
      const json = JSON.parse(text);
      const rows = Array.isArray(json) ? json : (json.data ?? [json]);
      return { source: url, rows };
    }

    // NDJSON / CSV / plain-text: try NDJSON first, fall back to splitting.
    const lines = text.split(/\r?\n/).filter(Boolean);
    const rows: unknown[] = [];
    for (const line of lines) {
      try {
        rows.push(JSON.parse(line));
      } catch {
        rows.push(line);
      }
    }
    return { source: url, rows };
  } catch (err) {
    console.warn("[archive] fetch failed", err);
    return null;
  }
}
