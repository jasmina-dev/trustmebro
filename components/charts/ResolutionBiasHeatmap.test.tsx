import { render, screen } from "@testing-library/react";
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
});
