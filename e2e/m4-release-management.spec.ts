import { expect, test } from '@playwright/test'
import {
  apiBaseUrl,
  consoleBaseUrl,
  csrfHeaders,
  loginApi,
} from './auth-helpers'

test('M4.1 版本创建、幂等、筛选、详情与成员只读', async ({
  page,
  request,
  browser,
}) => {
  await loginApi(request)
  await loginApi(page.request)
  const applications = (await (
    await request.get(`${apiBaseUrl}/applications`)
  ).json()) as { items: { id: number }[] }
  const applicationId = applications.items[0].id
  const name = `m4-e2e-${Date.now()}`
  const artifacts = [
    {
      artifactPath: '/base/assets/index-M4.js',
      jsSha256: 'a'.repeat(64),
      mapSha256: 'b'.repeat(64),
    },
  ]
  const input = { applicationId, releaseName: name, artifacts }
  await page.goto(`${consoleBaseUrl}/apps/${applicationId}/releases`)
  await expect(
    page.getByRole('heading', { name: '版本', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '创建版本', exact: true }).click()
  const modal = page.getByRole('dialog', { name: '创建版本' })
  await modal.getByLabel('版本名称', { exact: true }).fill('Unsaved')
  await modal.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '创建版本', exact: true }).click()
  await expect(modal.getByLabel('版本名称', { exact: true })).toHaveValue('')
  await modal.getByLabel('版本名称', { exact: true }).fill(name)
  await modal
    .getByLabel('JS 资源路径', { exact: true })
    .fill(artifacts[0].artifactPath)
  await modal
    .getByLabel('JS SHA-256', { exact: true })
    .fill(artifacts[0].jsSha256)
  await modal
    .getByLabel('Map SHA-256', { exact: true })
    .fill(artifacts[0].mapSha256)
  await modal.getByRole('button', { name: '提交创建版本', exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(
    page.getByText(artifacts[0].artifactPath, { exact: true }),
  ).toBeVisible()
  const releaseId = Number(new URL(page.url()).pathname.split('/').at(-1))
  const detail = await (
    await request.get(`${apiBaseUrl}/releases/${releaseId}`, {
      params: { applicationId },
    })
  ).json()
  expect(detail.release.status).toBe('draft')
  expect(detail.release.createdAt).toBeGreaterThan(Date.now() - 60_000)
  expect(detail.release.expectedArtifactCount).toBe(1)
  expect(detail.release.artifactCount).toBe(0)
  await expect(
    page.getByRole('button', { name: '登记首次部署', exact: true }),
  ).toHaveCount(0)
  const draftDeployment = await request.patch(
    `${apiBaseUrl}/releases/${releaseId}/deployment`,
    {
      params: { applicationId },
      headers: await csrfHeaders(request),
      data: { deployedAt: Date.now() },
    },
  )
  expect(draftDeployment.status()).toBe(409)
  expect((await draftDeployment.json()).code).toBe('RELEASE_NOT_FINALIZED')

  const repeated = await request.post(`${apiBaseUrl}/releases`, {
    headers: await csrfHeaders(request),
    data: input,
  })
  expect(repeated.status()).toBe(200)
  expect((await repeated.json()).release.id).toBe(releaseId)
  const conflict = await request.post(`${apiBaseUrl}/releases`, {
    headers: await csrfHeaders(request),
    data: {
      ...input,
      artifacts: [{ ...artifacts[0], mapSha256: 'c'.repeat(64) }],
    },
  })
  expect(conflict.status()).toBe(409)
  expect((await conflict.json()).code).toBe('RELEASE_CONFLICT')
  expect(
    (await request.post(`${apiBaseUrl}/releases`, { data: input })).status(),
  ).toBe(403)
  expect(
    (
      await request.get(`${apiBaseUrl}/releases/${releaseId}`, {
        params: { applicationId: Number.MAX_SAFE_INTEGER },
      })
    ).status(),
  ).toBe(404)

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('release-detail-desktop.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 320, height: 800 })
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('release-detail-mobile.png'),
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy()
  await page.getByRole('link', { name: '版本列表', exact: true }).click()
  await page
    .getByRole('searchbox', { name: '搜索版本', exact: true })
    .fill(name)
  await page
    .getByRole('searchbox', { name: '搜索版本', exact: true })
    .press('Enter')
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('release-list-mobile.png'),
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy()
  await page.getByRole('button', { name: '创建版本', exact: true }).click()
  await expect(modal).toBeVisible()
  await expect(modal).toHaveCSS('opacity', '1')
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('release-modal-mobile.png'),
    fullPage: true,
  })
  await modal.getByRole('button', { name: '取消', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect
    .poll(() =>
      page
        .locator('.app-sider')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(220)
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('release-list-desktop.png'),
    fullPage: true,
  })

  const email = `m4-member-${Date.now()}@traceflow.test`
  const userResponse = await request.post(`${apiBaseUrl}/users`, {
    headers: await csrfHeaders(request),
    data: {
      email,
      displayName: 'M4 Readonly',
      password: 'Member@2026',
      role: 'member',
    },
  })
  expect(userResponse.status()).toBe(201)
  const member = (await userResponse.json()) as { id: number }
  const context = await browser.newContext()
  try {
    await loginApi(context.request, email, 'Member@2026')
    const memberPage = await context.newPage()
    await memberPage.goto(
      `${consoleBaseUrl}/apps/${applicationId}/releases?query=${name}`,
    )
    await expect(
      memberPage.getByRole('link', { name, exact: true }),
    ).toBeVisible()
    await expect(
      memberPage.getByRole('button', { name: '创建版本', exact: true }),
    ).toHaveCount(0)
    expect(
      (
        await context.request.post(`${apiBaseUrl}/releases`, {
          headers: await csrfHeaders(context.request),
          data: input,
        })
      ).status(),
    ).toBe(403)
    await memberPage.getByRole('link', { name, exact: true }).click()
    await expect(
      memberPage.getByRole('heading', { name, exact: true }),
    ).toBeVisible()
    await expect(
      memberPage.getByRole('button', { name: '登记首次部署', exact: true }),
    ).toHaveCount(0)
    expect(
      (
        await context.request.patch(
          `${apiBaseUrl}/releases/${releaseId}/deployment`,
          {
            params: { applicationId },
            headers: await csrfHeaders(context.request),
            data: { deployedAt: Date.now() },
          },
        )
      ).status(),
    ).toBe(403)
  } finally {
    await context.close()
    await request.patch(`${apiBaseUrl}/users/${member.id}`, {
      headers: await csrfHeaders(request),
      data: { displayName: 'M4 Readonly', role: 'member', status: 'disabled' },
    })
  }
})
