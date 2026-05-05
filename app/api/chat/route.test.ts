/** @jest-environment node */

import { NextRequest } from "next/server";
import { POST } from "./route";
import { checkRateLimit } from "@/lib/redis";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

jest.mock("@/lib/redis", () => ({
  checkRateLimit: jest.fn(),
}));

jest.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: jest.fn(),
}));

jest.mock("ai", () => ({
  streamText: jest.fn(),
}));

describe("/api/chat POST", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns 429 when rate limit is exceeded", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: false,
      remaining: 0,
      reset: 123,
    });

    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [], context: {} }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toContain("Rate limit exceeded");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  test("returns mock text stream when anthropic key is missing", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      remaining: 9,
      reset: 999,
    });
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const req = new NextRequest("http://localhost:3000/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "hi" }],
          context: {
            filters: {
              venue: "all",
              category: "All",
              dateRange: { start: "2026-01-01", end: "2026-01-31" },
            },
            activeChart: "overview",
            visibleMarkets: [],
            inefficiencyScores: [],
            resolutionStats: [],
          },
        }),
        headers: { "content-type": "application/json" },
      });

      const res = await POST(req);
      const text = await res.text();

      expect(res.headers.get("X-Chat-Mode")).toBe("mock");
      expect(text).toContain("The chatbot is not configured");
    } finally {
      if (original === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = original;
      }
    }
  });

  test("returns live mode stream when anthropic key is present", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      remaining: 8,
      reset: 111,
    });

    const anthropicModel = jest.fn(() => "model-ref");
    (createAnthropic as jest.Mock).mockReturnValue(anthropicModel);
    (streamText as jest.Mock).mockResolvedValue({
      toTextStreamResponse: ({
        headers,
      }: {
        headers: Record<string, string>;
      }) => new Response("ok", { headers }),
    });

    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";

    try {
      const req = new NextRequest("http://localhost:3000/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "analyze this" }],
          context: {
            filters: {
              venue: "all",
              category: "All",
              dateRange: { start: "2026-01-01", end: "2026-01-31" },
            },
            activeChart: "overview",
            visibleMarkets: [],
            inefficiencyScores: [],
            resolutionStats: [],
          },
        }),
        headers: { "content-type": "application/json" },
      });

      const res = await POST(req);

      expect(createAnthropic).toHaveBeenCalledWith({ apiKey: "test-key" });
      expect(streamText).toHaveBeenCalled();
      expect(res.headers.get("X-Chat-Mode")).toBe("live");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("8");
    } finally {
      if (original === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = original;
      }
    }
  });
});
