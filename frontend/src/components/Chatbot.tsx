// utilized github copilot

import { useState, useRef, useEffect, useMemo } from "react";
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

  const promptStarters = useMemo(() => {
    const lines = (dashboardContext ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const byPrefix = (prefix: string): string | null => {
      const line = lines.find((l) => l.startsWith(prefix));
      if (!line) return null;
      const value = line.slice(prefix.length).trim();
      return value || null;
    };

    const focusedEvent = byPrefix("Focused event:");
    const activeTab = byPrefix("Active tab:");
    const activeFilter = byPrefix("Active filter:");
    const volumeFilter = byPrefix("Volume filter:");

    const topMarketLine = lines.find((line) => line.startsWith("- "));
    const topMarket = topMarketLine
      ? topMarketLine
          .replace(/^-\s*/, "")
          .replace(/:\s*\$[^$]*$/, "")
          .trim() || null
      : null;

    const starters: string[] = [
      "Give me a quick summary of what stands out right now in this dashboard.",
    ];

    if (activeTab === "Markets") {
      starters.push(
        "Which events look most overextended in probability versus available market depth?",
      );
      starters.push(
        "Find one market that looks underpriced and one that looks overpriced on this screen, with your reasoning.",
      );
    } else if (activeTab === "Trade flow") {
      starters.push(
        "Interpret the current trade-flow trend and tell me whether momentum is accelerating or fading.",
      );
      starters.push(
        "How concentrated is current flow among whales versus broad participation, and why does that matter?",
      );
    } else if (activeTab === "News & sentiment") {
      starters.push(
        "Based on this view, what narrative is the market pricing in right now, and what could challenge it?",
      );
      starters.push(
        "Give me a bullish and bearish interpretation of the current sentiment signals on screen.",
      );
    } else if (activeTab === "Whale activity") {
      starters.push(
        "Which whale behavior here looks most unusual, and what are two plausible explanations?",
      );
      starters.push(
        "Are whale positions reinforcing consensus or betting against it in this snapshot?",
      );
    } else if (activeTab === "Research notes") {
      starters.push(
        "Draft three concise research notes from this context: key signal, uncertainty, and next check.",
      );
      starters.push(
        "Turn the current dashboard state into a short hypothesis I can test over the next 24 hours.",
      );
    }

    if (focusedEvent) {
      starters.push(
        `Break down why \"${focusedEvent}\" looks interesting right now, including volume, probability, and whale activity.`,
      );
      starters.push(
        `What are the biggest risk factors or caveats for \"${focusedEvent}\" based on the current signals?`,
      );
    } else if (topMarket) {
      starters.push(
        `Why is \"${topMarket}\" near the top by volume, and what should I watch next?`,
      );
    }

    if (activeFilter || volumeFilter) {
      starters.push(
        `Given the current filters (${[activeFilter, volumeFilter].filter(Boolean).join(", ")}), what patterns could be hidden from this view?`,
      );
    }

    starters.push(
      "Which market on screen looks most mispriced versus the rest of its event, and why?",
    );

    return Array.from(new Set(starters)).slice(0, 4);
  }, [dashboardContext]);

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

  async function sendMessage(rawText: string) {
    const text = rawText.trim();
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await sendMessage(input);
  }

  function handleStarterClick(starter: string) {
    void sendMessage(starter);
  }

  function handleClearChat() {
    abortControllerRef.current?.abort();
    setLoading(false);
    setError(null);
    setInput("");
    setMessages([INITIAL_ASSISTANT_MESSAGE]);
  }

  function handleExportConversation() {
    const transcript = messages
      .filter((m) => m.content.trim().length > 0)
      .map((m) => `${m.role === "user" ? "You" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "trustmebro-chat-export.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const canClearChat =
    messages.length > 1 ||
    messages[0]?.content !== INITIAL_ASSISTANT_MESSAGE.content;
  const canExportConversation = !loading && messages.some(
    (m, i) => m.role === "assistant" && i > 0 && m.content.trim().length > 0,
  );

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
            className="chatbot-export"
            onClick={handleExportConversation}
            disabled={!canExportConversation}
            aria-label="Export conversation"
          >
            Export
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

      {promptStarters.length > 0 && (
        <div className="chatbot-starters" aria-label="Suggested prompts">
          <p className="chatbot-starters-label">Try asking</p>
          <div className="chatbot-starter-list">
            {promptStarters.map((starter) => (
              <button
                key={starter}
                type="button"
                className="chatbot-starter-chip"
                onClick={() => handleStarterClick(starter)}
                disabled={loading}
              >
                {starter}
              </button>
            ))}
          </div>
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
