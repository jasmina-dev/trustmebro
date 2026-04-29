"use client";

import useSWR from "swr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  AreaSeries,
} from "lightweight-charts";
import { fetcher, REFRESH, type ApiPayload } from "@/lib/api";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { ChartSkeleton } from "../ui/Skeleton";
import { useDashboard } from "@/lib/store";
import type { PriceCandle, UnifiedMarket } from "@/lib/types";
import { isResolved, yesOutcome } from "@/lib/utils";

/**
 * Final 72h price movement for a resolved market, with a vertical line at
 * the resolution moment and color coding for correct / mispriced at close.
 */
export function PriceVsResolution() {
  const { data: closedMarkets } = useSWR<ApiPayload<UnifiedMarket[]>>(
    "/api/markets?closed=true&limit=50",
    fetcher,
    {
      refreshInterval: REFRESH.resolution,
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  // PMXT's `closed=true` filter is loose — it returns markets that are simply
  // "closed for trading" alongside truly-resolved ones. Many entries have
  // placeholder prices of 0 on BOTH outcomes (stale metadata, never actually
  // resolved), and their OHLCV endpoint returns no candles. A genuine
  // resolution always pins one outcome near 1, so we require that plus a
  // past resolution date. Markets where both outcomes are 0 are filtered out.
  const markets = useMemo(() => {
    const now = Date.now();
    return (closedMarkets?.data ?? []).filter((m) => {
      const yes = yesOutcome(m);
      if (!yes) return false;
      const hasWinner = m.outcomes.some((o) => o.price >= 0.98);
      const res = m.resolutionDate ? new Date(m.resolutionDate).getTime() : 0;
      const resolvedInPast = res > 0 && res < now;
      return hasWinner && (resolvedInPast || isResolved(m));
    });
  }, [closedMarkets?.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (markets.length === 0) return;
    if (!selectedId || !markets.some((m) => m.marketId === selectedId)) {
      setSelectedId(markets[0].marketId);
    }
  }, [markets, selectedId]);

  const selected = markets.find((m) => m.marketId === selectedId) ?? markets[0];
  const yes = selected ? yesOutcome(selected) : undefined;

  const ohlcvUrl = selected && yes
    ? `/api/ohlcv?exchange=${selected.exchange}&outcomeId=${encodeURIComponent(yes.outcomeId)}&resolution=1h&limit=72`
    : null;

  const { data: ohlcvPayload } = useSWR<ApiPayload<PriceCandle[]>>(
    ohlcvUrl,
    fetcher,
    {
      refreshInterval: REFRESH.ohlcv,
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const priceLineRef = useRef<ReturnType<ISeriesApi<"Area">["createPriceLine"]> | null>(null);
  // Bump this counter every time the chart is recreated so the data-loading
  // effect re-runs against the new series instance. Necessary because React
  // 18 strict mode double-invokes mount effects: the first chart gets torn
  // down and the second takes its place, but refs changing don't trigger
  // effects on their own.
  const [chartReady, setChartReady] = useState(0);

  // Callback ref — fires as soon as the container div attaches/detaches. This
  // avoids the common pitfall where a plain `useRef` + `useEffect([])` misses
  // the initial mount because of conditional rendering upstream, and also
  // handles React strict-mode teardown/remount cleanly.
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLineRef.current = null;
    }
    if (!node) return;
    const chart = createChart(node, {
      layout: {
        background: { color: "transparent" },
        textColor: "#8b91a1",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(42, 47, 61, 0.4)" },
        horzLines: { color: "rgba(42, 47, 61, 0.4)" },
      },
      rightPriceScale: { borderColor: "#1f2330" },
      timeScale: { borderColor: "#1f2330", timeVisible: true },
      crosshair: { mode: 1 },
      autoSize: true,
    });
    const area = chart.addSeries(AreaSeries, {
      topColor: "rgba(99, 102, 241, 0.35)",
      bottomColor: "rgba(99, 102, 241, 0.00)",
      lineColor: "#6366f1",
      lineWidth: 2,
    });
    chartRef.current = chart;
    seriesRef.current = area;
    setChartReady((n) => n + 1);
  }, []);

  const candles = ohlcvPayload?.data ?? [];
  const hasCandles = candles.length > 0;

  // Recolor series based on mispricing (green if final-hour close was near
  // resolution, red if > 15pp off). Undefined when we have no candle data —
  // we surface that as an empty state rather than a bogus "Δ 0.0pp (correct)".
  const mispricing = useMemo(() => {
    if (!hasCandles || !yes) return null;
    const last = candles[candles.length - 1];
    const delta = Math.abs(last.close - yes.price);
    return { delta, correct: delta < 0.15 };
  }, [candles, hasCandles, yes]);

  useEffect(() => {
    if (!seriesRef.current || !ohlcvPayload?.data) return;
    const data = ohlcvPayload.data.map((c) => ({
      time: (c.timestamp / 1000) as UTCTimestamp,
      value: c.close,
    }));
    seriesRef.current.setData(data);

    // Recolor
    const correct = mispricing?.correct ?? true;
    seriesRef.current.applyOptions({
      lineColor: correct ? "#22c55e" : "#ef4444",
      topColor: correct
        ? "rgba(34, 197, 94, 0.30)"
        : "rgba(239, 68, 68, 0.30)",
      bottomColor: correct
        ? "rgba(34, 197, 94, 0.00)"
        : "rgba(239, 68, 68, 0.00)",
    });

    // Resolution marker — horizontal line at the resolved YES price.
    // Remove any prior line so switching markets doesn't accumulate.
    if (priceLineRef.current) {
      seriesRef.current.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }
    const last = data[data.length - 1];
    if (last && yes) {
      priceLineRef.current = seriesRef.current.createPriceLine({
        price: yes.price,
        color: "#f59e0b",
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `resolved ${(yes.price * 100).toFixed(0)}%`,
      });
    }

    chartRef.current?.timeScale().fitContent();
  }, [ohlcvPayload?.data, mispricing, yes, chartReady]);

  const updateChartContext = useDashboard((s) => s.updateChartContext);
  useEffect(() => {
    if (selected) {
      updateChartContext("price-vs-resolution", {
        visibleMarkets: [selected],
      });
    }
  }, [selected, updateChartContext]);

  return (
    <Card>
      <CardHeader
        title="Price vs resolution"
        subtitle={
          !selected
            ? "No resolved markets available"
            : mispricing
              ? `Final 72h · Δ ${(mispricing.delta * 100).toFixed(1)}pp ${mispricing.correct ? "(correct)" : "(mispriced)"}`
              : ohlcvPayload
                ? "No price history available for this market"
                : "Loading final 72h…"
        }
        right={
          markets.length > 0 && (
            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
              className="max-w-[280px] truncate rounded-md border border-border bg-bg-elev px-2 py-1 text-xs"
            >
              {markets.slice(0, 50).map((m) => (
                <option key={m.marketId} value={m.marketId}>
                  {m.title.slice(0, 56)}
                  {m.title.length > 56 ? "…" : ""}
                </option>
              ))}
            </select>
          )
        }
      />
      <CardBody>
        <div className="relative">
          <div ref={containerRef} className="h-[300px] w-full" />
          {markets.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-card px-6 text-center text-sm text-fg-muted">
              No resolved markets with final-72h candle history are currently available.
            </div>
          ) : !ohlcvPayload ? (
            <div className="absolute inset-0 bg-bg-card">
              <ChartSkeleton />
            </div>
          ) : !hasCandles ? (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-card px-6 text-center text-sm text-fg-muted">
              PMXT returned no 1h candles for this outcome — try another market.
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
