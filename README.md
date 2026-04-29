# trustmebro — prediction market inefficiency dashboard

A full-stack Next.js 14 dashboard that surfaces **systematic inefficiencies**
across Polymarket and Kalshi — resolution bias, cross-venue price
divergence, liquidity gaps, and late-breaking mismatches — with an embedded
AI chatbot that reads live dashboard context.

Data is sourced from [pmxt.dev](https://pmxt.dev) (unified prediction-market
API) and its historical archive at `archive.pmxt.dev`. Every server-side
call is Upstash-cached so we stay well under PMXT's 60 req/min and
25 000 req/month budgets.

---

## Quickstart

```bash
# 1. Install
npm install

# 2. Copy envs
cp .env.local.example .env.local
# …then open .env.local and fill in:
#   PMXT_API_KEY=pmxt_live_xxx              (https://pmxt.dev/dashboard)
#   UPSTASH_REDIS_REST_URL=…                (https://console.upstash.com)
#   UPSTASH_REDIS_REST_TOKEN=…
#   ANTHROPIC_API_KEY=sk-ant-…              (https://console.anthropic.com)

# 3. Dev
npm run dev            # http://localhost:3000

# 4. Prod
npm run build
npm start
```

> Missing any keys? The app still boots. PMXT missing → deterministic mock
> markets/OHLCV. Upstash missing → in-memory cache. Anthropic missing → the
> chat panel answers with a friendly mock stream. Nothing crashes.

---

## Architecture

```
   ┌─────────────────────────────────────────────────────────────┐
   │                      Browser  (Next.js client)              │
   │                                                             │
   │  TopNav · Sidebar   KPIRow    6× chart modules   ChatPanel  │
   │     │        │         │            │               │       │
   │     └────────┴────┬────┴────────────┴──────┬────────┘       │
   │                   │                        │                │
   │          Zustand store (useDashboard)  ───►│ context        │
   │          filters · chart context      ───►│ snapshot fed to │
   │                                            │ chat endpoint  │
   │                   │                        │                │
   └───────────────────┼────────────────────────┼────────────────┘
                       │ SWR /api/*             │ POST /api/chat
                       ▼                        ▼
     ┌─────────────────────────────────────────────────────────┐
     │   Next.js route handlers  (Node runtime · dynamic)      │
     │                                                         │
     │  /api/markets          /api/resolution-bias             │
     │  /api/inefficiencies   /api/ohlcv                       │
     │  /api/archive          /api/chat (streaming)            │
     │        │                      │                         │
     │        ▼                      ▼                         │
     │  ┌──────────────┐    ┌──────────────────────────┐       │
     │  │ lib/redis.ts │    │ ai + @ai-sdk/anthropic   │       │
     │  │ cached()     │    │ streamText               │       │
     │  │ 60s/5m/1h/24h│    │ rate limit 10/min/IP     │       │
     │  └──────┬───────┘    └──────────────────────────┘       │
     │         │ MISS                                          │
     │         ▼                                               │
     │  ┌──────────────────────────────────────────────┐       │
     │  │ lib/pmxt.ts                                  │       │
     │  │  router.markets()  → GET /v0/markets         │       │
     │  │  poly/kalshi SDK   → fetchOHLCV(outcomeId…)  │       │
     │  │  fetchArchive()    → archive.pmxt.dev sniff  │       │
     │  └──────────────────────────────────────────────┘       │
     └─────────────────────────────────────────────────────────┘
                             │
                             ▼
          ┌────────────────────────────────────────────┐
          │  Upstream:  pmxt.dev   archive.pmxt.dev   │
          │             anthropic.com                  │
          │             Upstash Redis                  │
          └────────────────────────────────────────────┘
```

---

## Inefficiency signals

| Signal                       | Source                                   | Flag                          |
|------------------------------|------------------------------------------|-------------------------------|
| **Resolution bias**          | `/v0/markets?closed=true&category=…`     | NO-rate > 65 % (with z-score) |
| **Cross-venue divergence**   | `/v0/markets` fanned across both venues  | \|YES_poly − YES_kalshi\| > 3 pp |
| **Liquidity gap**            | `/v0/markets` — volume24h / liquidity    | ratio > mean + 2 σ            |
| **Late-breaking mismatch**   | `/api/:exchange/fetchOHLCV` last hour    | \|close − resolution\| > 15 pp  |

See [`app/api/inefficiencies/route.ts`](app/api/inefficiencies/route.ts) for
the full computation, and [`app/api/resolution-bias/route.ts`](app/api/resolution-bias/route.ts)
for the standalone category × venue NO-rate table used by the heatmap.

---

## Cache strategy

Every `/api/*` route goes through `lib/redis.ts::cached()` which:

1. checks Upstash (or in-memory fallback) first,
2. calls upstream only on MISS,
3. writes the result back with the TTL below,
4. returns an `{ data, cache, source, fetchedAt }` envelope,
5. stamps the response with `X-Cache: HIT | MISS | BYPASS`.

| Route                   | TTL     | Why                                          |
|-------------------------|---------|----------------------------------------------|
| `/api/markets` (live)   | 60 s    | Live prices move but not faster than 1 min  |
| `/api/markets?closed`   | 1 hour  | Resolved markets are immutable              |
| `/api/resolution-bias`  | 1 hour  | Aggregates over immutable data              |
| `/api/inefficiencies`   | 5 min   | Recomputes four signals; cap PMXT calls     |
| `/api/ohlcv`            | 5 min   | Hourly candles move once per hour anyway    |
| `/api/archive`          | 24 h    | Historical data is append-only              |

Client-side SWR intervals (`lib/api.ts` → `REFRESH`) mirror these TTLs.

---

## Chatbot

`POST /api/chat` streams an Anthropic Claude response (`claude-sonnet-4-5`
by default, override with `ANTHROPIC_MODEL`). Every request serializes the
**current dashboard context** into the system prompt:

- active filters (venue / category / date range)
- active chart id
- top 30 visible markets (id / title / venue / volume / liquidity)
- top 20 inefficiency scores
- resolution stats per category × exchange

You can inspect the exact JSON by opening the chat panel and clicking
**Context**.

Rate-limit: 10 requests / minute / IP — via `@upstash/ratelimit` when
Upstash is configured, falls back to an in-memory sliding window otherwise.

---

## PMXT API surface used

> Docs: <https://pmxt.dev/docs>

| Method                                    | Where                                         |
|-------------------------------------------|-----------------------------------------------|
| `GET /v0/markets`                         | `lib/pmxt.ts::router.markets`                 |
| `GET /v0/markets?closed=true`             | same, for resolution bias / price-vs-resolution |
| `GET /api/polymarket/fetchOHLCV` (SDK)    | `lib/pmxt.ts::fetchOhlcv` via `pmxtjs`        |
| `GET /api/kalshi/fetchOHLCV` (SDK)        | same                                          |
| Archive (`archive.pmxt.dev/*`)            | `lib/pmxt.ts::fetchArchive` (sniffs JSON / NDJSON) |

The [unified schema](https://pmxt.dev/docs/concepts/unified-schema) guarantees
the same `UnifiedMarket { marketId, title, outcomes[{outcomeId, label, price}], volume24h, liquidity, category, status, … }` shape across both venues, which is what makes cross-venue divergence detection a one-line compare instead of a normalization nightmare.

---

## Scripts

```bash
npm run dev         # Next.js dev server
npm run build       # Production build (verify before deploying)
npm start           # Run the built output
npm run lint        # next lint (ESLint)
npm run typecheck   # tsc --noEmit
```

---

## Final checklist

- ✅ All `/api/*` routes cache-first; every response ships `X-Cache: HIT/MISS/BYPASS`.
- ✅ Skeleton loaders for every async chart; first-load shell < 90 kB shared JS, < 180 kB page JS.
- ✅ Chart modules lazy-loaded via `next/dynamic` with per-chart loaders.
- ✅ Each chart is wrapped in an `ErrorBoundary` with a graceful retry fallback.
- ✅ Chatbot context reflects exactly what's rendered (each chart calls `updateChartContext` on data load).
- ✅ Mobile-responsive: grid collapses to a single column below 768 px; sidebar hidden.
- ✅ Strict TypeScript — `any` only where pmxtjs SDK types are incomplete.
- ✅ `.env.local.example` documents every key with its source URL.
- ✅ Graceful degradation: missing `PMXT_API_KEY` / `UPSTASH_*` / `ANTHROPIC_API_KEY` all have clean fallbacks.
#   t r u s t m e b r o _ v 2  
 