/**
 * Zustand dashboard store.
 *
 * Single source of truth for:
 *   - UI filters (venue / category / date range)
 *   - live chart context (fed into the chatbot's system prompt)
 *   - chat panel state (open, messages, streaming)
 *
 * Every chart component calls `updateChartContext(id, data)` when its data
 * loads; the chatbot always sees the freshest snapshot.
 */

"use client";

import { create } from "zustand";
import type {
  ChatMessage,
  DashboardContextSnapshot,
  ExchangeFilter,
  InefficiencyScore,
  ResolutionBiasBucket,
  UnifiedMarket,
} from "./types";

interface DashboardState {
  // ------- Filters -------
  activeVenue: ExchangeFilter;
  activeCategory: string; // "All" or a normalized category
  dateRange: { start: string; end: string };

  // ------- Live chart context (fed to chatbot) -------
  activeChart: string;
  visibleMarkets: UnifiedMarket[];
  inefficiencyScores: InefficiencyScore[];
  resolutionStats: ResolutionBiasBucket[];

  // ------- Chat panel -------
  chatOpen: boolean;
  chatMessages: ChatMessage[];
  chatStreaming: boolean;

  // ------- Actions -------
  setVenue: (v: ExchangeFilter) => void;
  setCategory: (c: string) => void;
  setDateRange: (r: { start: string; end: string }) => void;

  setActiveChart: (id: string) => void;
  updateChartContext: (
    id: string,
    patch: Partial<
      Pick<
        DashboardState,
        "visibleMarkets" | "inefficiencyScores" | "resolutionStats"
      >
    >,
  ) => void;

  setChatOpen: (open: boolean) => void;
  addChatMessage: (msg: ChatMessage) => void;
  appendChatAssistantChunk: (id: string, chunk: string) => void;
  setChatStreaming: (streaming: boolean) => void;
  clearChat: () => void;

  getContextSnapshot: () => DashboardContextSnapshot;
}

const initialDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString(), end: end.toISOString() };
};

export const useDashboard = create<DashboardState>((set, get) => ({
  activeVenue: "all",
  activeCategory: "All",
  dateRange: initialDateRange(),

  activeChart: "overview",
  visibleMarkets: [],
  inefficiencyScores: [],
  resolutionStats: [],

  chatOpen: false,
  chatMessages: [],
  chatStreaming: false,

  setVenue: (v) => set({ activeVenue: v }),
  setCategory: (c) => set({ activeCategory: c }),
  setDateRange: (r) => set({ dateRange: r }),

  setActiveChart: (id) => set({ activeChart: id }),
  updateChartContext: (id, patch) =>
    set((prev) => {
      const next: Partial<DashboardState> = { activeChart: id };
      if (patch.visibleMarkets !== undefined) {
        // Merge-dedupe by marketId so multiple charts contributing to context
        // don't overwrite each other.
        const byId = new Map<string, UnifiedMarket>();
        for (const m of prev.visibleMarkets) byId.set(m.marketId, m);
        for (const m of patch.visibleMarkets) byId.set(m.marketId, m);
        next.visibleMarkets = Array.from(byId.values()).slice(0, 200);
      }
      if (patch.inefficiencyScores !== undefined) {
        next.inefficiencyScores = patch.inefficiencyScores.slice(0, 100);
      }
      if (patch.resolutionStats !== undefined) {
        next.resolutionStats = patch.resolutionStats;
      }
      return next as DashboardState;
    }),

  setChatOpen: (open) => set({ chatOpen: open }),
  addChatMessage: (msg) =>
    set((prev) => ({ chatMessages: [...prev.chatMessages, msg] })),
  appendChatAssistantChunk: (id, chunk) =>
    set((prev) => ({
      chatMessages: prev.chatMessages.map((m) =>
        m.id === id ? { ...m, content: m.content + chunk } : m,
      ),
    })),
  setChatStreaming: (streaming) => set({ chatStreaming: streaming }),
  clearChat: () => set({ chatMessages: [] }),

  getContextSnapshot: (): DashboardContextSnapshot => {
    const s = get();
    return {
      filters: {
        venue: s.activeVenue,
        category: s.activeCategory,
        dateRange: s.dateRange,
      },
      activeChart: s.activeChart,
      visibleMarkets: s.visibleMarkets.slice(0, 30).map((m) => ({
        marketId: m.marketId,
        title: m.title,
        exchange: m.exchange,
        category: m.category,
        volume24h: m.volume24h,
        liquidity: m.liquidity,
      })),
      inefficiencyScores: s.inefficiencyScores.slice(0, 20),
      resolutionStats: s.resolutionStats,
    };
  },
}));
