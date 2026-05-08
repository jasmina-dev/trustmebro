/** @jest-environment node */

import { GET } from "./route";
import { hasPmxtKey } from "@/lib/pmxt";

/**
 * Route tests for `GET /api/warmup`.
 *
 * @remarks
 * The warmup endpoint primes/caches several expensive aggregates. Tests mock
 * the downstream pipeline modules and validate that the route orchestrates the
 * expected calls (without requiring real upstream data).
 */
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

    const res = await GET(new Request("http://localhost/api/warmup"));
    const body = await res.json();

    expect(body.warmed).toBe(false);
    expect(body.reason).toContain("PMXT_API_KEY missing");
  });
});
