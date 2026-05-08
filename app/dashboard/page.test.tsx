import { render, screen } from "@testing-library/react";
import Page from "./page";

/**
 * Component tests for the dashboard page (`app/dashboard/page.tsx`).
 *
 * @remarks
 * The dashboard composes many heavy chart modules loaded via `next/dynamic`.
 * This suite mocks those pieces to keep the test fast and focused on page-level
 * composition (nav/sidebar/KPIs and chart placeholders).
 */
jest.mock("next/dynamic", () => {
  return () => {
    const DynamicStub = () => <div data-testid="dynamic-module" />;
    return DynamicStub;
  };
});

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
  test("renders dashboard shell and key sections", () => {
    render(<Page />);
    expect(screen.getByText("TopNavMock")).toBeInTheDocument();
    expect(screen.getByText("SidebarMock")).toBeInTheDocument();
    expect(screen.getByText("KPIRowMock")).toBeInTheDocument();
    expect(screen.getByText(/Data via/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("dynamic-module").length).toBeGreaterThan(0);
  });
});
