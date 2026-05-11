import React from "react";

/**
 * Shared recharts mock.
 *
 * Usage:
 *   jest.mock("recharts", () => require("@/test-utils/mocks/recharts").mockRecharts());
 *
 * Optionally inspect scatter datasets via test ids:
 *   Scatter renders: <div data-testid={`scatter-${name.toLowerCase()}`}>{data.length}</div>
 */
export function mockRecharts() {
  return {
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    ScatterChart: ({ children }: any) => <div>{children}</div>,
    ComposedChart: ({ children }: any) => <div>{children}</div>,

    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    ZAxis: () => null,
    Tooltip: () => null,
    Legend: () => null,
    ReferenceLine: () => null,

    Area: () => null,
    Line: () => null,
    Bar: () => null,
    Cell: () => null,

    Scatter: ({ name, data }: any) => (
      <div data-testid={`scatter-${String(name).toLowerCase()}`}>
        {Array.isArray(data) ? data.length : 0}
      </div>
    ),
  };
}
