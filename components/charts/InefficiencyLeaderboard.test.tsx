import { act, render, screen } from "@testing-library/react";
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
});
