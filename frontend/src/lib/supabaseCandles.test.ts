// utilized cursor to generate tests

import {
  fetchGlobalHourlyCashflowFromSupabase,
  fetchHourlyCashflowForPolymarketIds,
} from "./supabaseCandles";

const rpcMock = vi.fn();

vi.mock("./supabaseClient", () => ({
  getSupabaseBrowserClient: vi.fn(() => ({ rpc: rpcMock })),
}));

describe("supabaseCandles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty list when rpc responds with error", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });
    await expect(
      fetchGlobalHourlyCashflowFromSupabase("2026-01-01T00:00:00.000Z"),
    ).resolves.toEqual([]);
  });

  it("maps rpc rows to sorted hourly buckets", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        { bucket_start: "2026-01-01T02:00:00.000Z", volume: "20" },
        { bucket_start: "2026-01-01T01:00:00.000Z", volume: 10 },
      ],
      error: null,
    });
    const out = await fetchGlobalHourlyCashflowFromSupabase(
      "2026-01-01T00:00:00.000Z",
    );
    expect(out.map((b) => b.bucketStart)).toEqual([
      "2026-01-01T01:00:00.000Z",
      "2026-01-01T02:00:00.000Z",
    ]);
    expect(out[0].volume).toBe(10);
    expect(out[1].volume).toBe(20);
  });

  it("returns empty list for id-scoped fetch when id list is empty", async () => {
    await expect(
      fetchHourlyCashflowForPolymarketIds("2026-01-01T00:00:00.000Z", []),
    ).resolves.toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls scoped rpc with ids and converts rows", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ bucket_start: "2026-01-01T03:00:00.000Z", volume: null }],
      error: null,
    });
    const out = await fetchHourlyCashflowForPolymarketIds(
      "2026-01-01T00:00:00.000Z",
      ["cond1", "cond2"],
    );
    expect(rpcMock).toHaveBeenCalledWith(
      "aggregate_hourly_cashflow_for_polymarket_ids",
      {
        p_since: "2026-01-01T00:00:00.000Z",
        p_polymarket_ids: ["cond1", "cond2"],
      },
    );
    expect(out[0].volume).toBe(0);
  });
});
