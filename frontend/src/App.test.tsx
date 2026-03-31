import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { TradesAnalyticsResponse } from "./api/client";

const emptyTradesResponse: TradesAnalyticsResponse = {
  analytics: {
    totalTrades: 0,
    totalVolume: 0,
    uniqueTraders: 0,
    uniqueMarkets: 0,
    timeRange: { earliest: "", latest: "" },
    byTime: [],
    perMarket: [],
    whaleTraders: [],
    preDeadlineWindow: {
      windowHours: 24,
      windowStart: "",
      windowEnd: "",
      volume: 0,
      tradeCount: 0,
      shareOfTotalVolume: 0,
    },
  },
  count: 0,
};

vi.mock("./api/client", () => ({
  fetchEvents: vi.fn(() => Promise.resolve([])),
  fetchMarkets: vi.fn(() => Promise.resolve([])),
  fetchTradesAnalytics: vi.fn(() => Promise.resolve(emptyTradesResponse)),
  sendChatMessage: vi.fn(() => Promise.resolve({ reply: "ok" })),
}));

describe("App", () => {
  it("renders header and default filter", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /trustmebro analytics/i })).toBeInTheDocument();
    const allBtn = screen.getByRole("button", { name: /^All$/i });
    expect(allBtn).toHaveClass("active");
    await waitFor(() => {
      expect(screen.queryByText(/loading market data/i)).not.toBeInTheDocument();
    });
  });

  it("activates category filter when clicked", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText(/loading market data/i)).not.toBeInTheDocument();
    });
    const politics = screen.getByRole("button", { name: /^Politics$/i });
    await user.click(politics);
    expect(politics).toHaveClass("active");
    expect(screen.getByRole("button", { name: /^All$/i })).not.toHaveClass("active");
  });

  it("opens and closes chatbot panel", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText(/loading market data/i)).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /open chatbot/i }));
    expect(screen.getByRole("dialog", { name: /ai assistant chat/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Close chat$/i }));
    expect(screen.queryByRole("dialog", { name: /ai assistant chat/i })).not.toBeInTheDocument();
  });
});
