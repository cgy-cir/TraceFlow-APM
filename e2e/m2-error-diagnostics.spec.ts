import { expect, test, type APIRequestContext } from '@playwright/test'

const apiBaseUrl = 'http://localhost:18080/api/v1'
const issueQuery = 'Demo checkout'

interface Application {
  id: number
  appKey: string
}

interface Issue {
  id: number
  title: string
  status: string
  eventCount: number
  lastSeenAt: number
}

interface IssueDetail extends Issue {
  fingerprintVersion: number
}

interface PagedResponse<T> {
  items: T[]
}

test('Demo 错误可以聚合、诊断并在解决后回归', async ({ page, request }) => {
  const applicationId = await getDemoApplicationId(request)
  const baselineIssues = await getVersionTwoIssues(request, applicationId)
  const baselineCounts = new Map(baselineIssues.map((issue) => [issue.id, issue.eventCount]))

  // 每次测试先收敛到待处理状态，避免本地重复执行遗留的 ignored/resolved 状态影响断言。
  await Promise.all(baselineIssues.map((issue) => ensureUnresolved(request, applicationId, issue)))

  const startedAt = Date.now()
  await page.goto('http://localhost:5174')
  await page.getByRole('button', { name: /手动错误/ }).click()
  await page.getByRole('button', { name: /手动错误/ }).click()
  await page.getByRole('button', { name: /立即上报/ }).click()

  const issue = await waitForAggregatedIssue(request, applicationId, baselineCounts, startedAt, 2)
  const expectedCount = (baselineCounts.get(issue.id) ?? 0) + 2

  await page.goto(`http://localhost:5173/apps/${applicationId}/issues/${issue.id}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Demo checkout \d+ failed/)
  await expect(page.locator('.ant-statistic').filter({ hasText: '事件总数' })
    .locator('.ant-statistic-content-value')).toHaveText(String(expectedCount))
  await expect(page.getByRole('heading', { name: '调用栈' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '发生前的面包屑' })).toBeVisible()
  await expect(page.getByText('Checkout submitted').first()).toBeVisible()
  await expect(page.getByText('development', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('demo-web@0.1.0', { exact: true }).first()).toBeVisible()

  await page.getByLabel('修改 Issue 状态').click()
  await page.locator('.ant-select-dropdown:visible').getByText('已解决', { exact: true }).click()
  await expect.poll(async () => (await getIssue(request, applicationId, issue.id)).status).toBe('resolved')

  await page.goto('http://localhost:5174')
  await page.getByRole('button', { name: /手动错误/ }).click()
  await page.getByRole('button', { name: /立即上报/ }).click()

  await expect.poll(async () => {
    const current = await getIssue(request, applicationId, issue.id)
    return { status: current.status, eventCount: current.eventCount }
  }).toEqual({ status: 'regressed', eventCount: expectedCount + 1 })

  await page.goto(`http://localhost:5173/apps/${applicationId}/issues/${issue.id}`)
  await expect(page.getByText('已回归', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.event-rail .ant-list-item')).toHaveCount(Math.min(expectedCount + 1, 20))
})

async function getDemoApplicationId(request: APIRequestContext) {
  const response = await request.get(`${apiBaseUrl}/applications`)
  expect(response.ok()).toBeTruthy()
  const body = await response.json() as { items: Application[] }
  const application = body.items.find((item) => item.appKey === 'tf_app_demo_web')
  expect(application, '开发数据中应存在 Demo Web 应用').toBeDefined()
  return application!.id
}

async function getVersionTwoIssues(request: APIRequestContext, applicationId: number) {
  const response = await request.get(`${apiBaseUrl}/issues`, {
    params: { applicationId, query: issueQuery, pageSize: 100 },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json() as PagedResponse<Issue>
  const details = await Promise.all(body.items.map((issue) => getIssue(request, applicationId, issue.id)))
  return details.filter((issue) => issue.fingerprintVersion === 2)
}

async function getIssue(request: APIRequestContext, applicationId: number, issueId: number) {
  const response = await request.get(`${apiBaseUrl}/issues/${issueId}`, { params: { applicationId } })
  expect(response.ok()).toBeTruthy()
  return response.json() as Promise<IssueDetail>
}

async function updateStatus(request: APIRequestContext, applicationId: number, issueId: number, status: string) {
  const response = await request.patch(`${apiBaseUrl}/issues/${issueId}/status`, {
    data: { applicationId, status, reason: 'Playwright M2 验收准备' },
  })
  expect(response.ok()).toBeTruthy()
}

async function ensureUnresolved(request: APIRequestContext, applicationId: number, issue: IssueDetail) {
  if (issue.status === 'unresolved') return
  if (issue.status === 'regressed') {
    await updateStatus(request, applicationId, issue.id, 'resolved')
  }
  await updateStatus(request, applicationId, issue.id, 'unresolved')
}

async function waitForAggregatedIssue(
  request: APIRequestContext,
  applicationId: number,
  baselineCounts: Map<number, number>,
  startedAt: number,
  increment: number,
) {
  let matched: IssueDetail | undefined
  await expect.poll(async () => {
    const candidates = await getVersionTwoIssues(request, applicationId)
    matched = candidates.find((issue) => issue.lastSeenAt >= startedAt
      && issue.eventCount >= (baselineCounts.get(issue.id) ?? 0) + increment)
    return matched?.id
  }, { timeout: 15_000 }).toBeTruthy()
  return matched!
}
