const API_BASE = '/api';

export async function fetchEvents(limit = 20, closed = false): Promise<PolymarketEvent[]> {
  const res = await fetch(
    `${API_BASE}/markets/events?limit=${limit}&closed=${closed}`
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

export async function sendChatMessage(
  message: string,
  context?: string
): Promise<{ reply: string }> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Chat request failed');
  return data;
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
}
