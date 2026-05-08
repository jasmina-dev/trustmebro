import { render, screen } from "@testing-library/react";
import Page from "./page";

/**
 * Component tests for the landing page (`app/page.tsx`).
 *
 * @remarks
 * This is a smoke test validating the primary CTA and navigation entrypoint to
 * the dashboard, without asserting on styling.
 */
describe("Landing page", () => {
  test("renders CTA content and dashboard link", () => {
    render(<Page />);
    expect(
      screen.getByText(/Prediction markets, decoded/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Don.t trust the vibe/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /Open dashboard/i,
      }),
    ).toHaveAttribute("href", "/dashboard");
  });
});
