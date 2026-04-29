// utilized cursor to generate tests

import { render, screen } from "@testing-library/react";
import { WhaleTradersChart } from "./WhaleTradersChart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({
    data,
    children,
  }: {
    data: Array<{ label: string; volume: number; share: number }>;
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
  Tooltip: () => <div data-testid="tooltip" />,
  Cell: () => <span data-testid="bar-cell" />,
}));

describe("WhaleTradersChart", () => {
  it("renders empty state when no whale data is provided", () => {
    render(<WhaleTradersChart data={[]} />);
    expect(
      screen.getByText(/no large traders detected for this selection/i),
    ).toBeInTheDocument();
  });

  it("renders chart with transformed whale labels and values", () => {
    render(
      <WhaleTradersChart
        data={[
          {
            address: "0xabc1234567890abcdef1234567890abcdef1234",
            volume: 123456,
            tradeCount: 8,
            shareOfTotalVolume: 0.2,
          },
          {
            address: "0xdef1234567890abcdef1234567890abcdef5678",
            volume: 654321,
            tradeCount: 14,
            shareOfTotalVolume: 0.5,
          },
        ]}
      />,
    );

    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    expect(screen.getByTestId("x-axis")).toBeInTheDocument();
    expect(screen.getByTestId("y-axis")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip")).toBeInTheDocument();
    expect(screen.getByTestId("bar-chart-data")).toHaveTextContent(
      "0xabc1…1234",
    );
    expect(screen.getByTestId("bar-chart-data")).toHaveTextContent(
      '"share":20',
    );
    expect(screen.getByTestId("bar-chart-data")).toHaveTextContent(
      '"volume":654321',
    );
    expect(screen.getAllByTestId("bar-cell")).toHaveLength(2);
  });
});
