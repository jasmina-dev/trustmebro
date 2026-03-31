import "@testing-library/jest-dom/vitest";

Element.prototype.scrollIntoView = vi.fn();

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub;
