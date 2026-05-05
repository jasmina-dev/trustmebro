import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopNav } from "./TopNav";
import { useDashboard } from "@/lib/store";

describe("TopNav", () => {
  beforeEach(() => {
    useDashboard.setState({
      activeVenue: "all",
      activeCategory: "All",
      activeChart: "overview",
      dateRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-31T00:00:00.000Z",
      },
      chatOpen: false,
      chatMessages: [],
      chatStreaming: false,
      visibleMarkets: [],
      inefficiencyScores: [],
      resolutionStats: [],
    });
  });

  test("toggles chat open state from Ask AI button", async () => {
    const user = userEvent.setup();
    render(<TopNav />);

    await user.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(useDashboard.getState().chatOpen).toBe(true);

    await user.click(screen.getByRole("button", { name: "Close chat" }));
    expect(useDashboard.getState().chatOpen).toBe(false);
  });

  test("updates venue and category filters", async () => {
    const user = userEvent.setup();
    render(<TopNav />);

    await user.click(screen.getByRole("button", { name: "Kalshi" }));
    expect(useDashboard.getState().activeVenue).toBe("kalshi");

    await user.selectOptions(screen.getByRole("combobox"), "Crypto");
    expect(useDashboard.getState().activeCategory).toBe("Crypto");
  });
});
