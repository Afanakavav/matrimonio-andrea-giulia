/**
 * E2E tests (Playwright) — Phase 4
 * Avvia il server: npx serve . -p 3000
 * Poi: npx playwright test
 * Oppure: npm run test:e2e (avvia serve in background)
 */
const { test, expect } = require("@playwright/test");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

test.describe("Homepage", () => {
  test("carica la pagina principale", async ({ page }) => {
    const res = await page.goto(BASE_URL);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/Andrea|Giulia|Matrimonio/i);
  });

  test("mostra la sezione RSVP con form", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator("#rsvp").scrollIntoViewIfNeeded();
    const form = page.locator("#rsvpForm");
    await expect(form).toBeVisible();
    await expect(form.locator("#name")).toBeVisible();
    await expect(form.locator("#email")).toBeVisible();
    await expect(form.locator("#attendance")).toBeVisible();
  });
});

test.describe("Gallery", () => {
  test("carica la galleria", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/gallery.html`);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/Galleria|Gallery/i);
  });
});
