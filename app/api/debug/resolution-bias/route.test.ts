/** @jest-environment node */

import { GET } from "./route";
import { hasPmxtKey } from "@/lib/pmxt";

jest.mock("@/lib/pmxt", () => ({
  hasPmxtKey: jest.fn(),
}));

describe("/api/debug/resolution-bias GET", () => {
  afterEach(() => {
    jest.clearAllMocks();
    if (jest.isMockFunction(global.fetch)) {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRestore();
    }
  });

  test("returns 400 when PMXT key is missing", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(400);
  });

  test("returns diagnostic payload from PMXT probe", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            marketId: "m1",
            status: "resolved",
            resolutionDate: "2026-01-10",
            outcomes: [{ label: "Yes" }, { label: "No" }],
          },
        ],
        meta: { count: 1 },
      }),
    } as Response);

    const res = await GET();
    const body = await res.json();

    expect(body.resultCount).toBe(1);
    expect(body.statusCounts.resolved).toBe(1);
    expect(body.labelSamples).toContain("Yes");
  });
});
