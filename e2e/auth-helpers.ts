import { expect, test as base, type APIRequestContext } from '@playwright/test'

export const apiBaseUrl =
  process.env.TRACEFLOW_API_BASE ?? 'http://localhost:18080/api/v1'
export const consoleBaseUrl =
  process.env.TRACEFLOW_CONSOLE_BASE ?? 'http://localhost:5173'
export const demoBaseUrl =
  process.env.TRACEFLOW_DEMO_BASE ?? 'http://localhost:5174'
export const adminEmail =
  process.env.TRACEFLOW_E2E_EMAIL ?? 'local@traceflow.dev'
export const adminPassword =
  process.env.TRACEFLOW_E2E_PASSWORD ?? 'TraceFlow@2026'

export async function csrfHeaders(request: APIRequestContext) {
  const response = await request.get(`${apiBaseUrl}/auth/csrf`)
  expect(response.ok()).toBeTruthy()
  const csrf = (await response.json()) as { headerName: string; token: string }
  return { [csrf.headerName]: csrf.token }
}

export async function loginApi(
  request: APIRequestContext,
  email = adminEmail,
  password = adminPassword,
) {
  const response = await request.post(`${apiBaseUrl}/auth/login`, {
    headers: await csrfHeaders(request),
    form: { email, password },
  })
  expect(response.ok()).toBeTruthy()
}

export const test = base.extend<{ authenticated: boolean }>({
  authenticated: [
    async ({ page, request }, use) => {
      await loginApi(request)
      await loginApi(page.request)
      await use(true)
    },
    { auto: true },
  ],
})
