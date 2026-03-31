import { fetchEvents, fetchMarkets, fetchTradesAnalytics, sendChatMessage } from "./client";

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
        vi.fn().mockResolvedValue(
          jsonResponse({ events: [{ id: "x", title: "Fallback" }] }, false, 502),
        ),
      );
      await expect(fetchEvents()).resolves.toEqual([
        { id: "x", title: "Fallback" },
      ]);
    });
  });

  describe("fetchMarkets", () => {
    it("returns markets array from error body when not ok", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({ markets: [{ id: "m1", question: "Q?" }] }, false, 500),
        ),
      );
      await expect(fetchMarkets(10)).resolves.toEqual([
        { id: "m1", question: "Q?" },
      ]);
    });
  });

  describe("fetchTradesAnalytics", () => {
    it("throws with server error message when not ok", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({ error: "Rate limited" }, false, 429),
        ),
      );
      await expect(fetchTradesAnalytics({})).rejects.toThrow("Rate limited");
    });
  });

  describe("sendChatMessage", () => {
    it("returns reply on success", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ reply: "Hello" }, true)),
      );
      await expect(sendChatMessage("hi")).resolves.toEqual({ reply: "Hello" });
    });

    it("throws when not ok", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ error: "Bad" }, false, 400)),
      );
      await expect(sendChatMessage("x")).rejects.toThrow("Bad");
    });
  });
});
