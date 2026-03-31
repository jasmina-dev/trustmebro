// utilized github copilot

import { useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { Chatbot } from "./components/Chatbot";
import { LandingPage } from "./components/LandingPage";
import "./App.css";

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

  if (!showDashboard) {
    return (
      <LandingPage onEnterDashboard={() => setShowDashboard(true)} />
    );
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
        </div>
      </header>

      <nav className="filters">
        <div className="filters-inner">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`filter-btn ${category === c.id ? "active" : ""}`}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="main">
        <Dashboard category={category} onContextChange={setDashboardContext} />
      </main>

      <div className="chat-toggle-wrap">
        <button
          className="chat-toggle"
          onClick={() => setChatOpen((o) => !o)}
          aria-label={chatOpen ? "Close chatbot" : "Open chatbot"}
        >
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
