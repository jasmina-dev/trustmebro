// utilized cursor to generate tests

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LandingPage } from "./LandingPage";

describe("LandingPage", () => {
  it("renders brand, hero text, highlights, and disclaimer", () => {
    render(<LandingPage onEnterDashboard={vi.fn()} />);

    expect(screen.getByText(/trustmebro analytics/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /don't trust the vibe\./i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/highlights/i)).toBeInTheDocument();
    expect(screen.getByText(/real-time analytics/i)).toBeInTheDocument();
    expect(screen.getByText(/category filters/i)).toBeInTheDocument();
    expect(screen.getByText(/ask ai/i)).toBeInTheDocument();
    expect(
      screen.getByText(/research purposes only and not financial advice/i),
    ).toBeInTheDocument();
  });

  it("calls onEnterDashboard when the CTA button is clicked", async () => {
    const user = userEvent.setup();
    const onEnterDashboard = vi.fn();
    render(<LandingPage onEnterDashboard={onEnterDashboard} />);

    await user.click(screen.getByRole("button", { name: /open dashboard/i }));
    expect(onEnterDashboard).toHaveBeenCalledTimes(1);
  });
});
