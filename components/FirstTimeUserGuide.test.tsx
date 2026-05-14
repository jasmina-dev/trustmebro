import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { FirstTimeUserGuide } from "./FirstTimeUserGuide";

jest.mock("next/link", () => ({
  __esModule: true,
  default({ children, href, ...rest }: { children: ReactNode; href: string }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

describe("FirstTimeUserGuide", () => {
  test("renders onboarding copy and landing link", () => {
    render(<FirstTimeUserGuide />);
    expect(
      screen.getByRole("heading", { name: /first-time user guide/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Welcome!/)).toBeInTheDocument();
    const home = screen.getByRole("link", { name: "/" });
    expect(home).toHaveAttribute("href", "/");
  });
});
