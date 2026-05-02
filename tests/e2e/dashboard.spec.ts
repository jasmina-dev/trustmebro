import { test, expect } from "@playwright/test";

test("dashboard shell renders and chat opens", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("TrustMeBro Analytics")).toBeVisible();
  await expect(page.getByText("Overview")).toBeVisible();

  await page.getByRole("button", { name: "Ask AI" }).click();
  await expect(page.getByText("AI Analyst")).toBeVisible();
});
