import { fireEvent, render, screen } from "@testing-library/react";
import useSWR from "swr";
import { ResolutionBiasHeatmap } from "./ResolutionBiasHeatmap";
import { resetDashboardState } from "@/test-utils/dashboardState";
import { swrByKey } from "@/test-utils/mocks/swr";

/**
 * Component tests for `ResolutionBiasHeatmap`.
 *
 * @remarks
 * The heatmap is driven by SWR (`/api/resolution-bias`) and rendered under the
 * shared dashboard filter context. We mock SWR and shared UI primitives to keep
 * assertions focused on user-visible states (loading/empty/data).
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

describe("ResolutionBiasHeatmap", () => {
  beforeEach(() => resetDashboardState());

  test("shows skeleton on first load", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/resolution-bias": {
            data: undefined,
            isLoading: true,
            error: null,
          },
        },
      }),
    );
    render(<ResolutionBiasHeatmap />);
    expect(screen.getByText("Resolution bias heatmap")).toBeInTheDocument();
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  test("shows error copy when swr errors and no cached data", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/resolution-bias": {
            data: undefined,
            isLoading: false,
            error: new Error("boom"),
          },
        },
      }),
    );
    render(<ResolutionBiasHeatmap />);
    expect(
      screen.getByText(/Couldn't load resolution bias yet/i),
    ).toBeInTheDocument();
  });

  test("renders flagged count in subtitle", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/resolution-bias": {
            data: {
              data: [
                {
                  category: "Politics",
                  exchange: "polymarket",
                  total: 40,
                  yesResolved: 10,
                  noResolved: 30,
                  noRate: 0.75,
                  yesRate: 0.25,
                  zScore: 1,
                  flagged: true,
                },
                {
                  category: "Politics",
                  exchange: "kalshi",
                  total: 40,
                  yesResolved: 25,
                  noResolved: 15,
                  noRate: 0.375,
                  yesRate: 0.625,
                  zScore: 1,
                  flagged: false,
                },
              ],
              meta: {},
            },
            isLoading: false,
            error: null,
          },
        },
      }),
    );

    render(<ResolutionBiasHeatmap />);
    expect(screen.getByTestId("subtitle").textContent).toContain("1 flagged");
  });

  test("renders coverage footnote and hover card for a high-NO cell", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/resolution-bias": {
            data: {
              data: [
                {
                  category: "Politics",
                  exchange: "polymarket",
                  total: 120,
                  yesResolved: 24,
                  noResolved: 96,
                  noRate: 0.8,
                  yesRate: 0.2,
                  zScore: 3.1,
                  flagged: true,
                  lowSample: false,
                  ambiguous: 2,
                },
                {
                  category: "Politics",
                  exchange: "kalshi",
                  total: 10,
                  yesResolved: 5,
                  noResolved: 5,
                  noRate: 0.5,
                  yesRate: 0.5,
                  zScore: 0,
                  flagged: false,
                  lowSample: true,
                },
                {
                  category: "Crypto",
                  exchange: "polymarket",
                  total: 0,
                  yesResolved: 0,
                  noResolved: 0,
                  noRate: 0,
                  yesRate: 0,
                  zScore: 0,
                  flagged: false,
                },
                {
                  category: "Crypto",
                  exchange: "kalshi",
                  total: 60,
                  yesResolved: 40,
                  noResolved: 20,
                  noRate: 0.33,
                  yesRate: 0.67,
                  zScore: -1.2,
                  flagged: false,
                },
                {
                  category: "Finance",
                  exchange: "polymarket",
                  total: 80,
                  yesResolved: 50,
                  noResolved: 30,
                  noRate: 0.375,
                  yesRate: 0.625,
                  zScore: 0.4,
                  flagged: false,
                },
                {
                  category: "Finance",
                  exchange: "kalshi",
                  total: 90,
                  yesResolved: 55,
                  noResolved: 35,
                  noRate: 0.39,
                  yesRate: 0.61,
                  zScore: 0.5,
                  flagged: false,
                },
              ],
              meta: {
                closedMarketsLoaded: { polymarket: 200, kalshi: 180 },
                binaryExcluded: 4,
              },
            },
            isLoading: false,
            error: null,
          },
        },
      }),
    );

    render(<ResolutionBiasHeatmap />);
    expect(screen.getByText(/closed pulled/)).toBeInTheDocument();
    expect(screen.getByText("No data")).toBeInTheDocument();

    const highNo = screen.getByText("80% NO");
    const cell = highNo.closest(".cursor-pointer");
    expect(cell).toBeTruthy();
    fireEvent.mouseEnter(cell!);
    expect(screen.getByText("Flagged")).toBeInTheDocument();
    expect(
      screen.getByText(/multi-outcome \/ unresolved markets excluded/i),
    ).toBeInTheDocument();
    fireEvent.mouseLeave(cell!);
  });
});
