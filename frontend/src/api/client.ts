// utilized github copilot

const API_BASE = "/api";

export type MarketSource = "polymarket" | "kalshi";

const SOURCE_BASE_URLS: Record<MarketSource, string> = {
  polymarket: "https://polymarket.com",
  kalshi: "https://kalshi.com",
};

function sourcePath(_source: MarketSource): string {
  return `${API_BASE}/markets`;
}

function readTextField(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return undefined;
}

function readNumberField(
  obj: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (value == null || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asArrayPayload<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const candidate = (data as Record<string, unknown>)[key];
    if (Array.isArray(candidate)) return candidate as T[];
  }
  return [];
}

export function getSourceBaseUrl(source: MarketSource): string {
  return SOURCE_BASE_URLS[source];
}

function kalshiWebUrlFromSlug(slug: string): string {
  const trimmed = slug.trim();
  if (!trimmed) return `${SOURCE_BASE_URLS.kalshi}/browse`;

  const upper = trimmed.toUpperCase();
  // Multi-leg products (KXMVE*) frequently don't have canonical direct market pages.
  if (upper.startsWith("KXMVE")) {
    return `${SOURCE_BASE_URLS.kalshi}/browse?query=${encodeURIComponent(trimmed)}`;
  }

  const dashIdx = trimmed.indexOf("-");
  if (dashIdx > 0) {
    const series = trimmed.slice(0, dashIdx).toLowerCase();
    const market = trimmed.toLowerCase();
    return `${SOURCE_BASE_URLS.kalshi}/markets/${series}/${market}`;
  }

  return `${SOURCE_BASE_URLS.kalshi}/browse?query=${encodeURIComponent(trimmed)}`;
}

export function getSourceEventUrl(
  source: MarketSource,
  event: Pick<PolymarketEvent, "id" | "slug"> | undefined,
): string | undefined {
  const slug =
    source === "kalshi"
      ? event?.slug?.trim() || event?.id?.trim()
      : event?.slug?.trim();
  if (!slug) return undefined;
  if (source === "kalshi") {
    return kalshiWebUrlFromSlug(slug);
  }
  return `${SOURCE_BASE_URLS.polymarket}/event/${slug}`;
}

export function getSourceMarketUrl(
  source: MarketSource,
  market:
    | Pick<PolymarketMarket, "id" | "slug" | "marketSlug" | "ticker">
    | undefined,
): string | undefined {
  const slug =
    market?.slug?.trim() ||
    market?.marketSlug?.trim() ||
    market?.ticker?.trim() ||
    market?.id?.trim();
  if (!slug) return undefined;
  if (source === "kalshi") {
    return kalshiWebUrlFromSlug(slug);
  }
  return `${SOURCE_BASE_URLS.polymarket}/market/${slug}`;
}

export async function fetchEvents(
  limit = 20,
  closed = false,
  source: MarketSource = "polymarket",
): Promise<PolymarketEvent[]> {
  const search = new URLSearchParams();
  search.set("limit", String(limit));
  search.set("closed", String(closed));
  if (source !== "polymarket") search.set("source", source);

  const res = await fetch(`${sourcePath(source)}/events?${search.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as { error?: string }).error;
    if (msg) throw new Error(msg);
    return asArrayPayload<PolymarketEvent>(data, "events");
  }
  const data = await res.json();
  return asArrayPayload<PolymarketEvent>(data, "events");
}

export async function fetchMarkets(
  limit = 50,
  source: MarketSource = "polymarket",
): Promise<PolymarketMarket[]> {
  const search = new URLSearchParams();
  search.set("limit", String(limit));
  if (source !== "polymarket") search.set("source", source);

  const res = await fetch(`${sourcePath(source)}/markets?${search.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as { error?: string }).error;
    if (msg) throw new Error(msg);
    return asArrayPayload<PolymarketMarket>(data, "markets");
  }
  const data = await res.json();
  return asArrayPayload<PolymarketMarket>(data, "markets");
}

export interface TradesTimeBucket {
  bucketStart: string;
  bucketEnd: string;
  volume: number;
  tradeCount: number;
}

export interface WhaleTrader {
  address: string;
  volume: number;
  tradeCount: number;
  shareOfTotalVolume: number;
}

export interface PreDeadlineWindow {
  windowHours: number;
  windowStart: string;
  windowEnd: string;
  volume: number;
  tradeCount: number;
  shareOfTotalVolume: number;
}

export interface TradesAnalytics {
  totalTrades: number;
  totalVolume: number;
  uniqueTraders: number;
  uniqueMarkets: number;
  timeRange: {
    earliest: string;
    latest: string;
  };
  byTime: TradesTimeBucket[];
  perMarket: {
    conditionId: string;
    volume: number;
    tradeCount: number;
  }[];
  whaleTraders: WhaleTrader[];
  preDeadlineWindow: PreDeadlineWindow;
}

export interface TradesAnalyticsResponse {
  analytics: TradesAnalytics;
  count: number;
}

export interface TradesAnalyticsParams {
  market?: string;
  eventId?: string;
  user?: string;
  side?: "BUY" | "SELL";
  windowHours?: number;
  limit?: number;
  source?: MarketSource;
}

export async function fetchTradesAnalytics(
  params: TradesAnalyticsParams = {},
): Promise<TradesAnalyticsResponse> {
  const search = new URLSearchParams();
  if (params.market) search.set("market", params.market);
  if (params.eventId) search.set("eventId", params.eventId);
  if (params.user) search.set("user", params.user);
  if (params.side) search.set("side", params.side);
  if (params.windowHours != null) {
    search.set("windowHours", String(params.windowHours));
  }
  if (params.source && params.source !== "polymarket") {
    search.set("source", params.source);
  }
  // Backend pages the Data API internally; limit/offset are not used for analytics.

  const res = await fetch(
    `${API_BASE}/markets/trades-analytics?${search.toString()}`,
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to fetch trades analytics");
  }
  return data as TradesAnalyticsResponse;
}

export async function streamChatMessage(
  message: string,
  onChunk: (chunk: string) => void,
  context?: string,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, context, history }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? "Chat request failed",
    );
  }
  if (!res.body) {
    throw new Error("Streaming is not supported: response body is null");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") return;
      let parsed: { delta?: string; error?: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.delta) onChunk(parsed.delta);
    }
  }
}

export interface PolymarketEvent {
  id: string;
  source?: MarketSource;
  slug?: string;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  creationDate?: string;
  closed?: boolean;
  markets?: PolymarketMarket[];
  groupItemTitle?: string;
  category?: string;
  /** TrustMeBro / Gamma tag-derived categories for filtering */
  tmCategories?: string[];
}

export interface PolymarketMarket {
  id: string;
  source?: MarketSource;
  eventId?: string;
  ticker?: string;
  eventTicker?: string;
  question: string;
  conditionId?: string;
  slug?: string;
  outcomePrices?: string;
  yesAsk?: string;
  yesBid?: string;
  price?: string;
  volume?: number;
  volumeNum?: number;
  liquidity?: number;
  clobTokenIds?: string;
  endDate?: string;
  marketSlug?: string;
  groupItemTitle?: string;
  category?: string;
  tmCategories?: string[];
}
