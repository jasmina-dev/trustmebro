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
              { error: "Failed to fetch events", events: [] },
              false,
              502,
            ),
          ),
      );

      await expect(fetchEvents(20, false)).rejects.toThrow("Failed to fetch events");
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
              { error: "Failed to fetch markets", markets: [] },
              false,
              502,
            ),
          ),
      );

      await expect(fetchMarkets(10)).rejects.toThrow("Failed to fetch markets");
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

    it("passes windowHours query when provided", async () => {
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

      await fetchTradesAnalytics({ windowHours: 24 });

      expect(fetch).toHaveBeenCalledWith(
        "/api/markets/trades-analytics?windowHours=24",
      );
    });
  });
});
