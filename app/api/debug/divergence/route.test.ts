/** @jest-environment node */

import { GET } from "./route";
import { hasPmxtKey } from "@/lib/pmxt";

jest.mock("@/lib/pmxt", () => ({
  hasPmxtKey: jest.fn(),
}));

describe("/api/debug/divergence GET", () => {
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

  test("returns probe data when upstream fetch succeeds", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ title: "A" }], meta: { count: 1 } }),
    } as Response);

    const res = await GET();
    const body = await res.json();

    expect(body.poly.resultCount).toBe(1);
    expect(body.kalshi.resultCount).toBe(1);
  });
});
