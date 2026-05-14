import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Component tests for `ThemeToggle`.
 *
 * @remarks
 * The toggle persists the chosen theme in `localStorage` and mirrors it onto
 * `document.documentElement.dataset.theme`. Tests validate both the icon/ARIA
 * state and persistence behavior.
 */
const STORAGE_KEY = "tmb-theme";

function setInitialTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", theme);
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test("shows the sun icon when current theme is dark", () => {
    setInitialTheme("dark");
    render(<ThemeToggle />);

    const button = screen.getByRole("button", {
      name: /switch to light mode/i,
    });
    expect(button).toBeInTheDocument();
    expect(button.querySelector("circle")).not.toBeNull(); // sun has a circle
  });

  test("shows the moon icon when current theme is light", () => {
    setInitialTheme("light");
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: /switch to dark mode/i });
    expect(button).toBeInTheDocument();
    expect(button.querySelector("circle")).toBeNull(); // moon has no circle
  });

  test("clicking flips data-theme on <html> and persists to localStorage", async () => {
    setInitialTheme("dark");
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(
      screen.getByRole("button", { name: /switch to light mode/i }),
    );

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    // After flipping, the icon (and label) update to offer the opposite action.
    expect(
      screen.getByRole("button", { name: /switch to dark mode/i }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /switch to dark mode/i }),
    );

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  test("falls back to dark when no data-theme attribute is set", () => {
    // Note: beforeEach already removed the attribute.
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: /switch to light mode/i }),
    ).toBeInTheDocument();
  });
});
