import { render, screen } from "@testing-library/react";
import { KPIRow } from "./KPIRow";
import { useDashboard } from "@/lib/store";
import useSWR from "swr";
import { resetDashboardState } from "@/test-utils/dashboardState";
import { swrByKey } from "@/test-utils/mocks/swr";

/**
 * Component tests for `KPIRow`.
 *
 * @remarks
 * KPIs combine multiple SWR endpoints and are further filtered by the current
 * dashboard "venue" (exchange) toggle. These tests verify that derived KPIs
 * (like Avg politics NO-rate and Inefficiencies flagged) recompute when the
 * venue changes.
 */
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
  const kpiValue = (label: string) => {
    const labelEl = screen.getByText(label);
    const spans = labelEl.parentElement?.querySelectorAll("span");
    if (!spans || spans.length < 2)
      throw new Error(`Missing KPI value for ${label}`);
    return spans[1].textContent ?? "";
  };

  beforeEach(() => {
    resetDashboardState();
  });

  test("renders key KPI labels and derived values", () => {
    const marketsPayload = { data: [{ marketId: "m1" }, { marketId: "m2" }] };
    const resolutionPayload = {
      data: [
        {
          category: "Politics",
          exchange: "polymarket",
          total: 10,
          noResolved: 6,
        },
      ],
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
          counterpartyExchange: "kalshi",
          lastUpdated: new Date().toISOString(),
        },
      ],
    };

    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/inefficiencies": { data: scoresPayload, isLoading: false },
        },
        startsWith: [
          {
            prefix: "/api/markets?",
            value: { data: marketsPayload, isLoading: false },
          },
          {
            prefix: "/api/resolution-bias",
            value: { data: resolutionPayload, isLoading: false },
          },
        ],
      }),
    );

    render(<KPIRow />);
    expect(screen.getByText("Markets analyzed")).toBeInTheDocument();
    expect(screen.getByText("Avg politics NO-rate")).toBeInTheDocument();
    expect(screen.getByText("Top spread today")).toBeInTheDocument();
    expect(screen.getByText("Inefficiencies flagged")).toBeInTheDocument();
    expect(kpiValue("Markets analyzed")).toBe("2");
    expect(kpiValue("Avg politics NO-rate")).toBe("0.6");
    expect(kpiValue("Top spread today")).toBe("0.12");
  });

  test("avg politics NO-rate respects activeVenue filter", () => {
    useDashboard.setState({ activeVenue: "kalshi" });

    const marketsPayload = { data: [{ marketId: "m1" }] };
    const resolutionPayload = {
      data: [
        {
          category: "Politics",
          exchange: "polymarket",
          total: 10,
          noResolved: 9,
        }, // 0.9
        { category: "Politics", exchange: "kalshi", total: 10, noResolved: 1 }, // 0.1
      ],
    };
    const scoresPayload = { data: [] };

    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/inefficiencies": { data: scoresPayload, isLoading: false },
        },
        startsWith: [
          {
            prefix: "/api/markets?",
            value: { data: marketsPayload, isLoading: false },
          },
          {
            prefix: "/api/resolution-bias",
            value: { data: resolutionPayload, isLoading: false },
          },
        ],
      }),
    );

    render(<KPIRow />);
    // Should use only Kalshi politics bucket => 1/10 = 0.1
    expect(kpiValue("Avg politics NO-rate")).toBe("0.1");
  });

  test("inefficiencies flagged includes divergence rows under both venues", () => {
    const marketsPayload = { data: [{ marketId: "m1" }] };
    const resolutionPayload = { data: [] };
    const scoresPayload = {
      data: [
        {
          id: "div1",
          marketId: "p1",
          title: "spread",
          exchange: "polymarket",
          counterpartyExchange: "kalshi",
          category: "Politics",
          type: "cross_venue_divergence",
          score: 10,
          details: "x",
          spread: 0.12,
          lastUpdated: new Date().toISOString(),
        },
        {
          id: "kal1",
          marketId: "k1",
          title: "kalshi liq",
          exchange: "kalshi",
          category: "Politics",
          type: "liquidity_gap",
          score: 5,
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
        startsWith: [
          {
            prefix: "/api/markets?",
            value: { data: marketsPayload, isLoading: false },
          },
          {
            prefix: "/api/resolution-bias",
            value: { data: resolutionPayload, isLoading: false },
          },
        ],
      }),
    );

    useDashboard.setState({ activeVenue: "kalshi" });
    const { rerender } = render(<KPIRow />);
    // divergence + kalshi row
    expect(kpiValue("Inefficiencies flagged")).toBe("2");

    useDashboard.setState({ activeVenue: "polymarket" });
    rerender(<KPIRow />);
    // divergence row still included under polymarket toggle (matches exchange),
    // but the kalshi-only row should drop out.
    expect(kpiValue("Inefficiencies flagged")).toBe("1");
  });
});
