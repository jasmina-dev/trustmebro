import { act, render, screen } from "@testing-library/react";
import useSWR from "swr";
import { useDashboard } from "@/lib/store";
import { MarketMomentum } from "./MarketMomentum";

jest.mock("swr");
jest.mock("../ui/Card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({
    title,
    subtitle,
  }: {
    title: string;
    subtitle?: string;
    right?: React.ReactNode;
  }) => (
    <div>
      <div>{title}</div>
      {subtitle ? <div data-testid="subtitle">{subtitle}</div> : null}
    </div>
  ),
}));
jest.mock("../ui/Skeleton", () => ({
  ChartSkeleton: () => <div>loading</div>,
}));
jest.mock("../ui/HelpTooltip", () => ({
  HelpTooltip: () => null,
}));

describe("MarketMomentum venue toggle", () => {
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

  test("switching activeVenue changes the SWR key (exchange param)", () => {
    (useSWR as jest.Mock).mockImplementation((key: string) => {
      return { data: { data: [] }, isLoading: false };
    });

    render(<MarketMomentum />);

    // Initial call: no exchange param when activeVenue="all"
    expect((useSWR as jest.Mock).mock.calls[0][0]).toContain("/api/markets?");
    expect((useSWR as jest.Mock).mock.calls[0][0]).not.toContain("exchange=");

    act(() => {
      useDashboard.getState().setVenue("kalshi");
    });

    const keys = (useSWR as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(keys.some((k: string) => k.includes("exchange=kalshi"))).toBe(true);

    act(() => {
      useDashboard.getState().setVenue("polymarket");
    });

    const keys2 = (useSWR as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(keys2.some((k: string) => k.includes("exchange=polymarket"))).toBe(
      true,
    );
  });

  test("switching venue changes the rendered mover list", () => {
    const market = (
      id: string,
      exchange: "polymarket" | "kalshi",
      change: number,
    ) => ({
      marketId: id,
      title: id,
      exchange,
      category: "Politics",
      volume: 0,
      volume24h: 0,
      liquidity: 1,
      outcomes: [
        {
          outcomeId: `o-${id}`,
          marketId: id,
          label: "YES",
          price: 0.5,
          priceChange24h: change,
        },
      ],
    });

    (useSWR as jest.Mock).mockImplementation((key: string) => {
      if (typeof key === "string" && key.includes("exchange=kalshi")) {
        return {
          data: { data: [market("kal-only", "kalshi", 0.2)] },
          isLoading: false,
        };
      }
      if (typeof key === "string" && key.includes("exchange=polymarket")) {
        return {
          data: { data: [market("poly-only", "polymarket", -0.2)] },
          isLoading: false,
        };
      }
      return {
        data: {
          data: [
            market("poly-default", "polymarket", 0.15),
            market("kal-default", "kalshi", 0.11),
          ],
        },
        isLoading: false,
      };
    });

    render(<MarketMomentum />);
    expect(screen.getByText("Market momentum")).toBeInTheDocument();
    expect(screen.getByText("poly-default")).toBeInTheDocument();
    expect(screen.getByText("kal-default")).toBeInTheDocument();

    act(() => {
      useDashboard.getState().setVenue("kalshi");
    });
    expect(screen.getByText("kal-only")).toBeInTheDocument();
    expect(screen.queryByText("poly-only")).toBeNull();

    act(() => {
      useDashboard.getState().setVenue("polymarket");
    });
    expect(screen.getByText("poly-only")).toBeInTheDocument();
    expect(screen.queryByText("kal-only")).toBeNull();
  });
});
