/** @jest-environment node */

import { NextRequest } from "next/server";
import { GET } from "./route";
import { fetchOhlcv, hasPmxtKey } from "@/lib/pmxt";
import { mockOhlcv } from "@/lib/mock";

jest.mock("@/lib/redis", () => ({
  cached: jest.fn(async (_key, _ttl, loader) => ({
    value: await loader(),
    state: "MISS",
  })),
}));

jest.mock("@/lib/pmxt", () => ({
  fetchOhlcv: jest.fn(),
  hasPmxtKey: jest.fn(),
}));

jest.mock("@/lib/mock", () => ({
  mockOhlcv: jest.fn(),
}));

describe("/api/ohlcv GET", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns 400 when required params are missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/ohlcv");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  test("returns mock candles without PMXT key", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(false);
    (mockOhlcv as jest.Mock).mockReturnValue([{ close: 0.5 }]);

    const req = new NextRequest(
      "http://localhost:3000/api/ohlcv?exchange=polymarket&outcomeId=o1&limit=3",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(body.source).toBe("mock");
    expect(body.cache).toBe("MISS");
    expect(body.data).toEqual([{ close: 0.5 }]);
  });

  test("uses PMXT ohlcv fetch when key is present", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    (fetchOhlcv as jest.Mock).mockResolvedValue([{ close: 0.7 }]);

    const req = new NextRequest(
      "http://localhost:3000/api/ohlcv?exchange=kalshi&outcomeId=o2&resolution=1d&limit=2",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(fetchOhlcv).toHaveBeenCalledWith("kalshi", "o2", {
      resolution: "1d",
      limit: 2,
    });
    expect(body.source).toBe("pmxt");
    expect(body.data).toEqual([{ close: 0.7 }]);
  });

  test("falls back to BYPASS mock data on upstream errors", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    (fetchOhlcv as jest.Mock).mockRejectedValue(new Error("upstream down"));
    (mockOhlcv as jest.Mock).mockReturnValue([{ close: 0.2 }]);

    const req = new NextRequest(
      "http://localhost:3000/api/ohlcv?exchange=polymarket&outcomeId=o3&limit=1",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(body.cache).toBe("BYPASS");
    expect(body.source).toBe("mock");
    expect(body.error).toContain("upstream down");
  });
});
