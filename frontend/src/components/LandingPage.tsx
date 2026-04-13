import "./LandingPage.css";

type LandingPageProps = {
  onEnterDashboard: () => void;
};

export function LandingPage({ onEnterDashboard }: LandingPageProps) {
  return (
    <div className="landing">
      <div className="landing-glow" aria-hidden />
      <div className="landing-grid" aria-hidden />

      <header className="landing-top">
        <span className="landing-brand">TrustMeBro Analytics</span>
      </header>

      <main className="landing-main">
        <div className="landing-hero">
          <p className="landing-eyebrow">Prediction markets, decoded</p>
          <h1 className="landing-headline">
            Don&apos;t trust the vibe.
            <span className="landing-headline-accent"> Trust me bro.</span>
          </h1>
          <p className="landing-lede">
            Live odds, volume, and whale flow in one dashboard—plus an AI
            assistant that reads the market with you. Stop guessing what moved
            the line.
          </p>
          <div className="landing-pills" aria-label="Highlights">
            <span className="landing-pill">Real-time analytics</span>
            <span className="landing-pill">Category filters</span>
            <span className="landing-pill">Ask AI</span>
          </div>
          <div className="landing-cta">
            <button
              type="button"
              className="landing-cta-primary"
              onClick={onEnterDashboard}
            >
              Open dashboard
            </button>
            <p className="landing-cta-hint">
              By opening the dashboard, you confirm that you understand this
              site is for research purposes only and not financial advice.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
