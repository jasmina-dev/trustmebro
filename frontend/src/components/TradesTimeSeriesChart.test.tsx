// utilized cursor to generate tests

import { render, screen } from "@testing-library/react";
import { TradesTimeSeriesChart } from "./TradesTimeSeriesChart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({
    data,
    margin,
    children,
  }: {
    data: Array<{ time: string; volume: number; trades: number }>;
    margin: Record<string, number>;
    children: React.ReactNode;
  }) => (
    <div data-testid="line-chart" data-margin-bottom={margin.bottom}>
      <div data-testid="line-chart-data">{JSON.stringify(data)}</div>
      {children}
    </div>
  ),
  Line: ({ name }: { name: string }) => (
    <div data-testid="line-series">{name}</div>
  ),
  XAxis: (props: { angle?: number; minTickGap?: number }) => (
    <div
      data-testid="x-axis"
      data-angle={String(props.angle ?? 0)}
      data-min-tick-gap={String(props.minTickGap ?? "")}
    />
  ),
  YAxis: ({ yAxisId }: { yAxisId: string }) => (
    <div data-testid={`y-axis-${yAxisId}`} />
  ),
  Tooltip: () => <div data-testid="line-tooltip" />,
  Legend: () => <div data-testid="line-legend" />,
  CartesianGrid: () => <div data-testid="line-grid" />,
}));

describe("TradesTimeSeriesChart", () => {
  it("renders loading skeleton with custom height", () => {
    render(<TradesTimeSeriesChart data={[]} loading height={320} />);
    const loading = screen.getByLabelText(/loading chart/i);
    expect(loading).toBeInTheDocument();
    expect(loading).toHaveStyle({ minHeight: "320px" });
  });

  it("renders empty state when no buckets are provided", () => {
    render(<TradesTimeSeriesChart data={[]} />);
    expect(
      screen.getByText(/no trade history available for this selection/i),
    ).toBeInTheDocument();
  });

  it("renders chart with transformed bucket data and both series", () => {
    render(
      <TradesTimeSeriesChart
        data={[
          {
            bucketStart: "2026-01-01T00:00:00Z",
            bucketEnd: "2026-01-01T01:00:00Z",
            volume: 4200,
            tradeCount: 7,
          },
        ]}
      />,
    );

    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
    expect(screen.getByTestId("line-tooltip")).toBeInTheDocument();
    expect(screen.getByTestId("line-legend")).toBeInTheDocument();
    expect(screen.getByTestId("line-chart-data")).toHaveTextContent(
      '"volume":4200',
    );
    expect(screen.getByTestId("line-chart-data")).toHaveTextContent(
      '"trades":7',
    );
    expect(screen.getAllByTestId("line-series")).toHaveLength(2);
    expect(screen.getByText("Volume (USD)")).toBeInTheDocument();
    expect(screen.getByText("Trades (count)")).toBeInTheDocument();
  });

  it("switches to dense x-axis settings for long datasets", () => {
    const denseData = Array.from({ length: 37 }).map((_, i) => ({
      bucketStart: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
      bucketEnd: new Date(Date.UTC(2026, 0, 1, i + 1)).toISOString(),
      volume: i + 1,
      tradeCount: i + 2,
    }));

    render(<TradesTimeSeriesChart data={denseData} />);

    expect(screen.getByTestId("x-axis")).toHaveAttribute("data-angle", "-32");
    expect(screen.getByTestId("x-axis")).toHaveAttribute(
      "data-min-tick-gap",
      "28",
    );
    expect(screen.getByTestId("line-chart")).toHaveAttribute(
      "data-margin-bottom",
      "48",
    );
  });
});
