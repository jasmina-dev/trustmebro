import { render, screen } from "@testing-library/react";
import Page from "./page";

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
