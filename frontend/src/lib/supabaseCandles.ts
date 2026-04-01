import type { TradesTimeBucket } from "../api/client";
import { getSupabaseBrowserClient } from "./supabaseClient";

type RpcRow = { bucket_start: string; volume: number | string | null };

function rowsToBuckets(rows: RpcRow[] | null): TradesTimeBucket[] {
  if (!rows?.length) return [];
  const out: TradesTimeBucket[] = [];
  for (const r of rows) {
    if (r.bucket_start == null) continue;
    const startMs = new Date(r.bucket_start).getTime();
    if (!Number.isFinite(startMs)) continue;
    const vol = Number(r.volume);
    out.push({
      bucketStart: new Date(r.bucket_start).toISOString(),
      bucketEnd: new Date(startMs + 3_600_000).toISOString(),
      volume: Number.isFinite(vol) ? vol : 0,
      tradeCount: 0,
    });
  }
  return out.sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));
}

export async function fetchGlobalHourlyCashflowFromSupabase(
  sinceIso: string,
): Promise<TradesTimeBucket[]> {
  const sb = getSupabaseBrowserClient();
  if (!sb) return [];
  const { data, error } = await sb.rpc("aggregate_hourly_cashflow_global", {
    p_since: sinceIso,
  });
  if (error) {
    console.warn("Supabase aggregate_hourly_cashflow_global:", error.message);
    return [];
  }
  return rowsToBuckets(data as RpcRow[] | null);
}

export async function fetchHourlyCashflowForPolymarketIds(
  sinceIso: string,
  polymarketIds: string[],
): Promise<TradesTimeBucket[]> {
  const sb = getSupabaseBrowserClient();
  if (!sb || polymarketIds.length === 0) return [];
  const { data, error } = await sb.rpc(
    "aggregate_hourly_cashflow_for_polymarket_ids",
    {
      p_since: sinceIso,
      p_polymarket_ids: polymarketIds,
    },
  );
  if (error) {
    console.warn(
      "Supabase aggregate_hourly_cashflow_for_polymarket_ids:",
      error.message,
    );
    return [];
  }
  return rowsToBuckets(data as RpcRow[] | null);
}
