// utilized github copilot

import { useEffect, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { Chatbot } from "./components/Chatbot";
import { LandingPage } from "./components/LandingPage";
import { type MarketSource } from "./api/client";
import "./App.css";

const THEME_STORAGE_KEY = "trustmebro-theme-v2";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "politics", label: "Politics" },
  { id: "economy", label: "Economy" },
  { id: "entertainment", label: "Entertainment" },
  { id: "technology", label: "Technology" },
  { id: "crypto", label: "Crypto" },
  { id: "climate", label: "Climate" },
  { id: "other", label: "Other" },
] as const;

export default function App() {
  const [showDashboard, setShowDashboard] = useState(false);
  const [source, setSource] = useState<MarketSource>("polymarket");
  const [category, setCategory] = useState<string>("all");
  const [chatOpen, setChatOpen] = useState(false);
  const [dashboardContext, setDashboardContext] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;

    return "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  if (!showDashboard) {
    return <LandingPage onEnterDashboard={() => setShowDashboard(true)} />;
  }

  const sourceOptions: { id: MarketSource; label: string }[] = [
    { id: "polymarket", label: "Polymarket" },
    { id: "kalshi", label: "Kalshi" },
  ];

  const activeSourceLabel =
    sourceOptions.find((option) => option.id === source)?.label ?? source;

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-brand">
            <h1 className="logo">TrustMeBro Analytics</h1>
            <p className="tagline">
              Prediction markets dashboard & research assistant
            </p>
          </div>
          <p className="header-mission">
            Streaming {activeSourceLabel} activity into a single view of crowd
            expectations, momentum, and structural inefficiencies.
          </p>
          <button
            className="theme-toggle"
            onClick={() =>
              setTheme((prev) => (prev === "dark" ? "light" : "dark"))
            }
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </header>

      <nav className="filters source-switcher" aria-label="Market source">
        <div className="filters-inner">
          <span className="source-switcher-label">Source</span>
          {sourceOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`filter-btn ${source === option.id ? "active" : ""}`}
              onClick={() => setSource(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="main">
        <Dashboard
          source={source}
          category={category}
          onCategoryChange={setCategory}
          categoryOptions={CATEGORIES}
          onContextChange={setDashboardContext}
        />
      </main>

      <div className="chat-toggle-wrap">
        <button className="chat-toggle" onClick={() => setChatOpen((o) => !o)}>
          {chatOpen ? "Close chat" : "Ask AI"}
        </button>
      </div>

      {chatOpen && (
        <Chatbot
          onClose={() => setChatOpen(false)}
          dashboardContext={dashboardContext}
        />
      )}
    </div>
  );
}
