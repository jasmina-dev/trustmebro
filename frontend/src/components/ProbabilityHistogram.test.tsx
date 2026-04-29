// utilized cursor to generate tests

import { render, screen } from "@testing-library/react";
import { ProbabilityHistogram } from "./ProbabilityHistogram";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({
    data,
    children,
  }: {
    data: Array<{ bucket: string; count: number }>;
    children: React.ReactNode;
  }) => (
    <div data-testid="bar-chart">
      <div data-testid="bar-chart-data">{JSON.stringify(data)}</div>
      {children}
    </div>
  ),
  Bar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-series">{children}</div>
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="bar-tooltip" />,
  Cell: () => <span data-testid="bar-cell" />,
}));

describe("ProbabilityHistogram", () => {
  it("renders empty state when data is empty", () => {
    render(<ProbabilityHistogram data={[]} />);
    expect(
      screen.getByText(/no probability data available yet for this selection/i),
    ).toBeInTheDocument();
  });

  it("renders empty state when all bucket counts are zero", () => {
    render(
      <ProbabilityHistogram
        data={[
          { bucket: "0-10%", count: 0 },
          { bucket: "10-20%", count: 0 },
        ]}
      />,
    );
    expect(
      screen.getByText(/no probability data available yet for this selection/i),
    ).toBeInTheDocument();
  });

  it("renders chart when at least one bucket has data", () => {
    render(
      <ProbabilityHistogram
        data={[
          { bucket: "0-10%", count: 2 },
          { bucket: "10-20%", count: 0 },
          { bucket: "20-30%", count: 4 },
        ]}
      />,
    );

    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    expect(screen.getByTestId("x-axis")).toBeInTheDocument();
    expect(screen.getByTestId("y-axis")).toBeInTheDocument();
    expect(screen.getByTestId("bar-tooltip")).toBeInTheDocument();
    expect(screen.getByTestId("bar-chart-data")).toHaveTextContent('"count":4');
    expect(screen.getAllByTestId("bar-cell")).toHaveLength(3);
  });
});
