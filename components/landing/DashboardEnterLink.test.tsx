import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardEnterLink } from "./DashboardEnterLink";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
}));

describe("DashboardEnterLink", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  test("uses router.push on plain click and shows pending label", async () => {
    const user = userEvent.setup();
    render(
      <DashboardEnterLink className="cta">Enter dashboard</DashboardEnterLink>,
    );

    const link = screen.getByRole("link", { name: /enter dashboard/i });
    expect(link).toHaveClass("cta");

    await user.click(link);
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  test("does not intercept modified clicks", () => {
    render(<DashboardEnterLink>Go</DashboardEnterLink>);
    const link = screen.getByRole("link", { name: "Go" });
    fireEvent.click(link, { metaKey: true });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
