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

async function goToDashboard() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /open dashboard/i }));
}

describe("App", () => {
  it("renders header and default filter", async () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /don't trust the vibe/i }),
    ).toBeInTheDocument();
    await goToDashboard();
    expect(
      screen.getByRole("heading", { name: /trustmebro analytics/i }),
    ).toBeInTheDocument();
    const categorySelect = screen.getByRole("combobox", { name: /category/i });
    expect(categorySelect).toHaveValue("all");
    await waitFor(() => {
      expect(
        screen.queryByText(/loading market data/i),
      ).not.toBeInTheDocument();
    });
  });

  it("activates category filter when clicked", async () => {
    const user = userEvent.setup();
    render(<App />);
    await goToDashboard();
    await waitFor(() => {
      expect(
        screen.queryByText(/loading market data/i),
      ).not.toBeInTheDocument();
    });
    const categorySelect = screen.getByRole("combobox", { name: /category/i });
    await user.selectOptions(categorySelect, "politics");
    expect(categorySelect).toHaveValue("politics");
    expect(categorySelect).not.toHaveValue("all");
  });

  it("opens and closes chatbot panel", async () => {
    const user = userEvent.setup();
    render(<App />);
    await goToDashboard();
    await waitFor(() => {
      expect(
        screen.queryByText(/loading market data/i),
      ).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /ask ai/i }));
    expect(
      screen.getByRole("dialog", { name: /ai assistant chat/i }),
    ).toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", { name: /^Close chat$/i })[0],
    );
    expect(
      screen.queryByRole("dialog", { name: /ai assistant chat/i }),
    ).not.toBeInTheDocument();
  });
});
