/**
 * GET /api/archive
 *
 * Pulls supplementary historical rows from https://archive.pmxt.dev/.
 * The archive format isn't formally documented, so the loader sniffs content
 * type and handles JSON / NDJSON transparently (see lib/pmxt.ts).
 *
 * Query params:
 *   - path  (optional) sub-path under the archive root, default "" (index)
 *
 * Cache key: archive:<path>
 * TTL:       24h (historical data is append-only)
 */

import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/redis";
import { fetchArchive, hasPmxtKey } from "@/lib/pmxt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const key = `archive:${path || "index"}`;

  try {
    const { value, state } = await cached(key, 60 * 60 * 24, async () => {
      if (!hasPmxtKey()) {
        return { source: "mock" as const, rows: [] as unknown[] };
      }
      const result = await fetchArchive(path);
      return {
        source: result ? ("archive" as const) : ("mock" as const),
        rows: result?.rows ?? [],
      };
    });

    return NextResponse.json(
      {
        data: value.rows,
        count: value.rows.length,
        cache: state,
        fetchedAt: new Date().toISOString(),
        source: value.source,
      },
      { headers: { "X-Cache": state, "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[/api/archive] failure", err);
    return NextResponse.json(
      {
        data: [],
        cache: "BYPASS",
        fetchedAt: new Date().toISOString(),
        source: "mock",
        error: (err as Error).message,
      },
      { status: 200, headers: { "X-Cache": "BYPASS" } },
    );
  }
}
