import { fetchEvents, fetchMarkets, fetchTradesAnalytics } from "./client";

function jsonResponse(body: unknown, ok: boolean, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("fetchEvents", () => {
    it("returns parsed JSON on success", async () => {
      const payload = [{ id: "1", title: "Event" }];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse(payload, true)),
      );
      await expect(fetchEvents(5, false)).resolves.toEqual(payload);
      expect(fetch).toHaveBeenCalledWith(
        "/api/markets/events?limit=5&closed=false",
      );
    });

    it("adds the source query when requesting Kalshi data", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse(
            [
              {
                id: "k1",
                source: "kalshi",
                title: "Kalshi market",
                markets: [],
              },
            ],
            true,
          ),
        ),
      );

      const result = await fetchEvents(5, false, "kalshi");

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "k1",
        source: "kalshi",
        title: "Kalshi market",
      });
      expect(fetch).toHaveBeenCalledWith(
        "/api/markets/events?limit=5&closed=false&source=kalshi",
      );
    });

    it("returns events array from error body when not ok", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(
              { events: [{ id: "x", title: "Fallback" }] },
              false,
              502,
            ),
          ),
      );
      await expect(fetchEvents()).resolves.toEqual([
        { id: "x", title: "Fallback" },
      ]);
    });

    it("throws when the error body includes an error message", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(
              { error: "Failed to fetch Kalshi events", events: [] },
              false,
              502,
            ),
          ),
      );

      await expect(fetchEvents(20, false, "kalshi")).rejects.toThrow(
        "Failed to fetch Kalshi events",
      );
    });
  });

  describe("fetchMarkets", () => {
    it("returns markets array from error body when not ok", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(
              { markets: [{ id: "m1", question: "Q?" }] },
              false,
              500,
            ),
          ),
      );
      await expect(fetchMarkets(10)).resolves.toEqual([
        { id: "m1", question: "Q?" },
      ]);
    });

    it("throws when the error body includes an error message", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(
              { error: "Failed to fetch Kalshi markets", markets: [] },
              false,
              502,
            ),
          ),
      );

      await expect(fetchMarkets(10, "kalshi")).rejects.toThrow(
        "Failed to fetch Kalshi markets",
      );
    });

    it("adds the source query when requesting Kalshi markets", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse(
            [
              {
                id: "k1",
                source: "kalshi",
                question: "Kalshi market",
              },
            ],
            true,
          ),
        ),
      );

      const result = await fetchMarkets(10, "kalshi");

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "k1",
        source: "kalshi",
      });
      expect(fetch).toHaveBeenCalledWith(
        "/api/markets/markets?limit=10&source=kalshi",
      );
    });
  });

  describe("fetchTradesAnalytics", () => {
    it("throws with server error message when not ok", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ error: "Rate limited" }, false, 429),
          ),
      );
      await expect(fetchTradesAnalytics({})).rejects.toThrow("Rate limited");
    });

    it("adds the source query for Kalshi analytics", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse(
            {
              analytics: {
                totalTrades: 0,
                totalVolume: 0,
                uniqueTraders: 0,
                uniqueMarkets: 0,
                timeRange: { earliest: "", latest: "" },
                byTime: [],
                perMarket: [],
                whaleTraders: [],
                preDeadlineWindow: {
                  windowHours: 24,
                  windowStart: "",
                  windowEnd: "",
                  volume: 0,
                  tradeCount: 0,
                  shareOfTotalVolume: 0,
                },
              },
              count: 0,
            },
            true,
          ),
        ),
      );

      await fetchTradesAnalytics({ source: "kalshi", windowHours: 24 });

      expect(fetch).toHaveBeenCalledWith(
        "/api/markets/trades-analytics?windowHours=24&source=kalshi",
      );
    });
  });
});
