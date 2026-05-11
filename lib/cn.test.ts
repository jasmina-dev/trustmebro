import { cn } from "./cn";

describe("cn", () => {
  test("joins truthy class strings with single spaces", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  test("filters out falsy entries", () => {
    expect(cn("a", undefined, null, false, "b")).toBe("a b");
  });

  test("returns empty string when all values are falsy", () => {
    expect(cn(undefined, null, false)).toBe("");
  });
});
