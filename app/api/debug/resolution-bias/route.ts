/**
 * GET /api/debug/resolution-bias
 *
 * Diagnostic probe for the resolution-bias pipeline. Fetches 10 closed
 * Sports markets from Polymarket and returns the raw shape so we can see
 * exactly what `status`, `outcomes[].label`, and `resolutionDate` actually
 * look like — before writing any counting logic against them.
 *
 * This route bypasses the Upstash cache on purpose — it's a one-off probe.
 */

import { NextResponse } from "next/server";
import { requireDebugAuthorized } from "@/lib/internalApiAuth";
import { hasPmxtKey } from "@/lib/pmxt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireDebugAuthorized(request);
  if (auth) return auth;

  if (!hasPmxtKey()) {
    return NextResponse.json(
      { error: "PMXT_API_KEY missing — cannot probe live data" },
      { status: 400 },
    );
  }

  const url =
    "https://api.pmxt.dev/v0/markets?closed=true&category=Sports" +
    "&exchange=polymarket&limit=10";

  const t0 = Date.now();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.PMXT_API_KEY}` },
    cache: "no-store",
  });
  const elapsedMs = Date.now() - t0;

  if (!res.ok) {
    return NextResponse.json(
      { error: `PMXT responded ${res.status}`, elapsedMs },
      { status: res.status },
    );
  }

  const json = (await res.json()) as {
    data?: Array<Record<string, unknown>>;
    meta?: Record<string, unknown>;
  };
  const data = json.data ?? [];

  const statusCounts: Record<string, number> = {};
  const labelSamples = new Set<string>();
  const missingResolutionDate: string[] = [];

  for (const m of data) {
    const status = String(m.status ?? "<undefined>");
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;

    const outcomes = Array.isArray(m.outcomes)
      ? (m.outcomes as Array<{ label?: string }>)
      : [];
    for (const o of outcomes) {
      if (o.label) labelSamples.add(o.label);
    }
    if (!m.resolutionDate) {
      missingResolutionDate.push(String(m.marketId ?? "?"));
    }
  }

  return NextResponse.json({
    elapsedMs,
    requestUrl: url,
    meta: json.meta,
    resultCount: data.length,
    statusCounts,
    labelSamples: Array.from(labelSamples),
    missingResolutionDateIds: missingResolutionDate,
    firstMarket: data[0] ?? null,
  });
}
