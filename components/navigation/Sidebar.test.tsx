import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "./Sidebar";
import { useDashboard } from "@/lib/store";

describe("Sidebar", () => {
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

  test("collapses and expands sidebar", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(screen.getByLabelText("Collapse sidebar"));
    expect(screen.getByLabelText("Expand sidebar")).toBeInTheDocument();
  });

  test("sets active chart and scrolls to section", async () => {
    const user = userEvent.setup();
    const el = document.createElement("div");
    el.id = "leaderboard";
    el.scrollIntoView = jest.fn();
    document.body.appendChild(el);

    render(<Sidebar />);
    await user.click(
      screen.getByRole("button", { name: /Leaderboard Sortable score table/i }),
    );

    expect(useDashboard.getState().activeChart).toBe("leaderboard");
    expect(el.scrollIntoView).toHaveBeenCalled();
    document.body.removeChild(el);
  });
});
