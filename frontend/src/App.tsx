import { useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { Chatbot } from './components/Chatbot'
import './App.css'

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'politics', label: 'Politics' },
  { id: 'economy', label: 'Economy' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'science', label: 'Science' },
] as const

export default function App() {
  const [category, setCategory] = useState<string>('all')
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <h1 className="logo">TrustMeBro Analytics</h1>
          <p className="tagline">Prediction markets dashboard & research assistant</p>
        </div>
      </header>

      <nav className="filters">
        <div className="filters-inner">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`filter-btn ${category === c.id ? 'active' : ''}`}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="main">
        <Dashboard category={category} />
      </main>

      <div className="chat-toggle-wrap">
        <button
          className="chat-toggle"
          onClick={() => setChatOpen((o) => !o)}
          aria-label={chatOpen ? 'Close chatbot' : 'Open chatbot'}
        >
          {chatOpen ? '✕' : '💬'} {chatOpen ? 'Close' : 'Ask AI'}
        </button>
      </div>

      {chatOpen && (
        <Chatbot
          onClose={() => setChatOpen(false)}
          dashboardContext={null}
        />
      )}
    </div>
  )
}
