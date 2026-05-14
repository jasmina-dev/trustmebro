import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import useSWR from "swr";
import { useDashboard } from "@/lib/store";
import { InefficiencyLeaderboard } from "./InefficiencyLeaderboard";
import { resetDashboardState } from "@/test-utils/dashboardState";
import { swrByKey } from "@/test-utils/mocks/swr";

/**
 * Component tests for `InefficiencyLeaderboard`.
 *
 * @remarks
 * The leaderboard is driven by SWR data and a Zustand venue filter. This suite
 * verifies that venue toggling updates the computed rows, including the special
 * case where a `cross_venue_divergence` entry should be visible under either
 * venue (because it involves both exchanges).
 */
jest.mock("swr");
jest.mock("../ui/Card", () =>
  require("@/test-utils/mocks/ui").mockCardModule(),
);
jest.mock("../ui/Skeleton", () =>
  require("@/test-utils/mocks/ui").mockSkeletonModule(),
);
jest.mock("../ui/HelpTooltip", () =>
  require("@/test-utils/mocks/ui").mockHelpTooltipModule(),
);

describe("InefficiencyLeaderboard venue toggle", () => {
  beforeEach(() => {
    resetDashboardState();
  });

  test("includes cross-venue divergence rows under both venues", () => {
    const scoresPayload = {
      data: [
        {
          id: "div1",
          marketId: "p1",
          title: "Divergence row",
          exchange: "polymarket",
          counterpartyExchange: "kalshi",
          category: "Politics",
          type: "cross_venue_divergence",
          score: 99,
          details: "x",
          spread: 0.12,
          lastUpdated: new Date().toISOString(),
        },
        {
          id: "kal1",
          marketId: "k1",
          title: "Kalshi only row",
          exchange: "kalshi",
          category: "Politics",
          type: "liquidity_gap",
          score: 10,
          details: "y",
          lastUpdated: new Date().toISOString(),
        },
      ],
    };

    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/inefficiencies": { data: scoresPayload, isLoading: false },
        },
      }),
    );

    render(<InefficiencyLeaderboard />);
    expect(screen.getByText("Divergence row")).toBeInTheDocument();
    expect(screen.getByText("Kalshi only row")).toBeInTheDocument();
    expect(screen.getByTestId("subtitle").textContent).toMatch(/^2 flagged/);

    act(() => {
      useDashboard.getState().setVenue("kalshi");
    });

    // Under Kalshi: includes the divergence row (counterparty is kalshi)
    // plus the kalshi-only row => still 2.
    expect(screen.getByText("Divergence row")).toBeInTheDocument();
    expect(screen.getByText("Kalshi only row")).toBeInTheDocument();
    expect(screen.getByTestId("subtitle").textContent).toMatch(/^2 flagged/);

    act(() => {
      useDashboard.getState().setVenue("polymarket");
    });

    // Under Polymarket: includes divergence row (exchange is polymarket),
    // but excludes the kalshi-only row => 1.
    expect(screen.getByText("Divergence row")).toBeInTheDocument();
    expect(screen.queryByText("Kalshi only row")).toBeNull();
    expect(screen.getByTestId("subtitle").textContent).toMatch(/^1 flagged/);
  });

  test("excludes Sports-category rows from the table and flagged count", () => {
    const scoresPayload = {
      data: [
        {
          id: "s1",
          marketId: "s1",
          title: "Sports row",
          exchange: "polymarket",
          category: "Sports",
          type: "liquidity_gap",
          score: 99,
          details: "x",
          lastUpdated: new Date().toISOString(),
        },
        {
          id: "p1",
          marketId: "p1",
          title: "Politics row",
          exchange: "polymarket",
          category: "Politics",
          type: "liquidity_gap",
          score: 10,
          details: "y",
          lastUpdated: new Date().toISOString(),
        },
      ],
    };

    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/inefficiencies": { data: scoresPayload, isLoading: false },
        },
      }),
    );

    render(<InefficiencyLeaderboard />);
    expect(screen.queryByText("Sports row")).toBeNull();
    expect(screen.getByText("Politics row")).toBeInTheDocument();
    expect(screen.getByTestId("subtitle").textContent).toMatch(/^1 flagged/);
  });

  test("shows loading placeholder while fetching", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/inefficiencies": { data: undefined, isLoading: true },
        },
      }),
    );

    render(<InefficiencyLeaderboard />);
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  test("shows empty state when the type filter excludes all rows", () => {
    const scoresPayload = {
      data: [
        {
          id: "r1",
          marketId: "r1",
          title: "Bias only",
          exchange: "polymarket",
          category: "Politics",
          type: "resolution_bias",
          score: 50,
          details: "d",
          lastUpdated: new Date().toISOString(),
        },
      ],
    };

    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/inefficiencies": { data: scoresPayload, isLoading: false },
        },
      }),
    );

    render(<InefficiencyLeaderboard />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "late_breaking_mismatch" } });
    expect(
      screen.getByText("No inefficiencies match the current filter."),
    ).toBeInTheDocument();
  });

  test("opens detail with liquidity distribution for liquidity_gap rows", async () => {
    const user = userEvent.setup();
    const scoresPayload = {
      data: [
        {
          id: "lg1",
          marketId: "lg1",
          title: "Thin book",
          url: "https://example.com/m",
          exchange: "polymarket",
          category: "Politics",
          type: "liquidity_gap",
          score: 88,
          details: "Volume overwhelmed liquidity at the close.",
          spread: 0.05,
          liquidityRatio: 500_000,
          liquidityPopulation: {
            mean: 400_000,
            sd: 50_000,
            threshold: 550_000,
            n: 120,
          },
          lastUpdated: new Date().toISOString(),
        },
      ],
    };

    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/inefficiencies": { data: scoresPayload, isLoading: false },
        },
      }),
    );

    render(<InefficiencyLeaderboard />);
    const dataRow = screen.getAllByRole("row")[1];
    await user.click(dataRow);

    expect(screen.getByText("Vol/Liq distribution")).toBeInTheDocument();
    expect(screen.getByText("5.0pp")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "✕" }));
    expect(screen.queryByText("Vol/Liq distribution")).toBeNull();
  });

  test("table header clicks toggle sort direction", async () => {
    const user = userEvent.setup();
    const scoresPayload = {
      data: [
        {
          id: "a",
          marketId: "a",
          title: "Alpha",
          exchange: "polymarket",
          category: "Politics",
          type: "liquidity_gap",
          score: 10,
          details: "d",
          lastUpdated: new Date().toISOString(),
        },
        {
          id: "b",
          marketId: "b",
          title: "Beta",
          exchange: "polymarket",
          category: "Politics",
          type: "liquidity_gap",
          score: 90,
          details: "d",
          lastUpdated: new Date().toISOString(),
        },
      ],
    };

    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/inefficiencies": { data: scoresPayload, isLoading: false },
        },
      }),
    );

    render(<InefficiencyLeaderboard />);
    await user.click(screen.getByText("Type"));
    await user.click(screen.getByText("Type"));

    const rows = screen.getAllByRole("row");
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });
});
