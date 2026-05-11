import { render, screen } from "@testing-library/react";
import DashboardLoading from "./loading";

describe("DashboardLoading", () => {
  test("exposes busy state and mirrors dashboard skeleton regions", () => {
    render(<DashboardLoading />);
    const root = screen.getByLabelText(/loading dashboard/i);
    expect(root).toHaveAttribute("aria-busy", "true");
    expect(root.querySelectorAll(".shimmer").length).toBeGreaterThan(4);
  });
});
