import { render, screen } from "@testing-library/react";
import { ChatMarkdown } from "./ChatMarkdown";

describe("ChatMarkdown", () => {
  test("renders inline formatting from markdown", () => {
    render(<ChatMarkdown content="Hello **world**" />);
    expect(screen.getByText("world")).toBeInTheDocument();
  });

  test("opens external http links in a new tab with noopener", () => {
    render(<ChatMarkdown content="[docs](https://example.com/path)" />);
    const a = screen.getByRole("link", { name: "docs" });
    expect(a).toHaveAttribute("href", "https://example.com/path");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a.getAttribute("rel")).toMatch(/noopener/);
  });

  test("does not force target blank for relative links", () => {
    render(<ChatMarkdown content="[home](/dashboard)" />);
    const a = screen.getByRole("link", { name: "home" });
    expect(a).toHaveAttribute("href", "/dashboard");
    expect(a).not.toHaveAttribute("target");
  });
});
