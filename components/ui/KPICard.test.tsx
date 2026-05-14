import { act, render, screen } from "@testing-library/react";
import { KPICard } from "./KPICard";

describe("KPICard", () => {
  beforeEach(() => {
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      queueMicrotask(() => cb(performance.now() + 700));
      return 1;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("shows em dash while loading", () => {
    render(<KPICard label="Volume" value={1234} loading />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("%")).not.toBeInTheDocument();
  });

  test("renders string format without numeric animation path", () => {
    render(
      <KPICard label="Status" value="Live" format="string" suffix="beta" />,
    );
    expect(screen.getByText(/Live/)).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  test("formats percent values after count-up settles", async () => {
    render(<KPICard label="Win rate" value={0.421} format="percent" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(await screen.findByText("42.1%")).toBeInTheDocument();
  });

  test("colors positive delta and hides delta while loading", () => {
    const { rerender } = render(
      <KPICard label="Δ" value={1} delta={0.012} format="number" />,
    );
    expect(screen.getByText("+1.2%")).toHaveClass("text-success");

    rerender(<KPICard label="Δ" value={1} delta={-0.05} format="number" />);
    expect(screen.getByText("-5.0%")).toHaveClass("text-danger");

    rerender(
      <KPICard label="Δ" value={1} delta={0.01} format="number" loading />,
    );
    expect(screen.queryByText("%")).not.toBeInTheDocument();
  });

  test("shows optional hint below the value row", () => {
    render(<KPICard label="X" value={0} format="string" hint="Footnote" />);
    expect(screen.getByText("Footnote")).toBeInTheDocument();
  });

  test("renders help tooltip trigger when helpContent is set", () => {
    render(
      <KPICard
        label="Metric"
        value={1}
        helpContent="Explanation for readers."
        helpTitle="About this metric"
      />,
    );
    expect(
      screen.getByRole("button", { name: /show chart explanation/i }),
    ).toBeInTheDocument();
  });

  test("formats large USD tiers after animation completes", async () => {
    render(<KPICard label="Notional" value={3_300_000_000} format="usd" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(await screen.findByText(/\$3\.30B/)).toBeInTheDocument();
  });

  test("formats compact number tiers for plain number format", async () => {
    render(<KPICard label="Count" value={2_500_000} format="number" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(await screen.findByText(/2\.50M/)).toBeInTheDocument();
  });
});
