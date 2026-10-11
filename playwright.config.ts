import { defineConfig, devices } from '@playwright/test'

const backendCommand = process.platform === 'win32'
  ? 'cd server && mvnw.cmd spring-boot:run'
  : 'cd server && ./mvnw --batch-mode --no-transfer-progress spring-boot:run'

const apiBase = process.env.TRACEFLOW_API_BASE ?? 'http://localhost:18080/api/v1'
const consoleBase = process.env.TRACEFLOW_CONSOLE_BASE ?? 'http://localhost:5173'
const demoBase = process.env.TRACEFLOW_DEMO_BASE ?? 'http://localhost:5174'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  outputDir: 'test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PLAYWRIGHT_CHANNEL,
      },
    },
  ],
  webServer: [
    {
      command: backendCommand,
      url: `${apiBase}/health`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run dev --workspace @traceflow/console -- --host localhost --port ${Number(new URL(consoleBase).port) || 5173} --strictPort`,
      url: consoleBase,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run dev --workspace @traceflow/demo -- --host localhost --port ${Number(new URL(demoBase).port) || 5174} --strictPort`,
      url: demoBase,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
