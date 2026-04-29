/**
 * Upstash Redis cache wrapper.
 *
 * Every PMXT call goes through `cached()` first. When Upstash env vars are
 * missing (local dev without a key), we degrade to an in-memory Map cache so
 * the dashboard still works. The `X-Cache` HIT/MISS header always reflects
 * whichever backend we ended up using.
 */

import { Redis } from "@upstash/redis";

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

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const client = new Redis({ url, token });
    _backend = {
      name: "upstash",
      get: async (key) => {
        // Upstash auto-deserializes JSON values it previously stored.
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

/**
 * Wrap a fetcher with read-through caching.
 *
 * Guarantees we never call `fetcher()` when a fresh value is in cache —
 * essential for staying under the PMXT 60 req/min & 25 000 req/month budget.
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

  const fresh = await fetcher();

  // Fire-and-forget the write — readers shouldn't block on the cache.
  backend.set(key, fresh, ttlSeconds).catch((err) => {
    console.warn(`[cache:${backend.name}] write failed for ${key}`, err);
  });

  return { value: fresh, state: "MISS" };
}

export async function invalidate(key: string): Promise<void> {
  const backend = getBackend();
  await backend.del(key);
}

// ---------------------------------------------------------------------------
// Rate-limit helper (used by /api/chat) — keyed by IP.
// ---------------------------------------------------------------------------

/**
 * Lightweight ratelimit wrapper. Uses `@upstash/ratelimit` when Upstash is
 * configured and a best-effort in-memory sliding window otherwise.
 */
export async function checkRateLimit(
  identifier: string,
  {
    limit,
    windowSeconds,
  }: { limit: number; windowSeconds: number },
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const { Ratelimit } = await import("@upstash/ratelimit");
    const client = new Redis({ url, token });
    const rl = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      analytics: false,
      prefix: "rl:chat",
    });
    const { success, remaining, reset } = await rl.limit(identifier);
    return { success, remaining, reset };
  }

  // In-memory fallback.
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const bucket = (globalThis as any).__memRateLimit ??
    ((globalThis as any).__memRateLimit = new Map<string, number[]>());
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
