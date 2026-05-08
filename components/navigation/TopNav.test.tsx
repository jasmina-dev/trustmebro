import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopNav } from "./TopNav";
import { useDashboard } from "@/lib/store";
import { resetDashboardState } from "@/test-utils/dashboardState";

describe("TopNav", () => {
  beforeEach(() => {
    resetDashboardState();
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

  test("renders the theme toggle immediately after the Ask AI button", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<TopNav />);

    const askAi = screen.getByRole("button", { name: "Ask AI" });
    const themeToggle = screen.getByRole("button", {
      name: /switch to light mode/i,
    });

    expect(themeToggle).toBeInTheDocument();
    // The toggle is the immediate next sibling of the Ask AI button.
    expect(askAi.nextElementSibling).toBe(themeToggle);
  });
});
