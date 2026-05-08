import { act, render, screen } from "@testing-library/react";
import useSWR from "swr";
import { useDashboard } from "@/lib/store";
import { LiquidityGapScatter } from "./LiquidityGapScatter";

jest.mock("swr");
jest.mock("../ui/Card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({
    title,
  }: {
    title: string;
    subtitle?: string;
    right?: React.ReactNode;
  }) => <div>{title}</div>,
}));
jest.mock("../ui/Skeleton", () => ({
  ChartSkeleton: () => <div>loading</div>,
}));
jest.mock("../ui/HelpTooltip", () => ({
  HelpTooltip: () => null,
}));

// Mock recharts so we can assert dataset sizes without rendering SVG/canvas.
jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  ScatterChart: ({ children }: any) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  ZAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  Scatter: ({ name, data }: any) => (
    <div data-testid={`scatter-${String(name).toLowerCase()}`}>
      {Array.isArray(data) ? data.length : 0}
    </div>
  ),
}));

describe("LiquidityGapScatter venue toggle", () => {
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
      if (key === "/api/inefficiencies")
        return { data: { data: [] }, isLoading: false };
      return { data: { data: [] }, isLoading: false };
    });

    render(<LiquidityGapScatter />);

    const keys = (useSWR as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(
      keys.some(
        (k: string) => typeof k === "string" && k.includes("/api/markets?"),
      ),
    ).toBe(true);
    expect(
      keys.some(
        (k: string) => typeof k === "string" && k.includes("exchange="),
      ),
    ).toBe(false);

    act(() => {
      useDashboard.getState().setVenue("kalshi");
    });
    const keys2 = (useSWR as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(
      keys2.some(
        (k: string) => typeof k === "string" && k.includes("exchange=kalshi"),
      ),
    ).toBe(true);
  });

  test("scatter point counts update based on venue-filtered markets", () => {
    const mk = (id: string, exchange: "polymarket" | "kalshi") => ({
      marketId: id,
      title: id,
      exchange,
      category: "Politics",
      volume: 0,
      volume24h: 100,
      liquidity: 50,
      outcomes: [],
    });

    const polyAndKal = { data: [mk("p1", "polymarket"), mk("k1", "kalshi")] };
    const onlyKal = { data: [mk("k2", "kalshi")] };
    const onlyPoly = { data: [mk("p2", "polymarket"), mk("p3", "polymarket")] };

    (useSWR as jest.Mock).mockImplementation((key: string) => {
      if (key === "/api/inefficiencies")
        return { data: { data: [] }, isLoading: false };
      if (typeof key === "string" && key.includes("exchange=kalshi")) {
        return { data: onlyKal, isLoading: false };
      }
      if (typeof key === "string" && key.includes("exchange=polymarket")) {
        return { data: onlyPoly, isLoading: false };
      }
      return { data: polyAndKal, isLoading: false };
    });

    render(<LiquidityGapScatter />);
    expect(screen.getByText("Liquidity gap scatter")).toBeInTheDocument();
    expect(screen.getByTestId("scatter-polymarket").textContent).toBe("1");
    expect(screen.getByTestId("scatter-kalshi").textContent).toBe("1");

    act(() => {
      useDashboard.getState().setVenue("kalshi");
    });
    expect(screen.getByTestId("scatter-polymarket").textContent).toBe("0");
    expect(screen.getByTestId("scatter-kalshi").textContent).toBe("1");

    act(() => {
      useDashboard.getState().setVenue("polymarket");
    });
    expect(screen.getByTestId("scatter-polymarket").textContent).toBe("2");
    expect(screen.getByTestId("scatter-kalshi").textContent).toBe("0");
  });
});
