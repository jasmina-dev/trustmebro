/**
 * POST /api/chat
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
 * Rate limit: 10 req/min per IP, via @upstash/ratelimit when Upstash is
 * configured and an in-memory sliding window in dev.
 */

import { NextRequest } from "next/server";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { checkRateLimit } from "@/lib/redis";
import type { DashboardContextSnapshot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

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
    "- Format rates/prices as percentages (e.g. \"72%\", not \"0.72\").",
    "- If the data above is empty, tell the user the dashboard is still loading — do not invent data.",
    "- Keep responses tight and scannable. Use short paragraphs, bullets for lists.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const ip = ipOf(req);
  const rl = await checkRateLimit(ip, { limit: 10, windowSeconds: 60 });
  if (!rl.success) {
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
        },
      },
    );
  }

  const body = (await req.json()) as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    context: DashboardContextSnapshot;
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    // Graceful degrade: return a single SSE-ish text stream explaining that
    // the chat isn't live. Keeps the UI flow identical to a real call.
    const text =
      "The chatbot is not configured — set `ANTHROPIC_API_KEY` in `.env.local` to enable it. " +
      "In the meantime, the dashboard is running on deterministic mock data so you can still explore every chart.";
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

  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const result = await streamText({
    model: anthropic(MODEL),
    system: buildSystemPrompt(body.context),
    messages: body.messages,
    maxTokens: 1024,
  });

  // Plain text stream — the ChatPanel reads it with a standard ReadableStream
  // reader loop. Avoids coupling the client to a specific SDK shape.
  return result.toTextStreamResponse({
    headers: {
      "X-RateLimit-Remaining": String(rl.remaining),
      "X-RateLimit-Reset": String(rl.reset),
      "X-Chat-Mode": "live",
    },
  });
}
