"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboard } from "@/lib/store";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/lib/types";

const SUGGESTED = [
  "Why do sports markets skew toward NO?",
  "Which markets have the biggest Polymarket vs Kalshi spread right now?",
  "Explain the liquidity gap chart",
  "What's the most inefficient market today?",
];

export function ChatPanel() {
  const {
    chatOpen,
    setChatOpen,
    chatMessages,
    chatStreaming,
    setChatStreaming,
    addChatMessage,
    appendChatAssistantChunk,
    clearChat,
    getContextSnapshot,
  } = useDashboard();

  const [input, setInput] = useState("");
  const [showContext, setShowContext] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatStreaming]);

  const send = async (text: string) => {
    if (!text.trim() || chatStreaming) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      createdAt: Date.now(),
    };
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };
    addChatMessage(userMsg);
    addChatMessage(assistantMsg);
    setInput("");
    setChatStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const snapshot = getContextSnapshot();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [
            ...chatMessages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: userMsg.content },
          ],
          context: snapshot,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        appendChatAssistantChunk(
          assistantMsg.id,
          `\n\n*Error ${res.status}: ${err}*`,
        );
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        appendChatAssistantChunk(assistantMsg.id, decoder.decode(value));
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        appendChatAssistantChunk(
          assistantMsg.id,
          `\n\n*Stream error: ${(err as Error).message}*`,
        );
      }
    } finally {
      setChatStreaming(false);
      abortRef.current = null;
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setChatOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] transition-opacity md:hidden",
          chatOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      {/* Panel */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-border bg-bg-elev/95 shadow-2xl backdrop-blur-lg transition-transform duration-300 md:w-[420px]",
          chatOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold tracking-tight">AI Analyst</div>
            <div className="text-[10px] text-fg-muted">
              claude-sonnet · reads your dashboard context
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowContext((v) => !v)}
              className={cn(
                "rounded-md border border-border px-2 py-1 text-[10px] transition-colors",
                showContext
                  ? "bg-accent text-white"
                  : "bg-bg-card text-fg-muted hover:text-fg",
              )}
              title="Show what data is injected into the AI's context"
            >
              Context
            </button>
            <button
              onClick={clearChat}
              className="rounded-md border border-border bg-bg-card px-2 py-1 text-[10px] text-fg-muted hover:text-fg"
            >
              Clear
            </button>
            <button
              onClick={() => setChatOpen(false)}
              className="rounded-md p-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>
        </div>

        {showContext && <ContextSnapshot />}

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {chatMessages.length === 0 && (
            <div className="space-y-3">
              <p className="text-xs text-fg-muted">
                Ask anything about the markets and inefficiencies on your
                dashboard. The AI can see your filters, visible markets, and
                every score that's currently rendered.
              </p>
              <div className="space-y-1.5">
                {SUGGESTED.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-left text-xs text-fg hover:border-accent hover:bg-bg-hover"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chatMessages.map((m) => (
            <MessageBubble key={m.id} msg={m} streaming={chatStreaming} />
          ))}

          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2 border-t border-border bg-bg-card/60 p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the dashboard…"
            disabled={chatStreaming}
            className="flex-1 rounded-md border border-border bg-bg-elev px-3 py-2 text-xs focus:border-accent disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={chatStreaming || !input.trim()}
            className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {chatStreaming ? "…" : "Send"}
          </button>
        </form>
      </aside>
    </>
  );
}

function MessageBubble({
  msg,
  streaming,
}: {
  msg: ChatMessage;
  streaming: boolean;
}) {
  const isUser = msg.role === "user";
  const isEmptyAssistant =
    !isUser && msg.content.length === 0 && streaming;

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed",
          isUser
            ? "bg-accent text-white"
            : "border border-border bg-bg-card text-fg",
        )}
      >
        {isEmptyAssistant ? (
          <TypingIndicator />
        ) : (
          <div className="chat-prose whitespace-pre-wrap">{msg.content}</div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg-muted" />
      <span
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg-muted"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg-muted"
        style={{ animationDelay: "300ms" }}
      />
    </div>
  );
}

function ContextSnapshot() {
  const snapshot = useDashboard((s) => s.getContextSnapshot());
  return (
    <div className="max-h-48 overflow-auto border-b border-border bg-bg px-4 py-3 font-mono text-[10px] leading-relaxed text-fg-muted">
      <div className="mb-1 flex items-center justify-between text-fg">
        <span className="font-semibold uppercase tracking-wider">
          Context snapshot
        </span>
        <span className="text-fg-subtle">
          {snapshot.visibleMarkets.length} markets · {snapshot.inefficiencyScores.length} scores
        </span>
      </div>
      <pre className="whitespace-pre-wrap break-all">
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    </div>
  );
}
