jest.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter" }),
  DM_Sans: () => ({ variable: "--font-dm-sans" }),
  JetBrains_Mono: () => ({ variable: "--font-jetbrains" }),
}));

import { readFileSync } from "fs";
import { join } from "path";
import { metadata, viewport } from "./layout";

describe("RootLayout module", () => {
  test("bootstrap script in layout source reads saved theme before paint", () => {
    const src = readFileSync(join(__dirname, "layout.tsx"), "utf8");
    expect(src).toMatch(/localStorage.getItem\('tmb-theme'\)/);
    expect(src).toMatch(/data-theme/);
  });

  test("exports dashboard title and viewport theme colours", () => {
    expect(metadata.title).toContain("TrustMeBro");
    expect(viewport.themeColor).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ media: expect.stringContaining("dark") }),
      ]),
    );
  });
});
