import dynamic from "next/dynamic";
import { TopNav } from "@/components/navigation/TopNav";
import { Sidebar } from "@/components/navigation/Sidebar";
import { KPIRow } from "@/components/KPIRow";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ChartSkeleton } from "@/components/ui/Skeleton";

/**
 * All chart modules are lazy-loaded with `next/dynamic` so the initial bundle
 * only ships the shell + KPI row. Each module falls back to a skeleton until
 * its JS chunk arrives.
 */
const ResolutionBiasHeatmap = dynamic(
  () =>
    import("@/components/charts/ResolutionBiasHeatmap").then(
      (m) => m.ResolutionBiasHeatmap,
    ),
  { loading: () => <ChartSkeleton label="Resolution bias heatmap" />, ssr: false },
);

const CrossVenueDivergence = dynamic(
  () =>
    import("@/components/charts/CrossVenueDivergence").then(
      (m) => m.CrossVenueDivergence,
    ),
  { loading: () => <ChartSkeleton label="Cross-venue divergence" />, ssr: false },
);

const ResolutionBiasDistribution = dynamic(
  () =>
    import("@/components/charts/ResolutionBiasDistribution").then(
      (m) => m.ResolutionBiasDistribution,
    ),
  {
    loading: () => <ChartSkeleton label="Resolution distribution" />,
    ssr: false,
  },
);

const InefficiencyLeaderboard = dynamic(
  () =>
    import("@/components/charts/InefficiencyLeaderboard").then(
      (m) => m.InefficiencyLeaderboard,
    ),
  { loading: () => <ChartSkeleton label="Inefficiency leaderboard" />, ssr: false },
);

const LiquidityGapScatter = dynamic(
  () =>
    import("@/components/charts/LiquidityGapScatter").then(
      (m) => m.LiquidityGapScatter,
    ),
  { loading: () => <ChartSkeleton label="Liquidity gap scatter" />, ssr: false },
);

const PriceVsResolution = dynamic(
  () =>
    import("@/components/charts/PriceVsResolution").then(
      (m) => m.PriceVsResolution,
    ),
  { loading: () => <ChartSkeleton label="Price vs resolution" />, ssr: false },
);

const MarketMomentum = dynamic(
  () =>
    import("@/components/charts/MarketMomentum").then((m) => m.MarketMomentum),
  { loading: () => <ChartSkeleton label="Market momentum" />, ssr: false },
);

const CalibrationCurve = dynamic(
  () =>
    import("@/components/charts/CalibrationCurve").then(
      (m) => m.CalibrationCurve,
    ),
  { loading: () => <ChartSkeleton label="Calibration curve" />, ssr: false },
);

const EfficiencyTimeline = dynamic(
  () =>
    import("@/components/charts/EfficiencyTimeline").then(
      (m) => m.EfficiencyTimeline,
    ),
  { loading: () => <ChartSkeleton label="Efficiency timeline" />, ssr: false },
);

const ChatPanel = dynamic(
  () => import("@/components/chat/ChatPanel").then((m) => m.ChatPanel),
  { ssr: false },
);

export default function DashboardPage() {
  return (
    <div className="min-h-screen">
      <TopNav />

      <div className="flex">
        <Sidebar />

        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px] space-y-6">
            <section id="overview" className="space-y-4">
              <ErrorBoundary fallbackLabel="KPIs unavailable">
                <KPIRow />
              </ErrorBoundary>
            </section>

            <section id="resolution-bias-heatmap" className="grid gap-4 lg:grid-cols-2">
              <ErrorBoundary fallbackLabel="Resolution bias heatmap">
                <ResolutionBiasHeatmap />
              </ErrorBoundary>
              <ErrorBoundary fallbackLabel="Resolution distribution">
                <ResolutionBiasDistribution />
              </ErrorBoundary>
            </section>

            <section id="cross-venue-divergence" className="grid gap-4">
              <ErrorBoundary fallbackLabel="Cross-venue divergence">
                <CrossVenueDivergence />
              </ErrorBoundary>
            </section>

            <section id="market-momentum" className="grid gap-4">
              <ErrorBoundary fallbackLabel="Market momentum">
                <MarketMomentum />
              </ErrorBoundary>
            </section>

            <section id="calibration" className="grid gap-4 xl:grid-cols-2">
              <ErrorBoundary fallbackLabel="Calibration curve">
                <CalibrationCurve />
              </ErrorBoundary>
              <ErrorBoundary fallbackLabel="Efficiency timeline">
                <div id="efficiency-timeline">
                  <EfficiencyTimeline />
                </div>
              </ErrorBoundary>
            </section>

            <section id="liquidity-gap" className="grid gap-4 xl:grid-cols-2">
              <ErrorBoundary fallbackLabel="Liquidity gap scatter">
                <LiquidityGapScatter />
              </ErrorBoundary>
              <ErrorBoundary fallbackLabel="Price vs resolution">
                <div id="price-vs-resolution">
                  <PriceVsResolution />
                </div>
              </ErrorBoundary>
            </section>

            <section id="leaderboard">
              <ErrorBoundary fallbackLabel="Inefficiency leaderboard">
                <InefficiencyLeaderboard />
              </ErrorBoundary>
            </section>

            <footer className="pb-8 pt-4 text-center text-[10px] text-fg-subtle">
              Data via <a href="https://pmxt.dev" className="underline hover:text-fg-muted">pmxt.dev</a> ·
              Upstash-cached · Responses tag X-Cache: HIT/MISS for debugging
            </footer>
          </div>
        </main>
      </div>

      <ChatPanel />
    </div>
  );
}
