import Image from "next/image";

import { DashboardEnterLink } from "@/components/landing/DashboardEnterLink";

export default function LandingPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-10 sm:px-6 sm:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_55%)]" />

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-6 sm:gap-8">
        <Image
          src="/trustmebro-logo.png"
          alt="Trust Me Bro Analytics"
          width={1024}
          height={288}
          className="h-auto w-full max-w-lg shrink-0 px-2"
          priority
        />

        <section className="w-full rounded-2xl border border-border bg-bg-card/90 p-6 text-center shadow-xl backdrop-blur-sm sm:p-8 md:p-12">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-muted sm:mb-6 sm:text-xs">
            Prediction markets, decoded.
          </p>
          <h1 className="text-3xl font-black leading-tight text-fg sm:text-4xl md:text-5xl">
            Don&apos;t trust the vibe.
            <br />
            <span className="text-accent">Trust me bro.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-fg-muted sm:mt-5 sm:text-base md:text-lg">
            Live odds, volume, and whale flow in one dashboard, plus an AI
            assistant that reads the market with you.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <span className="rounded-full border border-border bg-bg px-3 py-1 text-xs text-fg-muted">
              Real-time analytics
            </span>
            <span className="rounded-full border border-border bg-bg px-3 py-1 text-xs text-fg-muted">
              Category filters
            </span>
            <span className="rounded-full border border-border bg-bg px-3 py-1 text-xs text-fg-muted">
              Ask AI
            </span>
          </div>

          <div className="mt-8 flex flex-col items-center">
            <DashboardEnterLink className="inline-flex items-center rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover">
              Open dashboard
            </DashboardEnterLink>
            <p className="mt-3 text-xs text-fg-subtle">
              For research and educational use only, not financial advice.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
