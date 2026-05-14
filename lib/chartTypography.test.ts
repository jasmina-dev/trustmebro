import {
  CHART_FONT_FAMILY,
  chartAxisLabelBase,
  chartAxisTick,
  chartLegendWrapperStyle,
  chartTooltipContentStyle,
} from "./chartTypography";

describe("chartTypography", () => {
  test("CHART_FONT_FAMILY references Inter CSS variable stack", () => {
    expect(CHART_FONT_FAMILY).toContain("--font-inter");
    expect(CHART_FONT_FAMILY).toContain("system-ui");
  });

  test("axis tick style carries font family and muted fill", () => {
    expect(chartAxisTick.fontFamily).toBe(CHART_FONT_FAMILY);
    expect(chartAxisTick.fill).toBe("#8b91a1");
    expect(chartAxisTick.fontSize).toBe(10);
  });

  test("axis label base matches tick palette with slightly larger font", () => {
    expect(chartAxisLabelBase.fontFamily).toBe(CHART_FONT_FAMILY);
    expect(chartAxisLabelBase.fontSize).toBe(11);
  });

  test("tooltip style uses dark panel and chart font", () => {
    expect(chartTooltipContentStyle.fontFamily).toBe(CHART_FONT_FAMILY);
    expect(chartTooltipContentStyle.background).toBe("#111318");
    expect(String(chartTooltipContentStyle.border)).toContain("1px");
  });

  test("legend wrapper sets compact font size", () => {
    expect(chartLegendWrapperStyle.fontSize).toBe(11);
    expect(chartLegendWrapperStyle.fontFamily).toBe(CHART_FONT_FAMILY);
  });
});
