/**
 * POST /api/analyst
 *
 * Streaming chat endpoint backed by Anthropic Claude (via Vercel AI SDK).
 *
 * Body:
 *   {
 *     messages: [{ role, content }, ...],
 *     context:  DashboardContextSnapshot   // live dashboard data
 *   }
 *
 * The dashboard context is serialized into the system prompt so Claude can
 * cite specific markets, inefficiency scores, and resolution stats that are
 * currently on the user's screen.
 *
 * Rate limit: defaults to 20 req/min per IP (configurable via env),
 * via @upstash/ratelimit when Upstash is configured and an in-memory
 * sliding window in dev.
 */

import { NextRequest } from "next/server";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { checkRateLimit } from "@/lib/redis";
import type {
  DashboardContextSnapshot,
  ExchangeFilter,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Must be a Messages API id (see @ai-sdk/anthropic types). `claude-sonnet-4-5` is not valid and fails in prod. */
const DEFAULT_MODEL = "claude-3-5-sonnet-latest";

function anthropicApiKey(): string | undefined {
  const raw = process.env.ANTHROPIC_API_KEY;
  if (typeof raw !== "string") return undefined;
  const key = raw.trim();
  return key.length > 0 ? key : undefined;
}

function resolveModel(): string {
  const id = process.env.ANTHROPIC_MODEL?.trim();
  return id && id.length > 0 ? id : DEFAULT_MODEL;
}

function normalizeContext(
  raw: DashboardContextSnapshot | undefined,
): DashboardContextSnapshot {
  return {
    filters: {
      venue: (raw?.filters?.venue ?? "all") as ExchangeFilter,
      category: raw?.filters?.category ?? "All",
      dateRange: {
        start: raw?.filters?.dateRange?.start ?? "",
        end: raw?.filters?.dateRange?.end ?? "",
      },
    },
    activeChart: raw?.activeChart ?? "overview",
    visibleMarkets: Array.isArray(raw?.visibleMarkets) ? raw.visibleMarkets : [],
    inefficiencyScores: Array.isArray(raw?.inefficiencyScores)
      ? raw.inefficiencyScores
      : [],
    resolutionStats: Array.isArray(raw?.resolutionStats)
      ? raw.resolutionStats
      : [],
  };
}
const DEFAULT_CHAT_RATE_LIMIT = 20;
const DEFAULT_CHAT_RATE_WINDOW_SECONDS = 60;

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anon"
  );
}

function buildSystemPrompt(ctx: DashboardContextSnapshot): string {
  return [
    "You are a quantitative analyst specializing in prediction market inefficiencies.",
    "You have real-time access to the dashboard the user is looking at right now.",
    "",
    "## CURRENT FILTERS",
    `- Venue: ${ctx.filters.venue}`,
    `- Category: ${ctx.filters.category}`,
    `- Date range: ${ctx.filters.dateRange.start} → ${ctx.filters.dateRange.end}`,
    "",
    `## ACTIVE CHART: ${ctx.activeChart}`,
    "",
    "## VISIBLE MARKETS (top 30)",
    "```json",
    JSON.stringify(ctx.visibleMarkets, null, 2),
    "```",
    "",
    "## INEFFICIENCY SCORES (top 20)",
    "```json",
    JSON.stringify(ctx.inefficiencyScores, null, 2),
    "```",
    "",
    "## RESOLUTION STATS (per category × exchange)",
    "```json",
    JSON.stringify(ctx.resolutionStats, null, 2),
    "```",
    "",
    "## INSTRUCTIONS",
    "- Answer questions about what the user sees. Cite specific data points (market titles, scores, z-scores) by quoting from the JSON above.",
    "- Explain statistical concepts (z-scores, spread, liquidity ratios) accessibly.",
    "- Suggest actionable insights — which markets look inefficient and why.",
    '- Format rates/prices as percentages (e.g. "72%", not "0.72").',
    "- If the data above is empty, tell the user the dashboard is still loading — do not invent data.",
    "- Keep responses tight and scannable. Use short paragraphs, bullets for lists.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const ip = ipOf(req);
  const limit = Number(
    process.env.CHAT_RATE_LIMIT_MAX ?? DEFAULT_CHAT_RATE_LIMIT,
  );
  const windowSeconds = Number(
    process.env.CHAT_RATE_LIMIT_WINDOW_SECONDS ??
      DEFAULT_CHAT_RATE_WINDOW_SECONDS,
  );
  const safeLimit =
    Number.isFinite(limit) && limit > 0
      ? Math.floor(limit)
      : DEFAULT_CHAT_RATE_LIMIT;
  const safeWindowSeconds =
    Number.isFinite(windowSeconds) && windowSeconds > 0
      ? Math.floor(windowSeconds)
      : DEFAULT_CHAT_RATE_WINDOW_SECONDS;

  const rl = await checkRateLimit(`chat:${ip}`, {
    limit: safeLimit,
    windowSeconds: safeWindowSeconds,
  });
  if (!rl.success) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((rl.reset - Date.now()) / 1000),
    );
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded. Please wait a moment and try again.",
        reset: rl.reset,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.reset),
          "Retry-After": String(retryAfterSeconds),
        },
      },
    );
  }

  let body: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    context: DashboardContextSnapshot;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(
      JSON.stringify({ error: "Expected a non-empty messages array" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const apiKey = anthropicApiKey();
  if (!apiKey) {
    // Graceful degrade: return a single SSE-ish text stream explaining that
    // the chat isn't live. Keeps the UI flow identical to a real call.
    const text =
      "The chatbot is not configured — add `ANTHROPIC_API_KEY` to your deployment environment " +
      "(e.g. Vercel: Project → Settings → Environment Variables), redeploy, and try again. " +
      "The dashboard still runs on deterministic mock data without it.";
    const stream = new ReadableStream({
      start(controller) {
        const chunks = text.split(/(\s+)/);
        let i = 0;
        const tick = () => {
          if (i >= chunks.length) {
            controller.close();
            return;
          }
          controller.enqueue(new TextEncoder().encode(chunks[i]));
          i++;
          setTimeout(tick, 20);
        };
        tick();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Chat-Mode": "mock",
      },
    });
  }

  const modelId = resolveModel();

  const anthropic = createAnthropic({ apiKey });

  // Do NOT await streamText — StreamTextResult implements PromiseLike, so
  // awaiting it calls .then() which internally drains textStream before this
  // function resumes, leaving result.textStream exhausted (empty response).
  //
  // providerError is set by onError when the SDK absorbs a provider-level
  // error without re-throwing it into textStream (silent empty-stream case).
  let providerError: string | null = null;

  let result: ReturnType<typeof streamText>;
  try {
    result = streamText({
      model: anthropic(modelId),
      system: buildSystemPrompt(normalizeContext(body.context)),
      messages: body.messages,
      maxTokens: 1024,
      onError({ error }) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[api/analyst] provider error (absorbed by SDK):", msg);
        providerError = msg;
      },
    });
  } catch (err) {
    console.error("[api/analyst] stream setup error", err);
    const message =
      err instanceof Error ? err.message : "Unknown error setting up stream";
    return new Response(
      JSON.stringify({ error: "Chat failed to start", message }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  console.log(`[api/analyst] streaming with model=${modelId} key_prefix=${apiKey.slice(0, 14)}…`);

  // Wrap the text stream so provider errors are forwarded as readable text
  // rather than an abrupt close (which the browser surfaces as "Failed to fetch").
  const enc = new TextEncoder();
  const safeStream = new ReadableStream({
    async start(controller) {
      let wrote = false;
      try {
        for await (const chunk of result.textStream) {
          controller.enqueue(enc.encode(chunk));
          wrote = true;
        }
      } catch (streamErr) {
        console.error("[api/analyst] stream read error:", streamErr);
        const msg =
          streamErr instanceof Error
            ? streamErr.message
            : "Unknown provider error";
        controller.enqueue(enc.encode(`\n\n*AI provider error: ${msg}*`));
        wrote = true;
      }
      if (!wrote) {
        const reason = providerError ?? "no chunks received and no error thrown";
        console.error("[api/analyst] stream yielded no content:", reason);
        controller.enqueue(
          enc.encode(
            providerError
              ? `*AI provider error: ${providerError}*`
              : "*No response from AI provider — check pm2 logs for details.*",
          ),
        );
      }
      controller.close();
    },
  });

  return new Response(safeStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-RateLimit-Remaining": String(rl.remaining),
      "X-RateLimit-Reset": String(rl.reset),
      "X-Chat-Mode": "live",
    },
  });
}
