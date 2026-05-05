import { render, screen } from "@testing-library/react";
import { KPIRow } from "./KPIRow";
import { useDashboard } from "@/lib/store";
import useSWR from "swr";

jest.mock("swr");
jest.mock("./ui/KPICard", () => ({
  KPICard: ({ label, value }: { label: string; value: number | string }) => (
    <div>
      <span>{label}</span>
      <span>{String(value)}</span>
    </div>
  ),
}));

describe("KPIRow", () => {
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

  test("renders key KPI labels and derived values", () => {
    const marketsPayload = { data: [{ marketId: "m1" }, { marketId: "m2" }] };
    const resolutionPayload = {
      data: [{ category: "Politics", total: 10, noResolved: 6 }],
    };
    const scoresPayload = {
      data: [
        {
          id: "d1",
          marketId: "m1",
          title: "spread",
          exchange: "polymarket",
          category: "Politics",
          type: "cross_venue_divergence",
          score: 10,
          details: "x",
          spread: 0.12,
          lastUpdated: new Date().toISOString(),
        },
      ],
    };

    (useSWR as jest.Mock).mockImplementation((key: string) => {
      if (key.startsWith("/api/markets")) {
        return { data: marketsPayload, isLoading: false };
      }
      if (key.startsWith("/api/resolution-bias")) {
        return { data: resolutionPayload, isLoading: false };
      }
      if (key === "/api/inefficiencies") {
        return { data: scoresPayload, isLoading: false };
      }
      return { data: undefined, isLoading: false };
    });

    render(<KPIRow />);
    expect(screen.getByText("Markets analyzed")).toBeInTheDocument();
    expect(screen.getByText("Avg politics NO-rate")).toBeInTheDocument();
    expect(screen.getByText("Top spread today")).toBeInTheDocument();
    expect(screen.getByText("Inefficiencies flagged")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("0.6")).toBeInTheDocument();
    expect(screen.getByText("0.12")).toBeInTheDocument();
  });
});
