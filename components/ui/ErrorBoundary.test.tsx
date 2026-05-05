import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Crash() {
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
