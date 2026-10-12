import { expect, test } from '@playwright/test'
import { apiBaseUrl, consoleBaseUrl, loginApi } from './auth-helpers'

test('生产空应用入口、创建校验、真实创建与缓存刷新', async ({
  page,
  request,
}) => {
  await loginApi(page.request)
  await loginApi(request)
  let empty = true
  let posts = 0
  await page.route('**/api/v1/applications', async (route) => {
    if (route.request().method() === 'GET' && empty) {
      await route.fulfill({ json: { items: [], total: 0 } })
    } else if (route.request().method() === 'POST') {
      posts++
      const response = await route.fetch()
      if (response.ok()) empty = false
      await route.fulfill({ response })
    } else await route.continue()
  })
  await page.goto(consoleBaseUrl)
  await expect(page.getByText('暂无监控应用', { exact: true })).toBeVisible()
  await expect(page.getByText('请确认后端服务和 MySQL 已启动。')).toHaveCount(0)
  await page.getByRole('button', { name: '创建应用', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '创建应用' })
  await dialog.getByLabel('应用名称', { exact: true }).fill('Unsaved')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '创建应用', exact: true }).click()
  await expect(dialog.getByLabel('应用名称', { exact: true })).toHaveValue('')
  const name = `zz-onboarding-${Date.now()}`
  await dialog.getByLabel('应用名称', { exact: true }).fill(name)
  await dialog
    .getByLabel('允许的 Origin', { exact: true })
    .fill('https://demo.revengedog.online/path')
  await dialog.getByRole('button', { name: '提交创建应用' }).click()
  await expect(
    dialog.getByText(
      'Origin 只能包含 http(s) 协议、域名和端口，不能包含路径或参数',
    ),
  ).toBeVisible()
  expect(posts).toBe(0)
  for (const [width, label] of [
    [1440, 'desktop'],
    [320, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height: 800 })
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true)
    await page.screenshot({
      path: test.info().outputPath(`create-application-${label}.png`),
      animations: 'disabled',
    })
  }
  await dialog
    .getByLabel('允许的 Origin', { exact: true })
    .fill('https://demo.revengedog.online/\nhttps://demo.revengedog.online')
  await dialog.getByRole('button', { name: '提交创建应用' }).click()
  await expect(
    page.getByRole('heading', { name: '应用设置', exact: true }),
  ).toBeVisible()
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
  const id = Number(new URL(page.url()).pathname.split('/')[2])
  const { items } = await (
    await request.get(`${apiBaseUrl}/applications`)
  ).json()
  const created = items.find((item: { id: number }) => item.id === id)
  expect(created.name).toBe(name)
  expect(created.allowedOrigins).toEqual(['https://demo.revengedog.online'])
  expect(created.appKey).toMatch(/^tf_app_[a-f0-9]{32}$/)
  expect(posts).toBe(1)
  await expect(page.getByText(created.appKey, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '创建应用', exact: true }).click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
})

test('入口区分请求失败与空列表，并支持重试；成员没有创建入口', async ({
  page,
}) => {
  await loginApi(page.request)
  let failed = true
  await page.route('**/api/v1/applications', (route) =>
    route.fulfill(
      failed
        ? { status: 503, json: { message: '服务暂时不可用' } }
        : { json: { items: [], total: 0 } },
    ),
  )
  await page.goto(consoleBaseUrl)
  await expect(
    page.getByText('应用列表加载失败', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('暂无监控应用', { exact: true })).toHaveCount(0)
  failed = false
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByText('暂无监控应用', { exact: true })).toBeVisible()
  await page.route('**/api/v1/auth/me', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      json: { ...(await response.json()), role: 'member' },
    })
  })
  await page.reload()
  await expect(
    page.getByText('暂无监控应用，请联系管理员创建', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '创建应用', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '用户管理', exact: true }),
  ).toHaveCount(0)
})
