import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Hourly (or manual) Polymarket → Supabase sync: top Gamma markets + Data API trades
 * aggregated into 1h OHLCV candles, plus sync_state.
 *
 * Secrets (Supabase Dashboard → Edge Functions → Secrets):
 * - SYNC_CRON_SECRET (optional): require header x-sync-secret with this value
 *
 * Env (auto in Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: POLYMARKET_GAMMA_URL, POLYMARKET_DATA_URL, GAMMA_MARKET_LIMIT, FETCH_WINDOW_HOURS
 *
 * Troubleshooting “no rows in Supabase”:
 * - Invoke the function (cron or POST). It does not run until called.
 * - Hosted schedule: migrations `20260413120000_polymarket_sync_pg_cron.sql` + follow-ups (pg_cron + pg_net) plus Vault
 *   secrets `invoke_sync_polymarket_candles_url` and `invoke_sync_polymarket_candles_authorization`; then `supabase db push`.
 *   Vault auth value: legacy JWT (eyJ...) uses Bearer+apikey; new keys (sb_publishable_/sb_secret_) use apikey header only.
 * - If SYNC_CRON_SECRET is set, send header x-sync-secret with the same value (401 = blocked); mirror in Vault as
 *   `invoke_sync_polymarket_candles_x_sync_secret` for cron.
 * - Apply DB migrations (markets, market_price_candles, sync_state).
 * - Check Edge Function Logs for JSON error body; redeploy after code changes.
 */

const GAMMA_DEFAULT = "https://gamma-api.polymarket.com";
const DATA_DEFAULT = "https://data-api.polymarket.com";
const DATA_PAGE_LIMIT = 10_000;
const DATA_OFFSETS = [0, 10_000] as const;
const MARKET_CHUNK = 8;
const MAX_MARKET_CHUNKS = 8;
const BUCKET_SIZE = "1h";
const BUCKET_SEC = 3600;
const UPSERT_CHUNK = 200;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

type GammaSeriesRef = { slug?: string; title?: string; ticker?: string };
type GammaEventRef = {
  seriesSlug?: string;
  series?: GammaSeriesRef[];
  title?: string;
};

type GammaMarket = {
  id?: string;
  conditionId?: string;
  condition_id?: string;
  question?: string;
  category?: string;
  slug?: string;
  createdAt?: string;
  creationDate?: string;
  endDate?: string;
  closed?: boolean;
  umaResolutionStatus?: string;
  groupItemTitle?: string;
  groupItemThreshold?: string;
  volumeNum?: number;
  volume?: number;
  liquidity?: number;
  events?: GammaEventRef[];
  sportsMarketType?: string;
};

/** Labels like "20°C", "12-3", "99%" are outcomes/thresholds, not taxonomy categories. */
function looksLikeOutcomeOrThresholdLabel(s: string): boolean {
  const t = s.trim();
  if (t.length === 0) return true;
  if (/[°℃℉]|\bdeg(?:rees?)?\s*[cf]\b|celsius|fahrenheit/i.test(t)) {
    return true;
  }
  if (/^\d+(\.\d+)?\s*°?\s*[cf]?\s*$/i.test(t)) return true;
  if (/^\d+(\.\d+)?\s*[-–]\s*\d+(\.\d+)?$/.test(t)) return true;
  if (/^\d+(\.\d+)?%$/.test(t)) return true;
  return false;
}

function humanizeSlug(slug: string): string {
  const s = slug.replace(/-/g, " ").trim();
  if (!s) return slug;
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Prefer event → series (real taxonomy). Never use groupItemTitle (often "20°C", scores, etc.).
 */
function deriveMarketCategory(m: GammaMarket): string | null {
  const ev = Array.isArray(m.events) && m.events.length ? m.events[0] : undefined;
  const series0 = Array.isArray(ev?.series) && ev!.series!.length
    ? ev!.series![0]
    : undefined;

  const fromSeriesTitle = series0?.title?.trim();
  if (fromSeriesTitle && !looksLikeOutcomeOrThresholdLabel(fromSeriesTitle)) {
    return fromSeriesTitle;
  }

  const slug = (series0?.slug || series0?.ticker || ev?.seriesSlug)?.trim();
  if (slug && !looksLikeOutcomeOrThresholdLabel(slug)) {
    return humanizeSlug(slug);
  }

  const raw = typeof m.category === "string" ? m.category.trim() : "";
  if (raw && !looksLikeOutcomeOrThresholdLabel(raw)) return raw;

  if (
    typeof m.sportsMarketType === "string" &&
    m.sportsMarketType.trim().length > 0
  ) {
    return "Sports";
  }

  return null;
}

type DataTrade = {
  timestamp?: number | string;
  conditionId?: string;
  condition_id?: string;
  price?: number | string;
  size?: number | string;
  side?: string;
  proxyWallet?: string;
  transactionHash?: string;
  transaction_hash?: string;
};

function tradeConditionId(t: DataTrade): string {
  const raw = t.conditionId ?? t.condition_id;
  return raw != null ? String(raw) : "";
}

function tradeTxHash(t: DataTrade): string {
  const raw = t.transactionHash ?? t.transaction_hash;
  return raw != null ? String(raw) : "";
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function oneYearAgoIso(): string {
  const d = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 19) + "Z";
}

function tradeTsSeconds(t: DataTrade): number | null {
  const raw = t.timestamp;
  if (raw == null) return null;
  let ts = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(ts)) return null;
  if (ts > 10 ** 12) ts = Math.floor(ts / 1000);
  return ts;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function checkCronSecret(req: Request): Response | null {
  const secretRaw = Deno.env.get("SYNC_CRON_SECRET");
  const secret = secretRaw?.trim();
  if (!secret) return null;
  const hdr = req.headers.get("x-sync-secret")?.trim() ?? "";
  if (hdr !== secret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  return null;
}

async function fetchJson<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs = 25_000, ...rest } = init ?? {};
  const ctrl = AbortSignal.timeout(timeoutMs);
  const r = await fetch(url, { ...rest, signal: ctrl });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status} ${url}: ${text.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}

async function fetchGammaMarkets(
  gammaBase: string,
  limit: number,
): Promise<GammaMarket[]> {
  const q = new URLSearchParams({
    limit: String(limit),
    start_date_min: oneYearAgoIso(),
    closed: "false",
    active: "true",
    order: "volume",
    ascending: "false",
  });
  const data = await fetchJson<unknown>(`${gammaBase}/markets?${q}`);
  if (!Array.isArray(data)) return [];
  return data.filter((x): x is GammaMarket => x != null && typeof x === "object");
}

async function fetchTradesPage(
  dataBase: string,
  params: Record<string, string>,
): Promise<DataTrade[]> {
  const q = new URLSearchParams(params);
  const data = await fetchJson<unknown>(`${dataBase}/trades?${q}`);
  return Array.isArray(data) ? data.filter((x): x is DataTrade => x != null && typeof x === "object") : [];
}

/** Pull trades newer than minTsSec (unix seconds) using global feed + batched markets (backend-aligned). */
async function collectTrades(
  dataBase: string,
  conditionIds: string[],
  minTsSec: number,
): Promise<DataTrade[]> {
  const seen = new Set<string>();
  const out: DataTrade[] = [];

  const consider = (batch: DataTrade[]) => {
    for (const t of batch) {
      const ts = tradeTsSeconds(t);
      if (ts == null || ts < minTsSec) continue;
      const h = tradeTxHash(t);
      const cid = tradeConditionId(t);
      const k = `${h}:${ts}:${cid}:${t.side}:${t.size}:${t.price}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  };

  for (const offset of DATA_OFFSETS) {
    const batch = await fetchTradesPage(dataBase, {
      limit: String(DATA_PAGE_LIMIT),
      offset: String(offset),
    });
    consider(batch);
    if (batch.length < DATA_PAGE_LIMIT) break;
  }

  const maxChunks = Math.min(
    MAX_MARKET_CHUNKS,
    Math.ceil(conditionIds.length / MARKET_CHUNK) || 0,
  );
  for (let i = 0; i < maxChunks; i++) {
    const chunk = conditionIds.slice(i * MARKET_CHUNK, (i + 1) * MARKET_CHUNK);
    if (!chunk.length) break;
    const batch = await fetchTradesPage(dataBase, {
      limit: String(DATA_PAGE_LIMIT),
      offset: "0",
      market: chunk.join(","),
    });
    consider(batch);
  }

  return out;
}

function gammaToMarketRow(m: GammaMarket): {
  polymarket_id: string;
  question: string;
  category: string | null;
  resolved_at: string | null;
  extra: Record<string, unknown>;
} | null {
  const cid = m.conditionId ?? m.condition_id;
  if (!cid) return null;
  const question = String(m.question ?? "").trim() || "(no question)";
  const category = deriveMarketCategory(m);
  let resolved_at: string | null = null;
  if (m.closed === true || m.umaResolutionStatus === "resolved") {
    if (m.endDate) {
      const d = new Date(m.endDate);
      if (!Number.isNaN(d.getTime())) resolved_at = d.toISOString();
    }
    if (resolved_at == null) resolved_at = new Date().toISOString();
  }
  const createdRaw = m.createdAt ?? m.creationDate;
  const extra: Record<string, unknown> = {
    gammaId: m.id ?? null,
    slug: m.slug ?? null,
    endDate: m.endDate ?? null,
    volumeNum: m.volumeNum ?? m.volume ?? null,
    liquidity: m.liquidity ?? null,
    gammaCreatedAt: createdRaw ?? null,
    groupItemTitle: m.groupItemTitle ?? null,
    groupItemThreshold: m.groupItemThreshold ?? null,
    sportsMarketType: m.sportsMarketType ?? null,
    gammaCategoryRaw: typeof m.category === "string" ? m.category : null,
    eventSeriesSlug: m.events?.[0]?.seriesSlug ?? null,
  };
  return { polymarket_id: String(cid), question, category, resolved_at, extra };
}

type BucketAgg = {
  points: { ts: number; price: number; vol: number }[];
};

function aggregateHourlyCandles(
  trades: DataTrade[],
): Map<string, Map<number, BucketAgg>> {
  const byMarket = new Map<string, Map<number, BucketAgg>>();
  for (const t of trades) {
    const cid = tradeConditionId(t);
    if (!cid) continue;
    const ts = tradeTsSeconds(t);
    if (ts == null) continue;
    const price = num(t.price);
    const size = num(t.size);
    const vol = size * price;
    const bucket = Math.floor(ts / BUCKET_SEC) * BUCKET_SEC;
    let inner = byMarket.get(cid);
    if (!inner) {
      inner = new Map();
      byMarket.set(cid, inner);
    }
    let agg = inner.get(bucket);
    if (!agg) {
      agg = { points: [] };
      inner.set(bucket, agg);
    }
    agg.points.push({ ts, price, vol });
  }
  return byMarket;
}

function finalizeOhlcv(agg: BucketAgg): {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
} | null {
  if (!agg.points.length) return null;
  agg.points.sort((a, b) => a.ts - b.ts);
  const open = agg.points[0].price;
  const close = agg.points[agg.points.length - 1].price;
  let high = -Infinity;
  let low = Infinity;
  let volume = 0;
  for (const p of agg.points) {
    high = Math.max(high, p.price);
    low = Math.min(low, p.price);
    volume += p.vol;
  }
  return { open, high, low, close, volume };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const denied = checkCronSecret(req);
  if (denied) return denied;

  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "Missing Supabase environment" }, 500);
  }

  const gammaBase = Deno.env.get("POLYMARKET_GAMMA_URL") ?? GAMMA_DEFAULT;
  const dataBase = Deno.env.get("POLYMARKET_DATA_URL") ?? DATA_DEFAULT;
  const gammaLimit = Math.min(
    500,
    Math.max(20, parseInt(Deno.env.get("GAMMA_MARKET_LIMIT") ?? "160", 10) || 160),
  );
  const fetchWindowHours = Math.min(
    168,
    Math.max(1, parseInt(Deno.env.get("FETCH_WINDOW_HOURS") ?? "24", 10) || 24),
  );

  const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey);

  try {
    const { data: syncRow, error: syncErr } = await supabase
      .from("sync_state")
      .select("last_trade_timestamp, last_sync_time")
      .eq("source", "polymarket")
      .maybeSingle();

    if (syncErr) throw new Error(`sync_state: ${syncErr.message}`);

    const nowSec = Math.floor(Date.now() / 1000);
    const windowStartSec = nowSec - fetchWindowHours * 3600;
    let minTsSec = windowStartSec;

    const lastTrade = syncRow?.last_trade_timestamp as string | null | undefined;
    if (lastTrade) {
      const lastSec = Math.floor(new Date(lastTrade).getTime() / 1000);
      if (Number.isFinite(lastSec)) {
        minTsSec = Math.min(nowSec, Math.max(windowStartSec, lastSec - 3600));
      }
    }

    const gammaMarkets = await fetchGammaMarkets(gammaBase, gammaLimit);
    const marketRows = gammaMarkets
      .map(gammaToMarketRow)
      .filter((r): r is NonNullable<typeof r> => r != null);

    const conditionIds = marketRows.map((r) => r.polymarket_id);

    if (marketRows.length) {
      const { error: upErr } = await supabase.from("markets").upsert(marketRows, {
        onConflict: "polymarket_id",
      });
      if (upErr) throw new Error(`markets upsert: ${upErr.message}`);
    }

    const trades = await collectTrades(dataBase, conditionIds, minTsSec);

    const byMarketBucket = aggregateHourlyCandles(trades);

    const candleKeys = [...byMarketBucket.keys()];
    const ID_QUERY_CHUNK = 40;
    let idRows: { id: string; polymarket_id: string }[] = [];
    for (let i = 0; i < candleKeys.length; i += ID_QUERY_CHUNK) {
      const slice = candleKeys.slice(i, i + ID_QUERY_CHUNK);
      const { data, error: idErr } = await supabase
        .from("markets")
        .select("id, polymarket_id")
        .in("polymarket_id", slice);
      if (idErr) throw new Error(`markets select: ${idErr.message}`);
      if (data) idRows = idRows.concat(data);
    }

    const idByCondition = new Map<string, string>();
    for (const row of idRows) {
      if (row.polymarket_id && row.id) {
        idByCondition.set(String(row.polymarket_id), String(row.id));
      }
    }

    const candleRows: {
      market_id: string;
      bucket_start: string;
      bucket_size: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }[] = [];

    for (const [cid, buckets] of byMarketBucket) {
      const marketId = idByCondition.get(cid);
      if (!marketId) continue;
      for (const [bucketSec, agg] of buckets) {
        const ohlc = finalizeOhlcv(agg);
        if (!ohlc) continue;
        candleRows.push({
          market_id: marketId,
          bucket_start: new Date(bucketSec * 1000).toISOString(),
          bucket_size: BUCKET_SIZE,
          ...ohlc,
        });
      }
    }

    let candlesUpserted = 0;
    for (let i = 0; i < candleRows.length; i += UPSERT_CHUNK) {
      const slice = candleRows.slice(i, i + UPSERT_CHUNK);
      const { error: cErr } = await supabase.from("market_price_candles").upsert(slice, {
        onConflict: "market_id,bucket_start,bucket_size",
      });
      if (cErr) throw new Error(`candles upsert: ${cErr.message}`);
      candlesUpserted += slice.length;
    }

    let maxTs: number | null = null;
    for (const t of trades) {
      const ts = tradeTsSeconds(t);
      if (ts != null && (maxTs == null || ts > maxTs)) maxTs = ts;
    }

    const lastTradeIso = maxTs != null
      ? new Date(maxTs * 1000).toISOString()
      : (syncRow?.last_trade_timestamp as string | null) ?? null;

    const { error: stErr } = await supabase.from("sync_state").upsert(
      {
        source: "polymarket",
        last_sync_time: new Date().toISOString(),
        last_trade_timestamp: lastTradeIso,
        metadata: {
          markets_upserted: marketRows.length,
          trades_considered: trades.length,
          candles_upserted: candlesUpserted,
          min_ts_sec: minTsSec,
          fetch_window_hours: fetchWindowHours,
        },
      },
      { onConflict: "source" },
    );
    if (stErr) throw new Error(`sync_state upsert: ${stErr.message}`);

    console.info(
      `sync-polymarket-candles ok: markets=${marketRows.length} trades=${trades.length} candles=${candlesUpserted}`,
    );
    return jsonResponse({
      ok: true,
      markets_upserted: marketRows.length,
      trades_considered: trades.length,
      candles_upserted: candlesUpserted,
      last_trade_timestamp: lastTradeIso,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("sync-polymarket-candles:", message);
    return jsonResponse({ ok: false, error: message }, 502);
  }
});
