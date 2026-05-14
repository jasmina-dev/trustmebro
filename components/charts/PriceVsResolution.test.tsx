import { act, render, screen } from "@testing-library/react";
import useSWR from "swr";
import { createChart } from "lightweight-charts";
import { PriceVsResolution } from "./PriceVsResolution";
import { useDashboard } from "@/lib/store";

jest.mock("swr");
jest.mock("@/lib/store", () => ({
  useDashboard: jest.fn(),
}));

jest.mock("../ui/Card", () =>
  require("@/test-utils/mocks/ui").mockCardModule(),
);
jest.mock("../ui/Skeleton", () =>
  require("@/test-utils/mocks/ui").mockSkeletonModule(),
);
jest.mock("../ui/HelpTooltip", () =>
  require("@/test-utils/mocks/ui").mockHelpTooltipModule(),
);

jest.mock(
  "lightweight-charts",
  () => {
    const createChart = jest.fn(() => ({
      remove: jest.fn(),
      addSeries: jest.fn(() => ({
        setData: jest.fn(),
        applyOptions: jest.fn(),
        createPriceLine: jest.fn(() => ({})),
        removePriceLine: jest.fn(),
      })),
      timeScale: () => ({ fitContent: jest.fn() }),
    }));
    return {
      createChart,
      AreaSeries: {},
    };
  },
  { virtual: true },
);

describe("PriceVsResolution", () => {
  const updateChartContext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createChart).mockClear();
    (useDashboard as unknown as jest.Mock).mockImplementation(
      (sel: (s: unknown) => unknown) => sel({ updateChartContext }),
    );
  });

  test("shows empty state when no qualifying closed markets", () => {
    (useSWR as jest.Mock).mockImplementation((key: string | null) => {
      if (typeof key === "string" && key.includes("/api/markets")) {
        return { data: { data: [] }, isLoading: false };
      }
      return { data: undefined, isLoading: false };
    });

    render(<PriceVsResolution />);
    expect(
      screen.getByText(/no resolved markets with final-72h/i),
    ).toBeInTheDocument();
  });

  test("subscribes chart context when a resolved market is selected", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const market = {
      marketId: "m-resolved",
      title: "Will policy X pass?",
      category: "Politics",
      exchange: "polymarket" as const,
      resolutionDate: yesterday,
      status: "resolved",
      volume: 1,
      volume24h: 1,
      liquidity: 1,
      outcomes: [
        {
          outcomeId: "111",
          marketId: "m-resolved",
          label: "Yes",
          price: 0.99,
        },
        {
          outcomeId: "222",
          marketId: "m-resolved",
          label: "No",
          price: 0.01,
        },
      ],
    };

    (useSWR as jest.Mock).mockImplementation((key: string | null) => {
      if (typeof key === "string" && key.includes("/api/markets")) {
        return { data: { data: [market] }, isLoading: false };
      }
      if (typeof key === "string" && key.includes("/api/ohlcv")) {
        return {
          data: {
            data: [
              {
                timestamp: Date.now() - 3_600_000,
                open: 0.5,
                high: 0.6,
                low: 0.4,
                close: 0.97,
              },
            ],
          },
          isLoading: false,
        };
      }
      return { data: undefined, isLoading: false };
    });

    render(<PriceVsResolution />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(jest.mocked(createChart)).toHaveBeenCalled();
    expect(updateChartContext).toHaveBeenCalledWith(
      "price-vs-resolution",
      expect.objectContaining({
        visibleMarkets: [expect.objectContaining({ marketId: "m-resolved" })],
      }),
    );
  });
});
