/**
 * Upstash Redis cache wrapper.
 *
 * Every PMXT call goes through `cached()` first. When Upstash env vars are
 * missing (local dev without a key), we degrade to an in-memory Map cache so
 * the dashboard still works. The `X-Cache` HIT/MISS header always reflects
 * whichever backend we ended up using.
 *
 * With Upstash enabled, `cached()` coordinates MISS handling across all Node
 * processes (`SET NX` lock + poll) so ten simultaneous users do not multiply
 * PMXT pagination traffic — only one worker repopulates each key at a time.
 */

import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Shared client — one REST pool per process for cache + coordination locks.
// ---------------------------------------------------------------------------

let _upstashResolved: boolean | undefined;
let _upstashClient: Redis | null | undefined;

/**
 * Get the shared Upstash Redis REST client for this process.
 *
 * @remarks
 * Returns `null` when Upstash env vars are not configured. Callers should
 * degrade gracefully; the rest of this module uses an in-memory backend
 * in that case.
 */
export function getUpstashRedis(): Redis | null {
  if (_upstashResolved) return _upstashClient ?? null;
  _upstashResolved = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url?.trim() || !token?.trim()) {
    _upstashClient = null;
    return null;
  }
  _upstashClient = new Redis({ url, token });
  return _upstashClient;
}

function coordinateMissEnabled(): boolean {
  return process.env.UPSTASH_COORDINATE_MISS?.trim() !== "false";
}

function coordLockSeconds(): number {
  const raw = process.env.CACHE_COORD_LOCK_SECONDS?.trim();
  if (!raw) return 600;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 60 ? Math.min(n, 3600) : 600;
}

function coordMaxWaitMs(): number {
  const raw = process.env.CACHE_COORD_WAIT_MS?.trim();
  if (!raw) return 240_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 5000 ? Math.min(n, 600_000) : 240_000;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** SET NX returns `"OK"` when the lock row was created; `null` when held elsewhere. */
function nxLockSucceeded(result: unknown): boolean {
  return result === "OK";
}

async function waitForRedisCacheHit<T>(
  backend: CacheBackend,
  key: string,
  maxMs: number,
): Promise<CachedResult<T> | null> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await sleep(250);
    try {
      const hit = (await backend.get(key)) as T | null;
      if (hit !== null && hit !== undefined) {
        return { value: hit, state: "HIT" };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

type CacheBackend = {
  name: "upstash" | "memory";
  get: (key: string) => Promise<unknown | null>;
  set: (key: string, value: unknown, ttlSeconds: number) => Promise<void>;
  del: (key: string) => Promise<void>;
};

let _backend: CacheBackend | null = null;

function getBackend(): CacheBackend {
  if (_backend) return _backend;

  const client = getUpstashRedis();

  if (client) {
    _backend = {
      name: "upstash",
      get: async (key) => {
        return (await client.get(key)) as unknown;
      },
      set: async (key, value, ttlSeconds) => {
        await client.set(key, value, { ex: ttlSeconds });
      },
      del: async (key) => {
        await client.del(key);
      },
    };
  } else {
    const store = new Map<string, { value: unknown; expires: number }>();
    _backend = {
      name: "memory",
      get: async (key) => {
        const entry = store.get(key);
        if (!entry) return null;
        if (entry.expires < Date.now()) {
          store.delete(key);
          return null;
        }
        return entry.value;
      },
      set: async (key, value, ttlSeconds) => {
        store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
      },
      del: async (key) => {
        store.delete(key);
      },
    };
  }

  return _backend;
}

/**
 * Which cache backend is active for this process.
 *
 * @returns `"upstash"` when Upstash env vars are configured, otherwise `"memory"`.
 */
export function cacheBackendName(): "upstash" | "memory" {
  return getBackend().name;
}

// ---------------------------------------------------------------------------
// Public cache helpers
// ---------------------------------------------------------------------------

export type CacheState = "HIT" | "MISS";

export interface CachedResult<T> {
  value: T;
  state: CacheState;
}

/** Single-flight: concurrent MISSes on the same key share one upstream fetch. */
const inflight = new Map<string, Promise<CachedResult<unknown>>>();

/**
 * Wrap a fetcher with read-through caching.
 *
 * Guarantees we never call `fetcher()` when a fresh value is in cache —
 * essential for staying under the PMXT per-minute quota. Cross-process MISS
 * coordination avoids duplicate pagination when many users load at once.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<CachedResult<T>> {
  const backend = getBackend();
  try {
    const hit = (await backend.get(key)) as T | null;
    if (hit !== null && hit !== undefined) {
      return { value: hit, state: "HIT" };
    }
  } catch (err) {
    console.warn(`[cache:${backend.name}] read failed for ${key}`, err);
  }

  const pending = inflight.get(key) as Promise<CachedResult<T>> | undefined;
  if (pending) return pending;

  const redis = getUpstashRedis();
  const useCoord =
    Boolean(redis) && coordinateMissEnabled() && backend.name === "upstash";

  const lockKey = `coord:${key}`;
  const lockEx = coordLockSeconds();
  let holdCoordLock = false;

  if (useCoord && redis) {
    const acquired = await redis.set(lockKey, "1", { nx: true, ex: lockEx });
    if (!nxLockSucceeded(acquired)) {
      const waited = await waitForRedisCacheHit<T>(
        backend,
        key,
        coordMaxWaitMs(),
      );
      if (waited) return waited;

      const retryAcquire = await redis.set(lockKey, "1", {
        nx: true,
        ex: lockEx,
      });
      if (!nxLockSucceeded(retryAcquire)) {
        console.warn(
          `[cache:coord] timed out waiting for ${key} — proceeding may duplicate PMXT work`,
        );
      } else {
        holdCoordLock = true;
      }
    } else {
      holdCoordLock = true;
    }
  }

  const promise = (async (): Promise<CachedResult<T>> => {
    try {
      const fresh = await fetcher();
      try {
        await backend.set(key, fresh, ttlSeconds);
      } catch (err) {
        console.warn(`[cache:${backend.name}] write failed for ${key}`, err);
      }
      return { value: fresh, state: "MISS" };
    } finally {
      if (holdCoordLock && redis) {
        await redis.del(lockKey).catch(() => {
          /* ignore */
        });
      }
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise as Promise<CachedResult<unknown>>);
  return promise;
}

export async function invalidate(key: string): Promise<void> {
  const backend = getBackend();
  await backend.del(key);
}

// ---------------------------------------------------------------------------
// Rate-limit helper (used by /api/chat) — keyed by IP.
// ---------------------------------------------------------------------------

function checkRateLimitInMemory(
  identifier: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): { success: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const bucket =
    (globalThis as unknown as { __memRateLimit?: Map<string, number[]> })
      .__memRateLimit ??
    ((
      globalThis as unknown as { __memRateLimit: Map<string, number[]> }
    ).__memRateLimit = new Map<string, number[]>());
  const hits: number[] = (bucket.get(identifier) ?? []).filter(
    (t: number) => now - t < windowMs,
  );
  if (hits.length >= limit) {
    return {
      success: false,
      remaining: 0,
      reset: hits[0] + windowMs,
    };
  }
  hits.push(now);
  bucket.set(identifier, hits);
  return {
    success: true,
    remaining: limit - hits.length,
    reset: now + windowMs,
  };
}

/**
 * Lightweight ratelimit wrapper. Uses `@upstash/ratelimit` when Upstash is
 * configured and a best-effort in-memory sliding window otherwise.
 *
 * If Upstash is configured but the limit call fails (network, bad token, etc.),
 * we fall back to in-memory limiting so chat still works in production.
 */
export async function checkRateLimit(
  identifier: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const client = getUpstashRedis();

  if (client) {
    try {
      const { Ratelimit } = await import("@upstash/ratelimit");
      const rl = new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
        analytics: false,
        prefix: "rl:chat",
      });
      const { success, remaining, reset } = await rl.limit(identifier);
      return { success, remaining, reset };
    } catch (err) {
      console.warn(
        "[ratelimit] Upstash limiter failed; using in-process fallback",
        err,
      );
    }
  }

  return checkRateLimitInMemory(identifier, { limit, windowSeconds });
}
