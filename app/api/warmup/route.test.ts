/** @jest-environment node */

import { GET } from "./route";
import { cached as redisCached } from "@/lib/redis";
import { fetchAllMarkets } from "@/lib/fetchAll";
import { hasPmxtKey } from "@/lib/pmxt";
import { divergentPairsForCategory } from "@/lib/divergence";
import { cachedBucketsForExchange } from "@/lib/resolutionBiasData";
import { primeMarketsV3Aggregates } from "@/lib/marketsCache";

jest.mock("@/lib/redis", () => ({
  cached: jest.fn(
    async (_key: string, _ttl: number, loader: () => Promise<unknown>) => ({
      value: await loader(),
      state: "MISS",
    }),
  ),
}));

jest.mock("@/lib/fetchAll", () => ({
  fetchAllMarkets: jest.fn().mockResolvedValue({ markets: [] }),
}));

jest.mock("@/lib/pmxt", () => ({
  hasPmxtKey: jest.fn(),
}));

jest.mock("@/lib/divergence", () => ({
  divergentPairsForCategory: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/resolutionBiasData", () => ({
  cachedBucketsForExchange: jest.fn().mockResolvedValue({
    buckets: [],
    closedMarketsLoaded: 0,
    state: "MISS",
  }),
}));

jest.mock("@/lib/marketsCache", () => ({
  primeMarketsV3Aggregates: jest.fn().mockResolvedValue(undefined),
}));

describe("/api/warmup GET", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns warmed=false when PMXT key is missing", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(false);

    const res = await GET(new Request("http://localhost/api/warmup"));
    const body = await res.json();

    expect(body.warmed).toBe(false);
    expect(body.reason).toContain("PMXT_API_KEY missing");
  });

  test("runs full warmup when PMXT key is present and cron auth passes", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);

    const res = await GET(new Request("http://localhost/api/warmup"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.warmed).toBe(true);
    expect(typeof body.ms).toBe("number");
    expect(Array.isArray(body.routes)).toBe(true);
    expect(body.routes.length).toBeGreaterThan(0);

    expect(primeMarketsV3Aggregates).toHaveBeenCalled();
    expect(fetchAllMarkets).toHaveBeenCalled();
    expect(cachedBucketsForExchange).toHaveBeenCalled();
    expect(divergentPairsForCategory).toHaveBeenCalled();
    expect(redisCached).toHaveBeenCalled();
  });

  test("records FAILED timing when a divergence cache populate throws", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    (divergentPairsForCategory as jest.Mock)
      .mockReset()
      .mockRejectedValueOnce(new Error("pairing failed"))
      .mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/warmup"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.warmed).toBe(true);
    expect(
      body.routes.some((r: { route: string }) =>
        String(r.route).includes("FAILED"),
      ),
    ).toBe(true);
  });

  test("returns 401 when CRON_SECRET is set but the bearer token does not match", async () => {
    const prevCron = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "cron-test-secret";
    (hasPmxtKey as jest.Mock).mockReturnValue(true);

    try {
      const unauthorized = await GET(
        new Request("http://localhost/api/warmup", {
          headers: { Authorization: "Bearer wrong-token" },
        }),
      );
      expect(unauthorized.status).toBe(401);

      const ok = await GET(
        new Request("http://localhost/api/warmup", {
          headers: { Authorization: "Bearer cron-test-secret" },
        }),
      );
      expect(ok.status).toBe(200);
    } finally {
      if (prevCron === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prevCron;
    }
  });
});
