import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * Component tests for `ErrorBoundary`.
 *
 * @remarks
 * Ensures render-time errors are caught and surfaced through the fallback UI,
 * and that healthy children render normally. Console noise is suppressed for
 * the intentional crash path.
 */
function Crash(): ReactNode {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  test("renders fallback UI on child render error", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallbackLabel="Chart crashed">
        <Crash />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Chart crashed")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    spy.mockRestore();
  });

  test("renders children normally when no error is thrown", () => {
    render(
      <ErrorBoundary fallbackLabel="Chart crashed">
        <div>Healthy chart</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Healthy chart")).toBeInTheDocument();
  });
});
