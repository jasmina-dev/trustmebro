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
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

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

  it("loads initial theme from localStorage and toggles theme state", async () => {
    const user = userEvent.setup();
    localStorage.setItem("trustmebro-theme-v2", "light");

    render(<App />);
    await goToDashboard();
    await waitFor(() => {
      expect(
        screen.queryByText(/loading market data/i),
      ).not.toBeInTheDocument();
    });

    const themeToggle = screen.getByRole("button", { name: /switch to dark mode/i });
    expect(themeToggle).toHaveTextContent("Dark mode");
    expect(document.documentElement.dataset.theme).toBe("light");

    await user.click(themeToggle);
    expect(screen.getByRole("button", { name: /switch to light mode/i })).toHaveTextContent(
      "Light mode",
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("trustmebro-theme-v2")).toBe("dark");
  });

  it("keeps source radio selected and handles keyboard navigation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await goToDashboard();
    await waitFor(() => {
      expect(
        screen.queryByText(/loading market data/i),
      ).not.toBeInTheDocument();
    });

    const sourceRadio = screen.getByRole("radio", { name: /polymarket/i });
    expect(sourceRadio).toHaveAttribute("aria-checked", "true");
    expect(sourceRadio).toHaveAttribute("tabindex", "0");

    sourceRadio.focus();
    await user.keyboard("{ArrowRight}");
    expect(sourceRadio).toHaveFocus();
    expect(sourceRadio).toHaveAttribute("aria-checked", "true");
  });

  it("toggles chat button label and shows context-driven prompt chips", async () => {
    const user = userEvent.setup();
    render(<App />);
    await goToDashboard();
    await waitFor(() => {
      expect(
        screen.queryByText(/loading market data/i),
      ).not.toBeInTheDocument();
    });

    const chatToggle = screen.getByRole("button", { name: /ask ai/i });
    await user.click(chatToggle);
    expect(screen.getByText(/^close chat$/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /which events look most overextended in probability/i,
      }),
    ).toBeInTheDocument();
  });
});
