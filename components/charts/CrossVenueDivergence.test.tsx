import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import useSWR from "swr";
import { CrossVenueDivergence } from "./CrossVenueDivergence";
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

describe("CrossVenueDivergence", () => {
  beforeEach(() => resetDashboardState());

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
});
