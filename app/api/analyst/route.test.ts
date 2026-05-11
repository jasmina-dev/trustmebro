/** @jest-environment node */

import { NextRequest } from "next/server";
import { POST } from "./route";
import { checkRateLimit } from "@/lib/redis";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

/**
 * Route tests for `POST /api/analyst`.
 *
 * @remarks
 * This endpoint combines rate-limiting (Redis) with an LLM streaming response.
 * We mock the AI SDKs to keep the suite deterministic and focused on request
 * validation, rate-limit handling, and response shaping.
 */
jest.mock("@/lib/redis", () => ({
  checkRateLimit: jest.fn(),
}));

jest.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: jest.fn(),
}));

jest.mock("ai", () => ({
  streamText: jest.fn(),
}));

describe("/api/analyst POST", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns 429 when rate limit is exceeded", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: false,
      remaining: 0,
      reset: 123,
    });

    const req = new NextRequest("http://localhost:3000/api/analyst", {
      method: "POST",
      body: JSON.stringify({ messages: [], context: {} }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toContain("Rate limit exceeded");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("Retry-After")).toBeTruthy();
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
      const req = new NextRequest("http://localhost:3000/api/analyst", {
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

  test("returns 400 for invalid JSON body when under rate limit", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      remaining: 9,
      reset: 999,
    });

    const req = new NextRequest("http://localhost:3000/api/analyst", {
      method: "POST",
      body: "not-json{",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid JSON body");
  });

  test("returns 400 when messages array is empty", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      remaining: 9,
      reset: 999,
    });

    const req = new NextRequest("http://localhost:3000/api/analyst", {
      method: "POST",
      body: JSON.stringify({
        messages: [],
        context: {},
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("non-empty messages array");
  });

  test("returns 502 when streamText throws during setup", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      remaining: 8,
      reset: 111,
    });

    const anthropicModel = jest.fn(() => "model-ref");
    (createAnthropic as jest.Mock).mockReturnValue(anthropicModel);
    (streamText as jest.Mock).mockImplementation(() => {
      throw new Error("provider unavailable");
    });

    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";

    try {
      const req = new NextRequest("http://localhost:3000/api/analyst", {
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
      const body = await res.json();

      expect(res.status).toBe(502);
      expect(body.error).toBe("Chat failed to start");
      expect(String(body.message)).toContain("provider unavailable");
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
    (streamText as jest.Mock).mockReturnValue({
      textStream: (async function* () {
        yield "ok";
      })(),
    });

    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";

    try {
      const req = new NextRequest("http://localhost:3000/api/analyst", {
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

      expect(checkRateLimit).toHaveBeenCalledWith("chat:anon", {
        limit: 20,
        windowSeconds: 60,
      });
      expect(createAnthropic).toHaveBeenCalledWith({ apiKey: "test-key" });
      expect(streamText).toHaveBeenCalled();
      expect(res.headers.get("X-Chat-Mode")).toBe("live");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("8");

      const streamed = await res.text();
      expect(streamed).toContain("ok");
    } finally {
      if (original === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = original;
      }
    }
  });

  test("live stream encodes textStream errors as readable text", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      remaining: 8,
      reset: 111,
    });
    (createAnthropic as jest.Mock).mockReturnValue(jest.fn(() => "model-ref"));
    (streamText as jest.Mock).mockReturnValue({
      textStream: (async function* () {
        throw new Error("chunk read failed");
      })(),
    });

    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";

    try {
      const req = new NextRequest("http://localhost:3000/api/analyst", {
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
      expect(res.headers.get("X-Chat-Mode")).toBe("live");
      expect(text).toContain("chunk read failed");
    } finally {
      if (original === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = original;
      }
    }
  });

  test("live stream surfaces absorbed provider errors when stream is empty", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      remaining: 8,
      reset: 111,
    });
    (createAnthropic as jest.Mock).mockReturnValue(jest.fn(() => "model-ref"));
    (streamText as jest.Mock).mockImplementation(
      ({ onError }: { onError: (opts: { error: Error }) => void }) => ({
        textStream: (async function* () {
          onError({ error: new Error("absorbed by sdk") });
        })(),
      }),
    );

    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";

    try {
      const req = new NextRequest("http://localhost:3000/api/analyst", {
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
      expect(text).toContain("absorbed by sdk");
    } finally {
      if (original === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = original;
      }
    }
  });

  test("fills missing dashboard context defaults in the live system prompt", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      remaining: 8,
      reset: 111,
    });
    (createAnthropic as jest.Mock).mockReturnValue(jest.fn(() => "model-ref"));
    (streamText as jest.Mock).mockReturnValue({
      textStream: (async function* () {
        yield "x";
      })(),
    });

    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";

    try {
      const req = new NextRequest("http://localhost:3000/api/analyst", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "hi" }],
          context: {},
        }),
        headers: { "content-type": "application/json" },
      });

      await POST(req);
      const arg = (streamText as jest.Mock).mock.calls[0][0] as {
        system: string;
      };
      expect(arg.system).toContain("Venue: all");
      expect(arg.system).toContain("Date range:");
      expect(arg.system).toContain("ACTIVE CHART: overview");
    } finally {
      if (original === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = original;
      }
    }
  });

  test("uses env overrides for chat rate limit config", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 15000,
    });
    const originalMax = process.env.CHAT_RATE_LIMIT_MAX;
    const originalWindow = process.env.CHAT_RATE_LIMIT_WINDOW_SECONDS;
    process.env.CHAT_RATE_LIMIT_MAX = "6";
    process.env.CHAT_RATE_LIMIT_WINDOW_SECONDS = "30";

    try {
      const req = new NextRequest("http://localhost:3000/api/analyst", {
        method: "POST",
        body: JSON.stringify({ messages: [], context: {} }),
        headers: { "content-type": "application/json" },
      });
      const res = await POST(req);

      expect(res.status).toBe(429);
      expect(checkRateLimit).toHaveBeenCalledWith("chat:anon", {
        limit: 6,
        windowSeconds: 30,
      });
    } finally {
      if (originalMax === undefined) {
        delete process.env.CHAT_RATE_LIMIT_MAX;
      } else {
        process.env.CHAT_RATE_LIMIT_MAX = originalMax;
      }
      if (originalWindow === undefined) {
        delete process.env.CHAT_RATE_LIMIT_WINDOW_SECONDS;
      } else {
        process.env.CHAT_RATE_LIMIT_WINDOW_SECONDS = originalWindow;
      }
    }
  });
});
