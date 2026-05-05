import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}

function secretMatches(expected: string, provided: string | null): boolean {
  if (!provided) return false;
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
 * In development, requests are allowed if CRON_SECRET is unset (local convenience).
 * In production, CRON_SECRET must be set and must match.
 */
export function requireCronAuthorized(
  request: Request,
): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  const prod =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production";

  if (!secret) {
    if (prod) {
      return NextResponse.json(
        { error: "Unauthorized", detail: "CRON_SECRET is not configured" },
        { status: 401 },
      );
    }
    return null;
  }

  const token = bearerToken(request);
  if (!secretMatches(secret, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Debug routes in production require DEBUG_API_SECRET (Bearer).
 * Unset in dev: open for local debugging. Set anywhere: Bearer must match.
 */
export function requireDebugAuthorized(
  request: Request,
): NextResponse | null {
  const secret = process.env.DEBUG_API_SECRET?.trim();
  const prod =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production";

  if (!secret) {
    if (prod) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          detail:
            "DEBUG_API_SECRET is not set — debug API is disabled in production",
        },
        { status: 401 },
      );
    }
    return null;
  }

  const token = bearerToken(request);
  if (!secretMatches(secret, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
