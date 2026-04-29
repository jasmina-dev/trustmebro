/**
 * GET /api/debug/divergence
 *
 * Diagnostic probe for the cross-venue divergence pipeline. Fetches 20
 * active Politics markets from each venue so we can inspect the actual
 * title formats before writing fuzzy-matching logic against them.
 *
 * Bypasses the Upstash cache on purpose.
 */

import { NextResponse } from "next/server";
import { hasPmxtKey } from "@/lib/pmxt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PMXT = "https://api.pmxt.dev/v0/markets";

async function fetchRaw(exchange: "polymarket" | "kalshi") {
  const url = `${PMXT}?exchange=${exchange}&limit=20&category=Politics`;
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.PMXT_API_KEY}` },
    cache: "no-store",
  });
  const elapsedMs = Date.now() - t0;
  if (!res.ok) return { error: `HTTP ${res.status}`, elapsedMs, url };
  const json = (await res.json()) as {
    data?: Array<Record<string, unknown>>;
    meta?: Record<string, unknown>;
  };
  const data = json.data ?? [];
  return {
    url,
    elapsedMs,
    meta: json.meta,
    resultCount: data.length,
    firstTitles: data
      .slice(0, 5)
      .map((m) => String(m.title ?? "")),
    firstMarket: data[0] ?? null,
  };
}

export async function GET() {
  if (!hasPmxtKey()) {
    return NextResponse.json(
      { error: "PMXT_API_KEY missing — cannot probe live data" },
      { status: 400 },
    );
  }

  const [poly, kalshi] = await Promise.all([
    fetchRaw("polymarket"),
    fetchRaw("kalshi"),
  ]);
  return NextResponse.json({ poly, kalshi });
}
