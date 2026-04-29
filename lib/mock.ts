/**
 * Deterministic mock data — used only when PMXT_API_KEY is missing.
 *
 * The goal is a dashboard that still looks alive (and tells a coherent story
 * about resolution bias, divergence, etc.) so you can develop the UI without
 * burning your 25 000 req/month PMXT quota.
 *
 * A seeded PRNG keeps numbers stable across reloads — the mock data doesn't
 * randomly shimmer every render, which would mask real bugs.
 */

import type {
  Exchange,
  PriceCandle,
  ResolutionBiasBucket,
  UnifiedMarket,
} from "./types";
import { proportionZ } from "./utils";

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — identical output every run.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES = ["Sports", "Politics", "Crypto", "Finance", "Other"];

// Bias per (category, exchange). These are the "true" rates we want the
// resolution-bias analytics to recover — NO-heavy on Sports, balanced on
// Politics, mildly YES-leaning on Crypto.
const TRUE_NO_RATES: Record<string, Record<Exchange, number>> = {
  Sports: { polymarket: 0.72, kalshi: 0.68 },
  Politics: { polymarket: 0.51, kalshi: 0.49 },
  Crypto: { polymarket: 0.44, kalshi: 0.46 },
  Finance: { polymarket: 0.58, kalshi: 0.55 },
  Other: { polymarket: 0.53, kalshi: 0.52 },
};

const SAMPLE_TITLES: Record<string, string[]> = {
  Sports: [
    "Will the Chiefs win Super Bowl LIX?",
    "Will Lakers make the 2026 playoffs?",
    "Will Djokovic win Wimbledon 2026?",
    "Will Real Madrid win Champions League?",
    "Will Max Verstappen win the 2026 F1 title?",
    "Will a US team win the 2026 Ryder Cup?",
    "Will the Yankees win the 2026 World Series?",
    "Will McIlroy win a 2026 major?",
  ],
  Politics: [
    "Will the GOP hold the House in 2026?",
    "Will Trump sign a new executive order in Q2 2026?",
    "Will RFK Jr. remain HHS Secretary through 2026?",
    "Will a government shutdown occur in 2026?",
    "Will Biden endorse a 2028 candidate by year-end?",
    "Will there be a SCOTUS vacancy in 2026?",
  ],
  Crypto: [
    "Will BTC close above $150K by Dec 31 2026?",
    "Will ETH flip BTC market cap in 2026?",
    "Will the SEC approve a SOL ETF in 2026?",
    "Will Coinbase stock hit $400 in 2026?",
    "Will any L1 ship zk-rollup mainnet in Q3?",
  ],
  Finance: [
    "Will the Fed cut rates in July 2026?",
    "Will US CPI come in below 3% in June?",
    "Will the S&P 500 close 2026 above 7000?",
    "Will unemployment rise above 5% in 2026?",
    "Will GDP growth exceed 2.5% in Q3?",
  ],
  Other: [
    "Will OpenAI release GPT-6 in 2026?",
    "Will SpaceX reach Mars orbit in 2026?",
    "Will Apple Vision Pro 2 ship in 2026?",
    "Will a nuclear fusion net-gain milestone occur?",
  ],
};

// ---------------------------------------------------------------------------
// Market generators
// ---------------------------------------------------------------------------

function makeMarket(
  rng: () => number,
  exchange: Exchange,
  category: string,
  title: string,
  index: number,
  { closed }: { closed: boolean },
): UnifiedMarket {
  const id = `mock-${exchange}-${category.toLowerCase()}-${index}`;

  // Give paired titles the same intended price +/- a venue-specific skew so
  // that the divergence analytic has something to find.
  const fairYes = 0.15 + 0.7 * rng();
  const venueSkew = exchange === "polymarket" ? -0.02 : 0.02;
  const noise = (rng() - 0.5) * 0.06;
  const yesPrice = closed
    ? Math.random() < TRUE_NO_RATES[category][exchange]
      ? 0.02 + rng() * 0.05
      : 0.95 + rng() * 0.04
    : Math.max(0.01, Math.min(0.99, fairYes + venueSkew + noise));

  const volume24h = Math.round(1_000 + rng() * 400_000);
  const liquidity = Math.round(500 + rng() * 150_000);

  // Liquidity gap signal: ~1 in 15 markets gets a deliberately high volume/
  // liquidity ratio so the scatter plot has outliers.
  const gapSpike = rng() < 0.07 ? 8 + rng() * 6 : 1;
  const adjustedVolume = Math.round(volume24h * gapSpike);

  const marketId = id;
  return {
    marketId,
    eventId: `event-${category.toLowerCase()}-${Math.floor(index / 2)}`,
    title,
    slug: title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 60),
    description: null,
    url: `https://${exchange}.example/markets/${marketId}`,
    image: null,
    category,
    tags: [category.toLowerCase()],
    volume: adjustedVolume * (5 + rng() * 20),
    volume24h: adjustedVolume,
    liquidity,
    resolutionDate: new Date(
      Date.now() + (closed ? -1 : 1) * Math.floor(rng() * 30) * 86400_000,
    ).toISOString(),
    tickSize: 0.01,
    status: closed ? "resolved" : "active",
    contractAddress: null,
    exchange,
    outcomes: [
      {
        outcomeId: `${marketId}-yes`,
        marketId,
        label: "Yes",
        price: yesPrice,
        priceChange24h: (rng() - 0.5) * 0.04,
      },
      {
        outcomeId: `${marketId}-no`,
        marketId,
        label: "No",
        price: 1 - yesPrice,
        priceChange24h: (rng() - 0.5) * 0.04,
      },
    ],
  };
}

/**
 * Full mock market universe — both venues, all categories.
 *
 * Uses a stable seed so every call returns identical data, which keeps
 * SWR / React reconciliation stable during dev.
 */
export function mockMarkets({
  exchange,
  closed = false,
  category,
  limit = 500,
}: {
  exchange?: Exchange;
  closed?: boolean;
  category?: string;
  limit?: number;
}): UnifiedMarket[] {
  const rng = mulberry32(closed ? 4242 : 13_37);
  const exchanges: Exchange[] = exchange
    ? [exchange]
    : ["polymarket", "kalshi"];
  const categories = category ? [category] : CATEGORIES;

  const rows: UnifiedMarket[] = [];
  for (const cat of categories) {
    const titles = SAMPLE_TITLES[cat] ?? SAMPLE_TITLES.Other;
    for (const ex of exchanges) {
      // Generate ~35 markets per (category, exchange) pair when active, and
      // ~120 when closed so the resolution-bias histogram has volume.
      const count = closed ? 120 : 35;
      for (let i = 0; i < count; i++) {
        const title = titles[i % titles.length];
        rows.push(
          makeMarket(
            rng,
            ex,
            cat,
            // Add index variation so titles aren't identical (otherwise the
            // divergence matcher treats every clone as the same pair).
            i < titles.length ? title : `${title} #${i}`,
            i,
            { closed },
          ),
        );
      }
    }
  }

  return rows.slice(0, limit);
}

/**
 * Resolution outcome labels for closed markets — derived from TRUE_NO_RATES
 * so the computed NO-rate stats match the "ground truth" bias we seeded in.
 */
export function assignResolutionLabels(markets: UnifiedMarket[]): UnifiedMarket[] {
  const rng = mulberry32(9001);
  return markets.map((m) => {
    if ((m.status ?? "").toLowerCase() !== "resolved") return m;
    const cat = m.category ?? "Other";
    const ex = (m.exchange ?? "polymarket") as Exchange;
    const noRate = TRUE_NO_RATES[cat]?.[ex] ?? 0.5;
    const resolveNo = rng() < noRate;
    return {
      ...m,
      outcomes: m.outcomes.map((o) => {
        if (/^yes$/i.test(o.label))
          return { ...o, price: resolveNo ? 0.01 : 0.99 };
        if (/^no$/i.test(o.label))
          return { ...o, price: resolveNo ? 0.99 : 0.01 };
        return o;
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// OHLCV
// ---------------------------------------------------------------------------

export function mockOhlcv(
  outcomeId: string,
  { limit = 168 }: { limit?: number } = {},
): PriceCandle[] {
  // Seed from the outcomeId so every call for the same outcome is stable.
  let h = 0;
  for (let i = 0; i < outcomeId.length; i++) {
    h = (h * 31 + outcomeId.charCodeAt(i)) >>> 0;
  }
  const rng = mulberry32(h);

  const now = Date.now();
  const hour = 3_600_000;
  let price = 0.2 + rng() * 0.6;
  const candles: PriceCandle[] = [];

  for (let i = limit - 1; i >= 0; i--) {
    const open = price;
    const drift = (rng() - 0.5) * 0.02;
    const high = Math.min(0.99, open + Math.abs(drift) + rng() * 0.015);
    const low = Math.max(0.01, open - Math.abs(drift) - rng() * 0.015);
    const close = Math.min(0.99, Math.max(0.01, open + drift));
    candles.push({
      timestamp: now - i * hour,
      open,
      high,
      low,
      close,
      volume: Math.round(1_000 + rng() * 25_000),
    });
    price = close;
  }
  return candles;
}

// ---------------------------------------------------------------------------
// Pre-computed resolution-bias buckets (used when PMXT_API_KEY is missing and
// we want to show buckets without running the full pipeline on every route).
// ---------------------------------------------------------------------------

export function mockResolutionBuckets(): ResolutionBiasBucket[] {
  const buckets: ResolutionBiasBucket[] = [];
  for (const category of CATEGORIES) {
    for (const ex of ["polymarket", "kalshi"] as Exchange[]) {
      const rate = TRUE_NO_RATES[category][ex];
      const total = 120;
      const noResolved = Math.round(total * rate);
      const yesResolved = total - noResolved;
      const noRate = noResolved / total;
      buckets.push({
        category,
        exchange: ex,
        total,
        yesResolved,
        noResolved,
        noRate,
        yesRate: 1 - noRate,
        zScore: proportionZ(noRate, total, 0.5),
      });
    }
  }
  return buckets;
}
