// utilized github copilot

const API_BASE = "/api";

export async function fetchEvents(
  limit = 20,
  closed = false,
): Promise<PolymarketEvent[]> {
  const res = await fetch(
    `${API_BASE}/markets/events?limit=${limit}&closed=${closed}`,
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return data.events ?? [];
  }
  return res.json();
}

export async function fetchMarkets(limit = 50): Promise<PolymarketMarket[]> {
  const res = await fetch(`${API_BASE}/markets/markets?limit=${limit}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return data.markets ?? [];
  }
  return res.json();
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
  // Use a relatively high default limit so we have enough data
  if (!search.has("limit")) search.set("limit", "1000");

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
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, context, history }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? "Chat request failed",
    );
  }
  const reader = res.body!.getReader();
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
  /** TrustMeBro categories: Politics, Economy, Entertainment, etc. "Other" when none match. */
  tmCategories?: string[];
}

export interface PolymarketMarket {
  id: string;
  question: string;
  conditionId?: string;
  slug?: string;
  outcomePrices?: string;
  volume?: number;
  volumeNum?: number;
  liquidity?: number;
  clobTokenIds?: string;
  endDate?: string;
  marketSlug?: string;
  groupItemTitle?: string;
  category?: string;
  /** TrustMeBro categories: Politics, Economy, Entertainment, etc. "Other" when none match. */
  tmCategories?: string[];
}
