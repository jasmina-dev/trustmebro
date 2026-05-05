/** @jest-environment node */

import { fetchArchive, resolveArchiveRequestUrl } from "./pmxt";

const originalEnv = { ...process.env };

describe("resolveArchiveRequestUrl", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("allows relative paths on the default archive origin", () => {
    delete process.env.PMXT_ARCHIVE_URL;
    const u = resolveArchiveRequestUrl("foo/bar");
    expect(u?.origin).toBe("https://archive.pmxt.dev");
    expect(u?.pathname).toBe("/foo/bar");
  });

  test("allows absolute paths on the same host as the base", () => {
    delete process.env.PMXT_ARCHIVE_URL;
    const u = resolveArchiveRequestUrl("/other");
    expect(u?.href).toBe("https://archive.pmxt.dev/other");
  });

  test("rejects absolute http(s) URLs (SSRF)", () => {
    delete process.env.PMXT_ARCHIVE_URL;
    expect(resolveArchiveRequestUrl("https://attacker.example/leak")).toBeNull();
    expect(resolveArchiveRequestUrl("http://attacker.example/x")).toBeNull();
  });

  test("rejects scheme-relative URLs", () => {
    delete process.env.PMXT_ARCHIVE_URL;
    expect(resolveArchiveRequestUrl("//attacker.example/x")).toBeNull();
  });

  test("rejects resolved URLs that include userinfo", () => {
    delete process.env.PMXT_ARCHIVE_URL;
    expect(resolveArchiveRequestUrl("//user:pass@archive.pmxt.dev/x")).toBeNull();
    process.env.PMXT_ARCHIVE_URL = "https://archive.pmxt.dev/";
    expect(resolveArchiveRequestUrl("/x")).not.toBeNull();
  });

  test("rejects control characters in path", () => {
    delete process.env.PMXT_ARCHIVE_URL;
    expect(resolveArchiveRequestUrl("a\nhttps://evil.com")).toBeNull();
  });

  test("rejects non-http(s) archive base", () => {
    process.env.PMXT_ARCHIVE_URL = "javascript:alert(1)";
    expect(resolveArchiveRequestUrl("x")).toBeNull();
  });
});

describe("fetchArchive SSRF guard", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.PMXT_API_KEY = "pmxt_testkey";
    process.env.PMXT_ARCHIVE_URL = "https://archive.pmxt.dev/";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  test("does not call fetch for cross-origin path", async () => {
    const out = await fetchArchive("https://attacker.example/leak");
    expect(out).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("calls fetch for same-origin path", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: (h: string) => (h === "content-type" ? "application/json" : "") },
      text: async () => "[]",
    });

    await fetchArchive("safe/path");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://archive.pmxt.dev/safe/path",
    );
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      Authorization: "Bearer pmxt_testkey",
    });
  });
});
