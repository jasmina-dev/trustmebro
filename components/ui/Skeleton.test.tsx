import { render, screen } from "@testing-library/react";
import { ChartSkeleton, Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  test("applies shimmer class and aria-hidden", () => {
    const { container } = render(
      <Skeleton className="h-4 w-20" data-testid="sk" />,
    );
    const el = screen.getByTestId("sk");
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el.className).toMatch(/shimmer/);
    expect(el.className).toMatch(/h-4/);
  });
});

describe("ChartSkeleton", () => {
  test("renders label when provided", () => {
    render(<ChartSkeleton label="Loading chart" />);
    expect(screen.getByText("Loading chart")).toBeInTheDocument();
  });

  test("renders hint instead of default footer skeletons when hint set", () => {
    render(<ChartSkeleton hint="Slow route" />);
    expect(screen.getByText("Slow route")).toBeInTheDocument();
  });
});
