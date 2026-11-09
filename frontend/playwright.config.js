import { existsSync } from 'node:fs';
const entorno = process.env.TEST_ENV_FILE || '../.env';
if (existsSync(entorno)) process.loadEnvFile(entorno);
if (!process.env.TEST_ADMIN_EMAIL && process.env.ADMIN_EMAIL) process.env.TEST_ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!process.env.TEST_ADMIN_PASSWORD && process.env.ADMIN_PASSWORD) process.env.TEST_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (process.env.E2E_REAL && (!process.env.TEST_ADMIN_EMAIL || !process.env.TEST_ADMIN_PASSWORD)) {
  throw new Error('Faltan TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD o sus variables ADMIN equivalentes.');
}
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  workers: 1,
  forbidOnly: true,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: {
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      ...(process.env.CHROMIUM_NO_SANDBOX === '1' ? { args: ['--no-sandbox'] } : {}),
    },
  },
  reporter: 'list',
});
