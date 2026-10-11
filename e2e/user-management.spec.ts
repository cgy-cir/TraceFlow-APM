import { expect, test } from '@playwright/test'
import {
  adminEmail,
  adminPassword,
  apiBaseUrl,
  consoleBaseUrl,
  csrfHeaders,
  loginApi,
} from './auth-helpers'

test('登录校验、会话恢复和退出登录', async ({ page, request }) => {
  expect((await request.get(`${apiBaseUrl}/users`)).status()).toBe(401)
  expect(
    (await request.post(`${apiBaseUrl}/events/batch`, { data: {} })).status(),
  ).toBe(400)
  await page.goto(`${consoleBaseUrl}/users`)
  await expect(page.getByRole('heading', { name: '登录控制台' })).toBeVisible()
  await page.getByLabel('邮箱', { exact: true }).fill(adminEmail)
  await page.getByLabel('密码', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('邮箱或密码不正确，或账号已被禁用')).toBeVisible()
  await page.getByLabel('密码', { exact: true }).fill(adminPassword)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '用户管理', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: '用户管理', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '账号菜单' }).click()
  await page.getByRole('menuitem', { name: /退出登录/ }).click()
  await expect(page.getByRole('heading', { name: '登录控制台' })).toBeVisible()
  expect((await page.request.get(`${apiBaseUrl}/users`)).status()).toBe(401)
})

test('管理员管理用户、成员权限与密码更新会使旧会话失效', async ({
  page,
  request,
  browser,
}) => {
  await loginApi(request)
  await loginApi(page.request)
  const email = `e2e-user-${Date.now()}@traceflow.test`
  const password = 'Member@2026'
  const resetPassword = 'Reset@2026'
  await page.goto(`${consoleBaseUrl}/users`)
  await page.getByRole('button', { name: '创建用户', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '创建用户' })
  await dialog.getByLabel('姓名', { exact: true }).fill('Unsaved name')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '创建用户', exact: true }).click()
  await expect(dialog.getByLabel('姓名', { exact: true })).toHaveValue('')
  await dialog.getByLabel('姓名', { exact: true }).fill('E2E Member')
  await dialog.getByLabel('邮箱', { exact: true }).fill(email)
  await dialog.getByLabel('密码', { exact: true }).fill(password)
  await dialog.getByLabel('确认密码', { exact: true }).fill(password)
  await dialog.getByRole('button', { name: '保存用户', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(email, { exact: true })).toBeVisible()
  const list = (await (
    await request.get(`${apiBaseUrl}/users`, { params: { query: email } })
  ).json()) as { items: { id: number }[] }
  const id = list.items[0].id
  expect(
    (
      await request.post(`${apiBaseUrl}/users`, {
        data: { email, displayName: 'Duplicate', password, role: 'member' },
      })
    ).status(),
  ).toBe(403)
  expect(
    (
      await request.post(`${apiBaseUrl}/users`, {
        headers: await csrfHeaders(request),
        data: { email, displayName: 'Duplicate', password, role: 'member' },
      })
    ).status(),
  ).toBe(409)

  const memberContext = await browser.newContext()
  try {
    await loginApi(memberContext.request, email, password)
    const memberPage = await memberContext.newPage()
    await memberPage.goto(`${consoleBaseUrl}/users`)
    await expect(memberPage.getByText('需要管理员权限')).toBeVisible()
    expect(
      (await memberContext.request.get(`${apiBaseUrl}/users`)).status(),
    ).toBe(403)
    expect(
      (await memberContext.request.get(`${apiBaseUrl}/applications`)).ok(),
    ).toBeTruthy()

    await page.bringToFront()

    await page
      .getByRole('button', { name: `编辑 ${email}`, exact: true })
      .click()
    const edit = page.getByRole('dialog', { name: '编辑用户' })
    await expect(edit.getByLabel('姓名', { exact: true })).toHaveValue('E2E Member')
    await edit.getByLabel('姓名', { exact: true }).fill('Unsaved edit')
    await edit.getByRole('button', { name: '取消', exact: true }).click()
    await expect(edit).toBeHidden()
    await page.getByRole('button', { name: `编辑 ${email}`, exact: true }).click()
    await expect(edit.getByLabel('姓名', { exact: true })).toHaveValue('E2E Member')
    await edit.getByLabel('姓名', { exact: true }).fill('E2E Updated Member')
    await edit.getByRole('button', { name: '保存用户', exact: true }).click()
    await expect(edit).toBeHidden()
    await expect(
      page.getByRole('row').filter({ hasText: email }).getByText('E2E Updated Member', { exact: true }),
    ).toBeVisible()

    await page
      .getByRole('button', { name: `重置密码 ${email}`, exact: true })
      .click()
    const reset = page.getByRole('dialog', { name: '重置密码' })
    await reset.getByLabel('新密码', { exact: true }).fill('Unsaved@2026')
    await reset.getByRole('button', { name: '取消', exact: true }).click()
    await expect(reset).toBeHidden()
    await page.getByRole('button', { name: `重置密码 ${email}`, exact: true }).click()
    await expect(reset.getByLabel('新密码', { exact: true })).toHaveValue('')
    await reset.getByLabel('新密码', { exact: true }).fill(resetPassword)
    await reset.getByLabel('确认密码', { exact: true }).fill(resetPassword)
    await reset.getByRole('button', { name: '重置密码', exact: true }).click()
    await expect(reset).toBeHidden()
    expect(
      (await memberContext.request.get(`${apiBaseUrl}/auth/me`)).status(),
    ).toBe(401)
    await memberPage.reload()
    await expect(
      memberPage.getByRole('heading', { name: '登录控制台' }),
    ).toBeVisible()
    await loginApi(memberContext.request, email, resetPassword)
    await memberPage.goto(`${consoleBaseUrl}/`)
    await memberPage.bringToFront()
    await expect(
      memberPage.getByRole('heading', { name: '总览', exact: true }),
    ).toBeVisible()
    await memberPage.getByRole('button', { name: '账号菜单' }).click()
    await memberPage.getByRole('menuitem', { name: /修改密码/ }).press('Enter')
    const ownPassword = memberPage.getByRole('dialog', { name: '修改密码' })
    await expect(ownPassword).toBeVisible()
    await ownPassword
      .getByLabel('当前密码', { exact: true })
      .fill(resetPassword)
    await ownPassword.getByLabel('新密码', { exact: true }).fill('Changed@2026')
    await ownPassword
      .getByLabel('确认密码', { exact: true })
      .fill('Changed@2026')
    await ownPassword.getByRole('button', { name: '保存并重新登录' }).click()
    await expect(
      memberPage.getByRole('heading', { name: '登录控制台' }),
    ).toBeVisible()
    await loginApi(memberContext.request, email, 'Changed@2026')
    await page.bringToFront()
    await page
      .getByRole('switch', { name: `启用账号 ${email}`, exact: true })
      .click()
    await page.getByRole('button', { name: '禁用', exact: true }).click()
    await expect(
      page.getByRole('switch', { name: `启用账号 ${email}`, exact: true }),
    ).not.toBeChecked()
    expect(
      (await memberContext.request.get(`${apiBaseUrl}/auth/me`)).status(),
    ).toBe(401)
    const disabledLogin = await memberContext.request.post(
      `${apiBaseUrl}/auth/login`,
      {
        headers: await csrfHeaders(memberContext.request),
        form: { email, password: 'Changed@2026' },
      },
    )
    expect(disabledLogin.status()).toBe(401)
  } finally {
    await memberContext.close()
    try {
      await request.patch(`${apiBaseUrl}/users/${id}`, {
        headers: await csrfHeaders(request),
        data: { displayName: 'E2E Updated Member', role: 'member', status: 'disabled' },
      })
    } catch {
      // Preserve the original failure if Playwright already disposed the request fixture on timeout.
    }
  }
  const admin = (await (await request.get(`${apiBaseUrl}/auth/me`)).json()) as {
    id: number
    displayName: string
  }
  expect(
    (
      await request.patch(`${apiBaseUrl}/users/${admin.id}`, {
        headers: await csrfHeaders(request),
        data: {
          displayName: admin.displayName,
          role: 'member',
          status: 'active',
        },
      })
    ).status(),
  ).toBe(409)
})
