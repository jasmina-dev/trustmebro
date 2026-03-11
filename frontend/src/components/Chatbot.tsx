// utilized github copilot

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { streamChatMessage } from "../api/client";
import "./Chatbot.css";

interface ChatbotProps {
  onClose: () => void;
  dashboardContext: string | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function Chatbot({ onClose, dashboardContext }: ChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm the TrustMeBro assistant. I can help you understand prediction market data, trends, and possible inefficiencies. I don't give financial advice or tell you to place bets—just education and data context. What would you like to know?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = controller;

    try {
      await streamChatMessage(
        text,
        (chunk) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = {
              ...last,
              content: last.content + chunk,
            };
            return updated;
          });
        },
        dashboardContext ?? undefined,
        history,
        controller.signal,
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setLoading(false);
        return;
      }
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: `Sorry, I couldn't respond: ${msg}`,
        };
        return updated;
      });
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }

  return (
    <div className="chatbot-panel" role="dialog" aria-label="AI assistant chat">
      <div className="chatbot-header">
        <h2>Ask the assistant</h2>
        <button
          type="button"
          className="chatbot-close"
          onClick={() => {
            abortControllerRef.current?.abort();
            onClose();
          }}
          aria-label="Close chat"
        >
          ✕
        </button>
      </div>

      <div className="chatbot-messages">
        {messages.map((m, i) => {
          const isThinking =
            loading &&
            i === messages.length - 1 &&
            m.role === "assistant" &&
            m.content === "";
          return (
            <div key={i} className={`chat-msg ${m.role}`}>
              <span className="chat-role">
                {m.role === "user" ? "You" : "Assistant"}
              </span>
              <div className={`chat-content${isThinking ? " typing" : ""}`}>
                {isThinking ? (
                  "Thinking…"
                ) : m.role === "assistant" ? (
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                ) : (
                  m.content
                )}
              </div>
            </div>
          );
        })}
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
  );
}
