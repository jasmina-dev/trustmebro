/** @jest-environment node */

import { GET } from "./route";
import { hasPmxtKey } from "@/lib/pmxt";

jest.mock("@/lib/redis", () => ({
  cached: jest.fn(),
}));

jest.mock("@/lib/fetchAll", () => ({
  fetchAllMarkets: jest.fn(),
}));

jest.mock("@/lib/pmxt", () => ({
  hasPmxtKey: jest.fn(),
}));

jest.mock("@/lib/bias", () => ({
  computeBiasBucket: jest.fn(),
}));

jest.mock("@/lib/divergence", () => ({
  divergentPairsForCategory: jest.fn(),
}));

describe("/api/warmup GET", () => {
  test("returns warmed=false when PMXT key is missing", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(false);

    const res = await GET();
    const body = await res.json();

    expect(body.warmed).toBe(false);
    expect(body.reason).toContain("PMXT_API_KEY missing");
  });
});
