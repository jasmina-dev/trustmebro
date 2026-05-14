import { act, render, screen } from "@testing-library/react";
import { DeferChartMount } from "./DeferChartMount";

describe("DeferChartMount", () => {
  let observerCallback: IntersectionObserverCallback;

  beforeEach(() => {
    observerCallback = () => {};
    class MockIntersectionObserver {
      observe = jest.fn();
      disconnect = jest.fn();
      constructor(cb: IntersectionObserverCallback) {
        observerCallback = cb;
      }
    }
    global.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("shows fallback until intersection then mounts children", () => {
    jest.useFakeTimers();
    render(
      <DeferChartMount fallback={<div>hold</div>} staggerMs={0}>
        <div>chart-body</div>
      </DeferChartMount>,
    );

    expect(screen.getByText("hold")).toBeInTheDocument();
    expect(screen.queryByText("chart-body")).not.toBeInTheDocument();

    act(() => {
      observerCallback(
        [
          {
            isIntersecting: true,
            intersectionRatio: 1,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });

    act(() => {
      jest.runAllTimers();
    });

    expect(screen.getByText("chart-body")).toBeInTheDocument();
    expect(screen.queryByText("hold")).not.toBeInTheDocument();
  });

  test("respects stagger delay after entering view", () => {
    jest.useFakeTimers();
    render(
      <DeferChartMount fallback={<span>wait</span>} staggerMs={100}>
        <span>ready</span>
      </DeferChartMount>,
    );

    act(() => {
      observerCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(screen.getByText("wait")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(99);
    });
    expect(screen.getByText("wait")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  test("mounts immediately when IntersectionObserver is unavailable", () => {
    jest.useFakeTimers();
    const Original = global.IntersectionObserver;
    // @ts-expect-error allow delete for test
    delete global.IntersectionObserver;

    render(
      <DeferChartMount fallback={<div>fb</div>}>
        <div>immediate</div>
      </DeferChartMount>,
    );

    act(() => {
      jest.runAllTimers();
    });
    expect(screen.getByText("immediate")).toBeInTheDocument();

    global.IntersectionObserver = Original;
  });
});
