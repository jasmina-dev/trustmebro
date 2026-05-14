/**
 * Shared type definitions.
 *
 * Mirrors the PMXT unified schema
 * (https://pmxt.dev/docs/concepts/unified-schema) and extends it with
 * local-only types for inefficiency analysis, chat, and chart context.
 *
 * Field names here MUST stay in lockstep with the Router response shape
 * (`GET https://api.pmxt.dev/v0/markets`) because we pass through JSON
 * without remapping.
 */

// ---------------------------------------------------------------------------
// PMXT unified schema
// ---------------------------------------------------------------------------

/**
 * Canonical exchange identifiers used throughout the app.
 *
 * @remarks
 * Mirrors the Router's normalized venue names.
 */
export type Exchange = "polymarket" | "kalshi";

/**
 * Venue filter used by the dashboard UI.
 *
 * @remarks
 * `"all"` means cross-venue view (no exchange param on `/api/markets`).
 */
export type ExchangeFilter = "all" | Exchange;

/**
 * A single outcome/contract within a unified market.
 *
 * @remarks
 * For binary markets, outcomes typically include "Yes" and "No", but the Router
 * schema supports arbitrary labels and multi-outcome markets.
 */
export interface UnifiedOutcome {
  outcomeId: string;
  marketId: string;
  label: string;
  price: number;
  priceChange24h?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Unified market shape returned by the PMXT Router.
 *
 * @remarks
 * This is the primary domain object flowing through:
 * - `/api/markets` (UI lists, charts, and KPIs)
 * - resolution bias + calibration computations (closed markets)
 * - cross-venue divergence matching
 */
export interface UnifiedMarket {
  marketId: string;
  eventId?: string | null;
  title: string;
  slug?: string | null;
  description?: string | null;
  url?: string | null;
  image?: string | null;
  category?: string | null;
  tags?: string[] | null;
  volume: number;
  volume24h: number;
  liquidity: number;
  resolutionDate?: string | null;
  tickSize?: number | null;
  /**
   * Venue status — `active`, `closed`, `resolved`, or venue-specific values.
   * We treat `resolved` as terminal (has an outcome) and `closed` as "no
   * longer trading but not necessarily resolved yet".
   */
  status?: string | null;
  contractAddress?: string | null;
  sourceExchange?: string;
  exchange?: Exchange;
  outcomes: UnifiedOutcome[];
  /**
   * Implied YES probability before terminal settlement (mock seed / enrichment).
   * When absent and YES prices are ~0/~1, calibration skips the row — APIs
   * rarely expose pre-close snapshots on resolved contracts.
   */
  preResolutionYesPrice?: number;
}

/**
 * OHLCV candle used by price charts and late-breaking mismatch detection.
 */
export interface PriceCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Raw PMXT Router response envelope for list endpoints.
 */
export interface RouterResponse<T> {
  data: T[];
  meta: { count: number; limit: number; offset: number };
}

// ---------------------------------------------------------------------------
// Inefficiency analytics
// ---------------------------------------------------------------------------

export type InefficiencyType =
  | "resolution_bias"
  | "cross_venue_divergence"
  | "liquidity_gap"
  | "late_breaking_mismatch";

/**
 * A single flagged inefficiency row shown in the leaderboard.
 *
 * @remarks
 * This is a UI-first payload: it includes pre-formatted details and optional
 * fields that depend on `type` (e.g. counterparty exchange for divergence).
 */
export interface InefficiencyScore {
  id: string;
  marketId: string;
  title: string;
  url?: string | null;
  exchange: Exchange;
  category: string;
  type: InefficiencyType;
  score: number;
  details: string;
  /** Companion market from the other venue, if this is a divergence flag. */
  counterpartyMarketId?: string;
  counterpartyExchange?: Exchange;
  spread?: number;
  noResolutionRate?: number;
  zScore?: number;
  liquidityRatio?: number;
  /** Population stats attached to liquidity_gap rows so the UI can plot
   *  where this market sits on the overall Vol/Liq distribution. */
  liquidityPopulation?: {
    mean: number;
    sd: number;
    threshold: number;
    n: number;
  };
  lastUpdated: string;
}

/**
 * Aggregated resolution-bias statistics for one category × exchange bucket.
 */
export interface ResolutionBiasBucket {
  category: string;
  exchange: Exchange;
  total: number;
  yesResolved: number;
  noResolved: number;
  noRate: number;
  yesRate: number;
  zScore: number;
  /** Markets that resolved but weren't a clean YES/NO binary (multi-outcome,
   *  dropped outcome labels, etc.). Surfaced so the UI can hint when a
   *  bucket's `total` significantly understates its population. */
  ambiguous?: number;
  /** True when noRate > 0.65 — matches the inefficiency-leaderboard flag. */
  flagged?: boolean;
  /** True when total < 30 — the z-score should not be trusted. */
  lowSample?: boolean;
}

/**
 * Single calibration bucket (decile) used by the calibration curve chart.
 */
export interface CalibrationBucket {
  bucketIndex: number;
  /** Bucket lower bound in [0,1] (e.g. 0.0, 0.1, 0.2…). */
  bucketStart: number;
  bucketEnd: number;
  /** Sample-weighted mean priceAtClose inside the bucket. */
  meanPrice: number;
  /** Actual YES-resolution rate inside the bucket. */
  resolutionRate: number;
  count: number;
}

/**
 * Monthly efficiency aggregate used by the efficiency timeline chart.
 */
export interface EfficiencyMonth {
  /** `YYYY-MM` — sortable. */
  month: string;
  polymarket?: number;
  kalshi?: number;
  polymarketN?: number;
  kalshiN?: number;
  polymarketVolume?: number;
  kalshiVolume?: number;
}

/**
 * Calibration curve series for one exchange and category.
 */
export interface CalibrationSeries {
  exchange: Exchange;
  category: string;
  buckets: CalibrationBucket[];
  totalMarkets: number;
}

/**
 * A matched Polymarket ↔ Kalshi market pair with spread metadata.
 */
export interface DivergentPair {
  pairId: string;
  polyMarketId: string;
  kalshiMarketId: string;
  polyTitle: string;
  kalshiTitle: string;
  polyYes: number;
  kalshiYes: number;
  /** Absolute YES-price spread, in [0,1]. */
  spread: number;
  /** Same spread formatted as percentage points (e.g. 4.2). */
  spreadPP: number;
  /** String-similarity rating in [0,1]. */
  similarityScore: number;
  category: string;
  arbitrageDirection: "buy_kalshi" | "buy_poly";
  polyVolume24h: number;
  kalshiVolume24h: number;
}

/**
 * Generic histogram bucket used by multiple distribution charts.
 */
export interface DistributionBucket {
  bucketStart: number;
  bucketEnd: number;
  count: number;
  label: string;
}

/**
 * Simplified market pair used by older pairing utilities.
 */
export interface MarketPair {
  pairId: string;
  title: string;
  polyMarketId: string;
  kalshiMarketId: string;
  polyYesPrice: number;
  kalshiYesPrice: number;
  spread: number;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/**
 * Chat message stored in the dashboard store.
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

/**
 * Minimal, serializable snapshot of the dashboard state for LLM prompts.
 *
 * @remarks
 * Kept intentionally small to limit token usage and avoid leaking unnecessary
 * data into the chat system prompt.
 */
export interface DashboardContextSnapshot {
  filters: {
    venue: ExchangeFilter;
    category: string;
    dateRange: { start: string; end: string };
  };
  activeChart: string;
  visibleMarkets: Array<
    Pick<
      UnifiedMarket,
      "marketId" | "title" | "exchange" | "category" | "volume24h" | "liquidity"
    >
  >;
  inefficiencyScores: InefficiencyScore[];
  resolutionStats: ResolutionBiasBucket[];
}

// ---------------------------------------------------------------------------
// API envelope — every route wraps its payload with this shape so clients can
// uniformly render cache state + errors.
// ---------------------------------------------------------------------------

/**
 * Standard response envelope returned by every JSON API route.
 *
 * @remarks
 * This allows the UI to display cache state and data provenance consistently,
 * regardless of which endpoint is being queried.
 */
export interface ApiEnvelope<T> {
  data: T;
  cache: "HIT" | "MISS" | "BYPASS";
  fetchedAt: string;
  source: "pmxt" | "archive" | "mock" | "computed";
}
