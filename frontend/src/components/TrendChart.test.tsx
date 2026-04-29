// utilized cursor to generate tests

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrendChart } from "./TrendChart";

vi.mock("./dashboardTermHelp", () => ({
  NotionalVolumeTermHelp: () => <span data-testid="notional-help" />,
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({
    data,
    children,
  }: {
    data: Array<{ eventId: string; volume: number }>;
    children: React.ReactNode;
  }) => (
    <div data-testid="bar-chart">
      <div data-testid="bar-chart-data">{JSON.stringify(data)}</div>
      {children}
    </div>
  ),
  Bar: ({
    children,
    onClick,
    dataKey,
  }: {
    children: React.ReactNode;
    onClick?: (state?: { payload?: { eventId?: string } }) => void;
    dataKey: string;
  }) => (
    <div data-testid="bar-series">
      <button
        type="button"
        onClick={() => onClick?.({ payload: { eventId: "evt-1" } })}
      >
        bar-click
      </button>
      <span>{dataKey}</span>
      {children}
    </div>
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: ({ content }: { content?: React.ReactNode }) => (
    <div data-testid="tooltip">{content}</div>
  ),
  Legend: ({ content }: { content?: () => React.ReactNode }) => (
    <div data-testid="legend">{content ? content() : null}</div>
  ),
  Rectangle: () => <span data-testid="rect" />,
  Cell: () => <span data-testid="bar-cell" />,
}));

describe("TrendChart", () => {
  const rows = [
    {
      eventId: "evt-1",
      name: "Election",
      fullName: "Election 2028",
      volume: 100000,
      suspicion: "high" as const,
    },
    {
      eventId: "evt-2",
      name: "BTC",
      fullName: "BTC above 100k",
      volume: 20000,
      suspicion: "low" as const,
    },
  ];

  it("renders loading skeleton when loading is true", () => {
    render(<TrendChart data={rows} loading height={310} />);
    const loading = screen.getByLabelText(/loading trending markets/i);
    expect(loading).toBeInTheDocument();
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveStyle({ minHeight: "310px" });
  });

  it("renders empty state when no data is provided", () => {
    render(<TrendChart data={[]} />);
    expect(
      screen.getByText(/no volume data to display\. try another category/i),
    ).toBeInTheDocument();
  });

  it("renders chart, legend content, and hint when click handler is provided", () => {
    render(<TrendChart data={rows} onBarClick={vi.fn()} />);

    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    expect(screen.getByTestId("x-axis")).toBeInTheDocument();
    expect(screen.getByTestId("y-axis")).toBeInTheDocument();
    expect(screen.getByTestId("legend")).toHaveTextContent(
      "Notional volume (USD)",
    );
    expect(screen.getByTestId("notional-help")).toBeInTheDocument();
    expect(
      screen.getByText(/click a bar to focus cash flow/i),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("bar-cell")).toHaveLength(2);
  });

  it("invokes onBarClick with selected event id", async () => {
    const user = userEvent.setup();
    const onBarClick = vi.fn();
    render(<TrendChart data={rows} onBarClick={onBarClick} />);

    await user.click(screen.getByRole("button", { name: /bar-click/i }));
    expect(onBarClick).toHaveBeenCalledWith("evt-1");
  });

  it("omits click hint when onBarClick is not provided", () => {
    render(<TrendChart data={rows} />);
    expect(
      screen.queryByText(/click a bar to focus cash flow/i),
    ).not.toBeInTheDocument();
  });
});
