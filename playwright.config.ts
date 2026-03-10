// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Manually parse .env.test.local — avoids dotenvx v17 path resolution quirks in TS runner
const envFile = path.resolve(__dirname, '.env.test.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key?.trim()) process.env[key.trim()] = rest.join('=').trim();
  }
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3001',
  },
  projects: [
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
      use: { storageState: undefined },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
});
