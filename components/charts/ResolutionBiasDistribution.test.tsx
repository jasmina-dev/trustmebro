import { render, screen } from "@testing-library/react";
import useSWR from "swr";
import { ResolutionBiasDistribution } from "./ResolutionBiasDistribution";
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

jest.mock("recharts", () =>
  require("@/test-utils/mocks/recharts").mockRecharts(),
);

describe("ResolutionBiasDistribution", () => {
  beforeEach(() => {
    (useDashboard as unknown as jest.Mock).mockReturnValue({
      activeCategory: "All",
    });
  });

  test("shows skeleton while initial resolution-bias payload is loading", () => {
    (useSWR as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<ResolutionBiasDistribution />);
    expect(
      screen.getByText("Resolution-rate distribution"),
    ).toBeInTheDocument();
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  test("requests uncategorized endpoint when category is All", () => {
    (useSWR as jest.Mock).mockReturnValue({
      data: {
        data: [
          {
            category: "Politics",
            exchange: "polymarket",
            total: 40,
            yesResolved: 20,
            noResolved: 20,
            noRate: 0.5,
            yesRate: 0.5,
            zScore: 0,
          },
        ],
      },
      isLoading: false,
    });

    render(<ResolutionBiasDistribution />);

    const keys = (useSWR as jest.Mock).mock.calls.map((c) => c[0]);
    expect(keys.some((k) => k === "/api/resolution-bias")).toBe(true);
    expect(screen.getByText(/Normal\(μ=/)).toBeInTheDocument();
  });

  test("appends category query when a specific taxonomy is active", () => {
    (useDashboard as unknown as jest.Mock).mockReturnValue({
      activeCategory: "Crypto",
    });
    (useSWR as jest.Mock).mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });

    render(<ResolutionBiasDistribution />);

    const keys = (useSWR as jest.Mock).mock.calls.map((c) => c[0]);
    expect(
      keys.some(
        (k) =>
          typeof k === "string" &&
          k.startsWith("/api/resolution-bias?category="),
      ),
    ).toBe(true);
  });
});
