/** @jest-environment node */

import { NextRequest } from "next/server";
import { GET } from "./route";
import { hasPmxtKey, fetchArchive } from "@/lib/pmxt";

jest.mock("@/lib/redis", () => ({
  cached: jest.fn(async (_key, _ttl, loader) => ({
    value: await loader(),
    state: "MISS",
  })),
}));

jest.mock("@/lib/pmxt", () => ({
  hasPmxtKey: jest.fn(),
  fetchArchive: jest.fn(),
}));

describe("/api/archive GET", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns mock source and no rows without PMXT key", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(false);
    const req = new NextRequest("http://localhost:3000/api/archive");
    const res = await GET(req);
    const body = await res.json();

    expect(body.source).toBe("mock");
    expect(body.data).toEqual([]);
    expect(body.count).toBe(0);
    expect(res.headers.get("X-Cache")).toBe("MISS");
  });

  test("returns archive rows when fetchArchive succeeds", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    (fetchArchive as jest.Mock).mockResolvedValue({
      rows: [{ id: 1 }, { id: 2 }],
    });

    const req = new NextRequest("http://localhost:3000/api/archive?path=foo");
    const res = await GET(req);
    const body = await res.json();

    expect(body.source).toBe("archive");
    expect(body.count).toBe(2);
    expect(body.data).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("falls back to mock source when archive endpoint returns null", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    (fetchArchive as jest.Mock).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/archive?path=unknown");
    const res = await GET(req);
    const body = await res.json();

    expect(body.source).toBe("mock");
    expect(body.data).toEqual([]);
  });

  test("returns BYPASS payload when loader throws", async () => {
    (hasPmxtKey as jest.Mock).mockImplementation(() => {
      throw new Error("pmxt unavailable");
    });

    const req = new NextRequest("http://localhost:3000/api/archive");
    const res = await GET(req);
    const body = await res.json();

    expect(body.cache).toBe("BYPASS");
    expect(body.error).toContain("pmxt unavailable");
  });
});
