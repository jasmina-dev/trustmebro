import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-6 py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_55%)]" />

      <section className="relative z-10 w-full max-w-3xl rounded-2xl border border-border bg-bg-card/90 p-8 text-center shadow-xl backdrop-blur-sm md:p-12">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-fg-muted">
          Prediction markets, decoded
        </p>
        <h1 className="text-4xl font-black leading-tight text-fg md:text-5xl">
          Don&apos;t trust the vibe.
          <span className="text-accent"> Trust me bro.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-fg-muted md:text-lg">
          Live odds, volume, and whale flow in one dashboard, plus an AI assistant
          that reads the market with you.
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
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Open dashboard
          </Link>
          <p className="mt-3 text-xs text-fg-subtle">
            For research and educational use only, not financial advice.
          </p>
        </div>
      </section>
    </main>
  );
}
