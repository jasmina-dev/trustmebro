import { act, render, screen } from "@testing-library/react";
import useSWR from "swr";
import { useDashboard } from "@/lib/store";
import { LiquidityGapScatter } from "./LiquidityGapScatter";
import { resetDashboardState } from "@/test-utils/dashboardState";
import { swrByKey } from "@/test-utils/mocks/swr";

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

jest.mock("recharts", () =>
  require("@/test-utils/mocks/recharts").mockRecharts(),
);

describe("LiquidityGapScatter venue toggle", () => {
  beforeEach(() => {
    resetDashboardState();
  });

  test("switching activeVenue changes the SWR key (exchange param)", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/inefficiencies": { data: { data: [] }, isLoading: false },
        },
        fallback: { data: { data: [] }, isLoading: false },
      }),
    );

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

    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/inefficiencies": { data: { data: [] }, isLoading: false },
        },
        startsWith: [
          {
            prefix: "/api/markets?exchange=kalshi",
            value: { data: onlyKal, isLoading: false },
          },
          {
            prefix: "/api/markets?exchange=polymarket",
            value: { data: onlyPoly, isLoading: false },
          },
          {
            prefix: "/api/markets?",
            value: { data: polyAndKal, isLoading: false },
          },
        ],
        fallback: { data: { data: [] }, isLoading: false },
      }),
    );

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
