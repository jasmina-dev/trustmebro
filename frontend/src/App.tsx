// utilized github copilot

import { useEffect, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { Chatbot } from "./components/Chatbot";
import { LandingPage } from "./components/LandingPage";
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
            Streaming prediction market activity into a single view of crowd
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

      <main className="main">
        <Dashboard
          category={category}
          onCategoryChange={setCategory}
          categoryOptions={CATEGORIES}
          onContextChange={setDashboardContext}
        />
      </main>

      <div className="chat-toggle-wrap">
        <button className="chat-toggle" onClick={() => setChatOpen((o) => !o)}>
          {chatOpen ? "Close" : "Ask AI"}
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
