import { act, render, screen } from "@testing-library/react";
import useSWR from "swr";
import { useDashboard } from "@/lib/store";
import { InefficiencyLeaderboard } from "./InefficiencyLeaderboard";

jest.mock("swr");
jest.mock("../ui/Card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({
    title,
    subtitle,
    right,
  }: {
    title: string;
    subtitle?: string;
    right?: React.ReactNode;
  }) => (
    <div>
      <div>{title}</div>
      {subtitle ? <div data-testid="subtitle">{subtitle}</div> : null}
      {right}
    </div>
  ),
}));
jest.mock("../ui/Skeleton", () => ({
  ChartSkeleton: () => <div>loading</div>,
}));
jest.mock("../ui/HelpTooltip", () => ({
  HelpTooltip: () => null,
}));

describe("InefficiencyLeaderboard venue toggle", () => {
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

    (useSWR as jest.Mock).mockImplementation((key: string) => {
      if (key === "/api/inefficiencies")
        return { data: scoresPayload, isLoading: false };
      return { data: undefined, isLoading: false };
    });

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
});
