import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import useSWR from "swr";
import { CrossVenueDivergence } from "./CrossVenueDivergence";
import { resetDashboardState } from "@/test-utils/dashboardState";
import { swrByKey } from "@/test-utils/mocks/swr";

/**
 * Component tests for `CrossVenueDivergence`.
 *
 * @remarks
 * This chart is SWR-driven and rendered in a "dashboard filter" context, so we
 * mock both the fetch layer (SWR) and shared UI primitives. Tests focus on
 * basic rendering and interactions without depending on SVG output.
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

jest.mock("recharts", () =>
  require("@/test-utils/mocks/recharts").mockRecharts(),
);

describe("CrossVenueDivergence", () => {
  beforeEach(() => resetDashboardState());

  test("shows skeleton while loading with no cached payload", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        startsWith: [
          {
            prefix: "/api/divergence?",
            value: { data: undefined, isLoading: true },
          },
        ],
      }),
    );

    render(<CrossVenueDivergence />);
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  test("category select updates SWR key", async () => {
    const user = userEvent.setup();
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        startsWith: [
          {
            prefix: "/api/divergence?",
            value: {
              data: { data: [], meta: { threshold: 0.02 } },
              isLoading: false,
            },
          },
        ],
      }),
    );

    render(<CrossVenueDivergence />);
    expect(screen.getByText("Cross-venue divergence")).toBeInTheDocument();

    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "Crypto");

    const keys = (useSWR as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(
      keys.some((k: string) => k.includes("/api/divergence?category=Crypto")),
    ).toBe(true);
  });

  test("renders empty state when no pairs exceed threshold", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        startsWith: [
          {
            prefix: "/api/divergence?",
            value: {
              data: { data: [], meta: { threshold: 0.03 } },
              isLoading: false,
            },
          },
        ],
      }),
    );

    render(<CrossVenueDivergence />);
    expect(screen.getByTestId("subtitle").textContent).toContain(
      "No pairs above 3pp",
    );
  });

  test("renders scatter and ranked list when pairs exist", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        startsWith: [
          {
            prefix: "/api/divergence?",
            value: {
              data: {
                data: [
                  {
                    pairId: "p1",
                    polyMarketId: "pm1",
                    kalshiMarketId: "k1",
                    polyTitle: "Poly title",
                    kalshiTitle: "Kalshi title",
                    polyYes: 0.6,
                    kalshiYes: 0.5,
                    spread: 0.1,
                    spreadPP: 10,
                    similarityScore: 0.9,
                    category: "Politics",
                    arbitrageDirection: "buy_kalshi",
                    polyVolume24h: 100,
                    kalshiVolume24h: 100,
                  },
                ],
                meta: { threshold: 0.02, totalPairs: 1 },
              },
              isLoading: false,
            },
          },
        ],
      }),
    );

    render(<CrossVenueDivergence />);
    expect(screen.getByTestId("subtitle").textContent).toContain(
      "1 matched pairs",
    );
    // Ranked list shows the poly title (topPairs)
    expect(screen.getByText("Poly title")).toBeInTheDocument();
  });

  test("renders buy-poly signal and multiple spread color tiers", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        startsWith: [
          {
            prefix: "/api/divergence?",
            value: {
              data: {
                data: [
                  {
                    pairId: "p-low",
                    polyMarketId: "pm-low",
                    kalshiMarketId: "k-low",
                    polyTitle: "Low spread pair",
                    kalshiTitle: "K low",
                    polyYes: 0.51,
                    kalshiYes: 0.52,
                    spread: 0.01,
                    spreadPP: 1,
                    similarityScore: 0.95,
                    category: "Politics",
                    arbitrageDirection: "buy_poly",
                    polyVolume24h: 50,
                    kalshiVolume24h: 50,
                  },
                  {
                    pairId: "p-mid",
                    polyMarketId: "pm-mid",
                    kalshiMarketId: "k-mid",
                    polyTitle:
                      "Mid spread pair with a very long polymarket title that should truncate cleanly in the ranked list row",
                    kalshiTitle: "K mid",
                    polyYes: 0.55,
                    kalshiYes: 0.5,
                    spread: 0.035,
                    spreadPP: 3.5,
                    similarityScore: 0.9,
                    category: "Politics",
                    arbitrageDirection: "buy_kalshi",
                    polyVolume24h: 80,
                    kalshiVolume24h: 80,
                  },
                  {
                    pairId: "p-high",
                    polyMarketId: "pm-high",
                    kalshiMarketId: "k-high",
                    polyTitle: "High spread",
                    kalshiTitle: "K high",
                    polyYes: 0.7,
                    kalshiYes: 0.55,
                    spread: 0.15,
                    spreadPP: 15,
                    similarityScore: 0.85,
                    category: "Politics",
                    arbitrageDirection: "buy_kalshi",
                    polyVolume24h: 120,
                    kalshiVolume24h: 120,
                  },
                ],
                meta: { threshold: 0.02, totalPairs: 3 },
              },
              isLoading: false,
            },
          },
        ],
      }),
    );

    render(<CrossVenueDivergence />);
    expect(screen.getByText("buy poly")).toBeInTheDocument();
    expect(screen.getAllByText("buy kalshi").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("1.0pp")).toBeInTheDocument();
    expect(screen.getByText("3.5pp")).toBeInTheDocument();
    expect(screen.getByText("15.0pp")).toBeInTheDocument();
    expect(screen.getByText(/above diagonal/)).toBeInTheDocument();
  });
});
