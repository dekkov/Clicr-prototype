// tests/e2e/auth.setup.ts
import { test as setup } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
  // Ensure .auth directory exists
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(process.env.TEST_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.TEST_PASSWORD!);
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  // Wait for redirect to authenticated route
  await page.waitForURL(/dashboard|reports|venues/, { timeout: 15000 });

  // Save auth state
  await page.context().storageState({ path: authFile });
});
