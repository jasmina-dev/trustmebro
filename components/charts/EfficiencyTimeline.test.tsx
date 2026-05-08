import { render, screen } from "@testing-library/react";
import useSWR from "swr";
import { EfficiencyTimeline } from "./EfficiencyTimeline";
import { swrByKey } from "@/test-utils/mocks/swr";

/**
 * Component tests for `EfficiencyTimeline`.
 *
 * @remarks
 * Validates the component’s handling of SWR lifecycle states for
 * `/api/efficiency-timeline` (loading/empty/data). Recharts is mocked so tests
 * can assert on deterministic rendering without SVG.
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

describe("EfficiencyTimeline", () => {
  test("shows skeleton while loading with no data", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/efficiency-timeline": { data: undefined, isLoading: true },
        },
      }),
    );
    render(<EfficiencyTimeline />);
    expect(screen.getByText("Efficiency over time")).toBeInTheDocument();
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  test("renders empty state when series is empty", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/efficiency-timeline": {
            data: { data: [], meta: {} },
            isLoading: false,
          },
        },
      }),
    );
    render(<EfficiencyTimeline />);
    expect(screen.getByTestId("subtitle").textContent).toContain(
      "No resolution history available",
    );
  });

  test("renders sparse coverage banner when <3 months and coverage exists", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/efficiency-timeline": {
            data: {
              data: [
                {
                  month: "2026-01",
                  polymarket: 1,
                  kalshi: 2,
                  polymarketVolume: 10,
                  kalshiVolume: 10,
                },
              ],
              meta: {
                coverage: {
                  closedMarketsConsidered: 100,
                  missingResolutionDate: 5,
                  monthsBelowFloor: 2,
                  minMarketsPerMonth: 2,
                },
              },
            },
            isLoading: false,
          },
        },
      }),
    );
    render(<EfficiencyTimeline />);
    expect(screen.getByText(/Sparse coverage/i)).toBeInTheDocument();
  });
});
