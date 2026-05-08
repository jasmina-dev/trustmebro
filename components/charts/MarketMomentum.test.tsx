import { act, render, screen } from "@testing-library/react";
import useSWR from "swr";
import { useDashboard } from "@/lib/store";
import { MarketMomentum } from "./MarketMomentum";
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

describe("MarketMomentum venue toggle", () => {
  beforeEach(() => {
    resetDashboardState();
  });

  test("switching activeVenue changes the SWR key (exchange param)", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        fallback: { data: { data: [] }, isLoading: false },
      }),
    );

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

    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        startsWith: [
          {
            prefix: "/api/markets?exchange=kalshi",
            value: {
              data: { data: [market("kal-only", "kalshi", 0.2)] },
              isLoading: false,
            },
          },
          {
            prefix: "/api/markets?exchange=polymarket",
            value: {
              data: { data: [market("poly-only", "polymarket", -0.2)] },
              isLoading: false,
            },
          },
        ],
        fallback: {
          data: {
            data: [
              market("poly-default", "polymarket", 0.15),
              market("kal-default", "kalshi", 0.11),
            ],
          },
          isLoading: false,
        },
      }),
    );

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
