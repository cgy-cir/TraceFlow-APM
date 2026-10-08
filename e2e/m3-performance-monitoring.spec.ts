import { expect, test, type APIRequestContext } from '@playwright/test'

const apiBaseUrl = process.env.TRACEFLOW_API_BASE ?? 'http://localhost:18080/api/v1'
const consoleBaseUrl = process.env.TRACEFLOW_CONSOLE_BASE ?? 'http://localhost:5173'
const demoBaseUrl = process.env.TRACEFLOW_DEMO_BASE ?? 'http://localhost:5174'

interface Application {
  id: number
  appKey: string
}

interface MetricSummary {
  metric: string
  sampleCount: number
  p75: number | null
  percentileMethod: string
}

interface ResourceDetail {
  occurredAt: number
  url: string
}

test('Demo 性能事件可以聚合并进入性能工作台', async ({ page, request }) => {
  const applicationId = await getDemoApplicationId(request)
  const startedAt = Date.now()

  await page.goto(demoBaseUrl)
  await page.getByRole('button', { name: /慢交互/ }).click()
  await page.getByRole('button', { name: /布局偏移/ }).click()
  await page.waitForTimeout(5_500)
  await page.getByRole('button', { name: /立即上报/ }).click()

  const from = startedAt - 60_000
  const to = Date.now() + 60_000
  await page.goto(`${consoleBaseUrl}/apps/${applicationId}/performance?from=${from}&to=${to}&environment=development&tab=navigation`)

  await expect.poll(async () => {
    const resources = await getResources(request, applicationId, startedAt, Date.now() + 60_000)
    return resources.some((resource) => resource.occurredAt >= startedAt)
  }, { timeout: 15_000, intervals: [1_000] }).toBeTruthy()

  await expect.poll(async () => {
    const metrics = await getSummary(request, applicationId, from, to, ['NAV_LOAD'])
    return metrics.find((metric) => metric.metric === 'NAV_LOAD')?.sampleCount ?? 0
  }, { timeout: 25_000, intervals: [1_000, 2_000] }).toBeGreaterThan(0)

  await page.reload()
  await expect(page.getByRole('heading', { name: '性能' })).toBeVisible()
  await expect(page.getByText('NAV_LOAD', { exact: true })).toBeVisible()
  await expect(page.getByText('P75 近似值').first()).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(1)

  await page.getByRole('tab', { name: 'Resources' }).click()
  await expect(page.getByText('RESOURCE_DURATION', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '慢资源明细' })).toBeVisible()
  await expect(page.locator('.ant-table-row').first()).toBeVisible()
})

async function getDemoApplicationId(request: APIRequestContext) {
  const response = await request.get(`${apiBaseUrl}/applications`)
  expect(response.ok()).toBeTruthy()
  const body = await response.json() as { items: Application[] }
  const application = body.items.find((item) => item.appKey === 'tf_app_demo_web')
  expect(application, '开发数据中应存在 Demo Web 应用').toBeDefined()
  return application!.id
}

async function getResources(request: APIRequestContext, applicationId: number, from: number, to: number) {
  const response = await request.get(`${apiBaseUrl}/resources`, {
    params: { applicationId, from, to, environment: 'development' },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json() as { items: ResourceDetail[] }
  return body.items
}

async function getSummary(
  request: APIRequestContext,
  applicationId: number,
  from: number,
  to: number,
  metrics: string[],
) {
  const response = await request.get(`${apiBaseUrl}/performance/summary`, {
    params: { applicationId, from, to, environment: 'development', metrics: metrics.join(',') },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json() as { metrics: MetricSummary[] }
  expect(body.metrics.every((metric) => metric.percentileMethod === 'fixed_histogram_v1')).toBeTruthy()
  return body.metrics
}
