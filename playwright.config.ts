import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against a production build served by `vite preview`.
 * The build goes to dist-e2e/ (so it never clobbers the deploy artifact in dist/) and enables
 * the "Found online" tab with a fake worker origin. ALL external network is mocked in tests.
 */
export const E2E_WORKER_URL = 'https://bsq-worker.e2e.example';
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/birthday-side-quests/`,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-pixel7', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/birthday-side-quests/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_WORKER_URL: E2E_WORKER_URL, VITE_BASE: '/birthday-side-quests/' },
  },
});
