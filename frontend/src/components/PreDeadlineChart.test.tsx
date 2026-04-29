// utilized cursor to generate tests

import { render, screen } from "@testing-library/react";
import { PreDeadlineChart } from "./PreDeadlineChart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ data }: { data: Array<{ name: string; value: number }> }) => (
    <div data-testid="pie-data">{JSON.stringify(data)}</div>
  ),
  Cell: () => <span data-testid="pie-cell" />,
  Tooltip: () => <div data-testid="pie-tooltip" />,
  Legend: () => <div data-testid="pie-legend" />,
}));

describe("PreDeadlineChart", () => {
  const baseWindow = {
    windowHours: 24,
    windowStart: "2026-01-01T00:00:00Z",
    windowEnd: "2026-01-02T00:00:00Z",
    volume: 2500,
    tradeCount: 11,
    shareOfTotalVolume: 0.25,
  };

  it("renders loading skeleton when loading is true", () => {
    render(
      <PreDeadlineChart window={baseWindow} totalVolume={10000} loading />,
    );
    expect(
      screen.getByLabelText(/loading pre-deadline chart/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/loading pre-deadline chart/i),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("renders empty state when total volume is zero", () => {
    render(<PreDeadlineChart window={baseWindow} totalVolume={0} />);
    expect(
      screen.getByText(/no volume observed yet for this selection/i),
    ).toBeInTheDocument();
  });

  it("renders chart and summary with computed values", () => {
    render(<PreDeadlineChart window={baseWindow} totalVolume={10000} />);

    expect(screen.getByTestId("pie-chart")).toBeInTheDocument();
    expect(screen.getByTestId("pie-tooltip")).toBeInTheDocument();
    expect(screen.getByTestId("pie-legend")).toBeInTheDocument();
    expect(
      screen.getByText((text) => text.includes("In the final")),
    ).toHaveTextContent(/final 24 hours/i);
    expect(
      screen.getByText((text) => text.includes("In the final")),
    ).toHaveTextContent(/25\.0%/);
    expect(
      screen.getByText((text) => text.includes("In the final")),
    ).toHaveTextContent(/\(\$2,500\) occurred\./i);
    expect(screen.getByTestId("pie-data")).toHaveTextContent(
      JSON.stringify([
        { name: "Final window", value: 2500 },
        { name: "Earlier period", value: 7500 },
      ]),
    );
  });

  it("clamps earlier period at zero when late volume exceeds total", () => {
    render(
      <PreDeadlineChart
        window={{ ...baseWindow, volume: 2000, shareOfTotalVolume: 1 }}
        totalVolume={1500}
      />,
    );
    expect(screen.getByTestId("pie-data")).toHaveTextContent(
      JSON.stringify([
        { name: "Final window", value: 2000 },
        { name: "Earlier period", value: 0 },
      ]),
    );
  });
});
