// tests/e2e/reports-calendar.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Calendar View Reports', () => {
  test.beforeEach(async ({ page }) => {
    // Go to reports landing, click the first venue's "View Reports" link
    await page.goto('/reports');
    const viewReportsLink = page.getByRole('link', { name: /view reports/i }).first();
    await viewReportsLink.waitFor({ timeout: 10000 });
    await viewReportsLink.click();
    await page.waitForURL(/\/reports\/.+/);
  });

  test('shows Calendar view by default', async ({ page }) => {
    // Calendar toggle button should be active
    await expect(page.getByRole('button', { name: 'Calendar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Analytics' })).toBeVisible();

    // Calendar grid navigation buttons visible
    await expect(page.getByRole('button', { name: /previous month/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /next month/i })).toBeVisible();
  });

  test('can navigate to previous month', async ({ page }) => {
    const header = page.locator('h2').first();
    const initialMonth = await header.textContent();

    await page.getByRole('button', { name: /previous month/i }).click();

    const newMonth = await header.textContent();
    expect(newMonth).not.toBe(initialMonth);
  });

  test('switches to Analytics view', async ({ page }) => {
    await page.getByRole('button', { name: 'Analytics' }).click();
    await expect(page.getByText(/Hourly Traffic Breakdown/i)).toBeVisible();
  });
});
