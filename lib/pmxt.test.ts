/** @jest-environment node */

import { hasPmxtKey, resolveArchiveRequestUrl, resolveOhlcvId } from "./pmxt";
import type { UnifiedMarket, UnifiedOutcome } from "./types";

describe("hasPmxtKey", () => {
  const prev = process.env.PMXT_API_KEY;

  afterEach(() => {
    if (prev === undefined) delete process.env.PMXT_API_KEY;
    else process.env.PMXT_API_KEY = prev;
  });

  test("is true only when key starts with pmxt_", () => {
    delete process.env.PMXT_API_KEY;
    expect(hasPmxtKey()).toBe(false);

    process.env.PMXT_API_KEY = "sk_live_xyz";
    expect(hasPmxtKey()).toBe(false);

    process.env.PMXT_API_KEY = "pmxt_test_123";
    expect(hasPmxtKey()).toBe(true);
  });
});

describe("resolveOhlcvId", () => {
  test("returns numeric outcomeId for Polymarket when digits-only", () => {
    const market: Pick<UnifiedMarket, "marketId" | "exchange"> = {
      marketId: "m1",
      exchange: "polymarket",
    };
    const outcome: Pick<UnifiedOutcome, "outcomeId" | "metadata"> = {
      outcomeId: "123456789012345678901234567890",
      metadata: {},
    };
    expect(resolveOhlcvId(market, outcome)).toBe(outcome.outcomeId);
  });

  test("returns non-numeric Polymarket outcomeId as-is", () => {
    const market: Pick<UnifiedMarket, "marketId" | "exchange"> = {
      marketId: "m1",
      exchange: "polymarket",
    };
    const outcome: Pick<UnifiedOutcome, "outcomeId" | "metadata"> = {
      outcomeId: "clob-token-abc",
      metadata: {},
    };
    expect(resolveOhlcvId(market, outcome)).toBe("clob-token-abc");
  });

  test("returns Kalshi ticker from outcomeId when shape matches", () => {
    const market: Pick<UnifiedMarket, "marketId" | "exchange"> & {
      metadata?: Record<string, unknown>;
    } = {
      marketId: "IGNORED",
      exchange: "kalshi",
    };
    const outcome: Pick<UnifiedOutcome, "outcomeId" | "metadata"> = {
      outcomeId: "FED-25JAN29-B4.75",
      metadata: {},
    };
    expect(resolveOhlcvId(market, outcome)).toBe("FED-25JAN29-B4.75");
  });

  test("falls back to metadata ticker for Kalshi", () => {
    const market: Pick<UnifiedMarket, "marketId" | "exchange"> & {
      metadata?: Record<string, unknown>;
    } = {
      marketId: "999",
      exchange: "kalshi",
    };
    const outcome: Pick<UnifiedOutcome, "outcomeId" | "metadata"> = {
      outcomeId: "999",
      metadata: { ticker: "INX-25DEC31-T5000" },
    };
    expect(resolveOhlcvId(market, outcome)).toBe("INX-25DEC31-T5000");
  });

  test("returns null for Kalshi when no ticker-shaped candidate exists", () => {
    const market: Pick<UnifiedMarket, "marketId" | "exchange"> = {
      marketId: "bad",
      exchange: "kalshi",
    };
    const outcome: Pick<UnifiedOutcome, "outcomeId" | "metadata"> = {
      outcomeId: "nope",
      metadata: {},
    };
    expect(resolveOhlcvId(market, outcome)).toBeNull();
  });
});

describe("fetchArchive", () => {
  const prevKey = process.env.PMXT_API_KEY;
  const prevArchive = process.env.PMXT_ARCHIVE_URL;
  const origFetch = global.fetch;

  afterEach(() => {
    global.fetch = origFetch;
    if (prevKey === undefined) delete process.env.PMXT_API_KEY;
    else process.env.PMXT_API_KEY = prevKey;
    if (prevArchive === undefined) delete process.env.PMXT_ARCHIVE_URL;
    else process.env.PMXT_ARCHIVE_URL = prevArchive;
  });

  test("parses JSON array payloads", async () => {
    delete process.env.PMXT_API_KEY;
    delete process.env.PMXT_ARCHIVE_URL;
    const { fetchArchive } = await import("./pmxt");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify([{ a: 1 }, { a: 2 }]),
    });

    const out = await fetchArchive("test.json");
    expect(out?.rows).toHaveLength(2);
    expect(out?.rows[0]).toEqual({ a: 1 });
  });

  test("returns null on non-OK response", async () => {
    delete process.env.PMXT_API_KEY;
    delete process.env.PMXT_ARCHIVE_URL;
    const { fetchArchive } = await import("./pmxt");
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => "application/json" },
      text: async () => "",
    });
    expect(await fetchArchive("missing")).toBeNull();
  });

  test("parses line-delimited JSON when content-type is not application/json", async () => {
    delete process.env.PMXT_API_KEY;
    delete process.env.PMXT_ARCHIVE_URL;
    const { fetchArchive } = await import("./pmxt");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "text/plain" },
      text: async () => '{"k":1}\n{"k":2}\n',
    });

    const out = await fetchArchive("lines.ndjson");
    expect(out?.rows).toHaveLength(2);
    expect(out?.rows[0]).toEqual({ k: 1 });
  });

  test("returns null and logs when archive fetch throws", async () => {
    delete process.env.PMXT_API_KEY;
    delete process.env.PMXT_ARCHIVE_URL;
    const { fetchArchive } = await import("./pmxt");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));

    expect(await fetchArchive("any.json")).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "[archive] fetch failed",
      expect.any(Error),
    );
    warn.mockRestore();
  });
});

describe("resolveArchiveRequestUrl", () => {
  const prevArchive = process.env.PMXT_ARCHIVE_URL;

  afterEach(() => {
    if (prevArchive === undefined) delete process.env.PMXT_ARCHIVE_URL;
    else process.env.PMXT_ARCHIVE_URL = prevArchive;
  });

  test("resolves relative paths against default archive host", () => {
    delete process.env.PMXT_ARCHIVE_URL;
    const u = resolveArchiveRequestUrl("snapshots/foo.json");
    expect(u?.origin).toBe("https://archive.pmxt.dev");
    expect(u?.pathname).toContain("foo.json");
  });

  test("returns null for control characters in path", () => {
    expect(resolveArchiveRequestUrl("bad\u0000name")).toBeNull();
  });

  test("returns null when resolved URL would leave archive origin", () => {
    delete process.env.PMXT_ARCHIVE_URL;
    expect(resolveArchiveRequestUrl("https://evil.example/")).toBeNull();
  });
});
