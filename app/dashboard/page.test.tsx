import React, { useEffect, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import Page from "./page";

jest.mock("swr", () => ({
  __esModule: true,
  default: () => ({
    data: { data: [], cache: "MISS", fetchedAt: "", source: "mock" },
    error: undefined,
    isLoading: false,
    mutate: jest.fn(),
  }),
}));

jest.mock("next/dynamic", () => {
  return function dynamic(
    loader: () => Promise<React.ComponentType<Record<string, never>>>,
  ) {
    function DynamicChart() {
      const [loaded, setLoaded] = useState<{
        Comp: React.ComponentType<Record<string, never>>;
      } | null>(null);
      useEffect(() => {
        void loader().then((Comp) => {
          // Do not call `setState(Comp)` with a bare function component — React
          // treats a function argument as an updater (`Comp(prev)`). Wrap in an object.
          setLoaded({ Comp });
        });
      }, []);
      if (!loaded) return <div data-testid="dyn-loading" />;
      const C = loaded.Comp;
      return <C />;
    }
    return DynamicChart;
  };
});

jest.mock("@/components/charts/ResolutionBiasHeatmap", () => ({
  ResolutionBiasHeatmap: () => <div data-testid="chart-rbh" />,
}));
jest.mock("@/components/charts/CrossVenueDivergence", () => ({
  CrossVenueDivergence: () => <div data-testid="chart-cvd" />,
}));
jest.mock("@/components/charts/ResolutionBiasDistribution", () => ({
  ResolutionBiasDistribution: () => <div data-testid="chart-rbd" />,
}));
jest.mock("@/components/charts/InefficiencyLeaderboard", () => ({
  InefficiencyLeaderboard: () => <div data-testid="chart-ilb" />,
}));
jest.mock("@/components/charts/LiquidityGapScatter", () => ({
  LiquidityGapScatter: () => <div data-testid="chart-lgs" />,
}));
jest.mock("@/components/charts/PriceVsResolution", () => ({
  PriceVsResolution: () => <div data-testid="chart-pvr" />,
}));
jest.mock("@/components/charts/MarketMomentum", () => ({
  MarketMomentum: () => <div data-testid="chart-mm" />,
}));
jest.mock("@/components/charts/CalibrationCurve", () => ({
  CalibrationCurve: () => <div data-testid="chart-cc" />,
}));
jest.mock("@/components/charts/EfficiencyTimeline", () => ({
  EfficiencyTimeline: () => <div data-testid="chart-et" />,
}));
jest.mock("@/components/chat/ChatPanel", () => ({
  ChatPanel: () => <div data-testid="chat-panel" />,
}));

jest.mock("@/components/navigation/TopNav", () => ({
  TopNav: () => <div>TopNavMock</div>,
}));

jest.mock("@/components/navigation/Sidebar", () => ({
  Sidebar: () => <div>SidebarMock</div>,
}));

jest.mock("@/components/KPIRow", () => ({
  KPIRow: () => <div>KPIRowMock</div>,
}));

jest.mock("@/components/ui/DeferChartMount", () => ({
  DeferChartMount: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe("Dashboard page", () => {
  test("renders shell and executes dynamic chart loaders", async () => {
    render(<Page />);
    expect(screen.getByText("TopNavMock")).toBeInTheDocument();
    expect(screen.getByText("SidebarMock")).toBeInTheDocument();
    expect(screen.getByText("KPIRowMock")).toBeInTheDocument();
    expect(screen.getByText(/Data via/i)).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.getByTestId("chart-rbh")).toBeInTheDocument();
        expect(screen.getByTestId("chart-cvd")).toBeInTheDocument();
        expect(screen.getByTestId("chart-rbd")).toBeInTheDocument();
        expect(screen.getByTestId("chart-ilb")).toBeInTheDocument();
        expect(screen.getByTestId("chart-lgs")).toBeInTheDocument();
        expect(screen.getByTestId("chart-pvr")).toBeInTheDocument();
        expect(screen.getByTestId("chart-mm")).toBeInTheDocument();
        expect(screen.getByTestId("chart-cc")).toBeInTheDocument();
        expect(screen.getByTestId("chart-et")).toBeInTheDocument();
        expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
      },
      { timeout: 15_000 },
    );
  });
});
