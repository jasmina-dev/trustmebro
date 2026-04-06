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

const INITIAL_ASSISTANT_MESSAGE: Message = {
  role: "assistant",
  content:
    "Hi! I'm the TrustMeBro assistant. I can help you understand prediction market data, trends, and possible inefficiencies. I don't give financial advice or tell you to place bets—just education and data context. What would you like to know?",
};

export function Chatbot({ onClose, dashboardContext }: ChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([
    INITIAL_ASSISTANT_MESSAGE,
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

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

  function handleClearChat() {
    abortControllerRef.current?.abort();
    setLoading(false);
    setError(null);
    setInput("");
    setMessages([INITIAL_ASSISTANT_MESSAGE]);
  }

  const canClearChat =
    messages.length > 1 ||
    messages[0]?.content !== INITIAL_ASSISTANT_MESSAGE.content;

  return (
    <div
      className={`chatbot-panel${isFullscreen ? " fullscreen" : ""}`}
      role="dialog"
      aria-label="AI assistant chat"
    >
      <div className="chatbot-header">
        <h2>Ask the assistant</h2>
        <div className="chatbot-header-actions">
          <button
            type="button"
            className="chatbot-clear"
            onClick={handleClearChat}
            disabled={!canClearChat}
            aria-label="Clear chat"
          >
            Clear
          </button>
          <button
            type="button"
            className="chatbot-fullscreen"
            onClick={() => setIsFullscreen((prev) => !prev)}
            aria-label={
              isFullscreen ? "Restore chat size" : "Open chat in full screen"
            }
            aria-pressed={isFullscreen}
            title={isFullscreen ? "Restore" : "Fullscreen"}
          >
            {isFullscreen ? (
              <svg
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="5"
                  width="10"
                  height="10"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <rect
                  x="7"
                  y="3"
                  width="10"
                  height="10"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
            ) : (
              <svg
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M8 2H2v6M12 2h6v6M18 12v6h-6M8 18H2v-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            <span className="sr-only">
              {isFullscreen ? "Restore chat size" : "Open chat in full screen"}
            </span>
          </button>
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
