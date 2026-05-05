import { render, screen } from "@testing-library/react";
import Page from "./page";

describe("Landing page", () => {
  test("renders CTA content and dashboard link", () => {
    render(<Page />);
    expect(screen.getByText(/Prediction markets, decoded/i)).toBeInTheDocument();
    expect(screen.getByText(/Don.t trust the vibe/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /Open dashboard/i,
      }),
    ).toHaveAttribute("href", "/dashboard");
  });
});
