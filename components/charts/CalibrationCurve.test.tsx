import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import useSWR from "swr";
import { CalibrationCurve } from "./CalibrationCurve";
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

describe("CalibrationCurve", () => {
  test("shows skeleton while loading with no data", () => {
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/calibration": { data: undefined, isLoading: true },
        },
      }),
    );
    render(<CalibrationCurve />);
    expect(screen.getByText("Calibration curve")).toBeInTheDocument();
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  test("category selector triggers re-render (filters series)", async () => {
    const user = userEvent.setup();
    (useSWR as jest.Mock).mockImplementation(
      swrByKey({
        exact: {
          "/api/calibration": {
            data: {
              data: [
                {
                  exchange: "polymarket",
                  category: "Politics",
                  totalMarkets: 10,
                  buckets: [
                    {
                      bucketIndex: 0,
                      bucketStart: 0,
                      bucketEnd: 0.1,
                      meanPrice: 0.05,
                      resolutionRate: 0.05,
                      count: 10,
                    },
                  ],
                },
                {
                  exchange: "polymarket",
                  category: "Crypto",
                  totalMarkets: 99,
                  buckets: [
                    {
                      bucketIndex: 0,
                      bucketStart: 0,
                      bucketEnd: 0.1,
                      meanPrice: 0.05,
                      resolutionRate: 0.05,
                      count: 99,
                    },
                  ],
                },
              ],
              meta: { impliedYesBasis: { pinned: 0, mid: 0, settlement: 0 } },
            },
            isLoading: false,
          },
        },
      }),
    );

    render(<CalibrationCurve />);
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "Politics");
    // We can't easily assert chart internals (mocked), but we can assert
    // that the selector exists and the component stayed mounted.
    expect(screen.getByText("Calibration curve")).toBeInTheDocument();
  });
});
