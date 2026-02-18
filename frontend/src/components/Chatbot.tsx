import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { sendChatMessage } from '../api/client'
import './Chatbot.css'

interface ChatbotProps {
  onClose: () => void
  dashboardContext: string | null
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function Chatbot({ onClose, dashboardContext }: ChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm the TrustMeBro assistant. I can help you understand prediction market data, trends, and possible inefficiencies. I don't give financial advice or tell you to place bets—just education and data context. What would you like to know?",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setLoading(true)
    setError(null)

    try {
      const { reply } = await sendChatMessage(text, dashboardContext ?? undefined)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      setError(msg)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry, I couldn't respond: ${msg}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="chatbot-panel" role="dialog" aria-label="AI assistant chat">
      <div className="chatbot-header">
        <h2>Ask the assistant</h2>
        <button
          type="button"
          className="chatbot-close"
          onClick={onClose}
          aria-label="Close chat"
        >
          ✕
        </button>
      </div>

      <div className="chatbot-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <span className="chat-role">{m.role === 'user' ? 'You' : 'Assistant'}</span>
            <div className="chat-content">
              {m.role === 'assistant' ? (
                <ReactMarkdown>{m.content}</ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-msg assistant">
            <span className="chat-role">Assistant</span>
            <div className="chat-content typing">Thinking…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="chatbot-error" role="alert">
          {error}
        </div>
      )}

      <form className="chatbot-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about markets, trends, or inefficiencies…"
          disabled={loading}
          aria-label="Chat message"
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
