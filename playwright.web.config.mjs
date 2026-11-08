import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.dirname(fileURLToPath(import.meta.url))
if (process.env.API_TEST_MODE !== 'db' || process.env.API_TEST_PORT !== '4101')
  throw new Error(
    'Use the guarded npm run test:web:auth or test:web:integration runner',
  )
const frontendEnv = {
  NODE_ENV: 'development',
  NEXT_PUBLIC_ESHOP_MODE: 'live',
  NEXT_PUBLIC_ESHOP_API_URL: 'http://127.0.0.1:4101',
  ESHOP_API_URL: 'http://127.0.0.1:4101',
  NEXT_TELEMETRY_DISABLED: '1',
  DATABASE_URL: '',
  DIRECT_URL: '',
  JWT_ACCESS_SECRET: '',
  AUTH_ACTION_TOKEN_ENCRYPTION_KEY: '',
  MEDIA_DISK_UPLOAD_SECRET: '',
  MEDIA_DISK_ROOT: '',
}
export default defineConfig({
  testDir: './web-integration-tests',
  testMatch: '**/*.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: [
    ['list'],
    ['json', { outputFile: 'validation/web-integration/browser-results.json' }],
  ],
  outputDir: 'test-results-web-auth',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4101',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node -r dotenv/config dist/main.js',
      cwd: root,
      url: 'http://127.0.0.1:4101/v1/health',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        ...process.env,
        PORT: '4101',
        NODE_ENV: 'test',
        SWAGGER_ENABLED: 'true',
      },
    },
    {
      command:
        'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3300',
      cwd: path.resolve(root, '../eshop-user-frontend'),
      url: 'http://127.0.0.1:3300/sign-in',
      reuseExistingServer: false,
      timeout: 120000,
      env: { ...frontendEnv, ESHOP_APP_ORIGIN: 'http://127.0.0.1:3300' },
    },
    {
      command:
        'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3301',
      cwd: path.resolve(root, '../eshop-admin-frontend'),
      url: 'http://127.0.0.1:3301/sign-in',
      reuseExistingServer: false,
      timeout: 120000,
      env: { ...frontendEnv, ESHOP_APP_ORIGIN: 'http://127.0.0.1:3301' },
    },
  ],
})
