import { expect, test } from '@playwright/test'
import { createHash, randomUUID } from 'node:crypto'
import {
  apiBaseUrl,
  consoleBaseUrl,
  csrfHeaders,
  loginApi,
} from './auth-helpers'

test('M4.3 后补版本、逐帧降级、事件切换和源码文本安全', async ({
  page,
  request,
}) => {
  await loginApi(request)
  await loginApi(page.request)
  const apps = await (await request.get(`${apiBaseUrl}/applications`)).json()
  const app = apps.items.find(
    (item: { appKey: string }) => item.appKey === 'tf_app_demo_web',
  )
  const origin = app.allowedOrigins[0]
  const release = `m4-backfill-${Date.now()}`
  const missing = `m4-unregistered-${Date.now()}`
  const message = `M4 stack fixture ${randomUUID()}`
  const ids = [randomUUID(), randomUUID()]
  const stack = `Error: ${message}\n at test (${origin}/m4-fixture/a.js:1:1)\n at third (https://third.example/third.js:1:1)`
  const timestamp = Date.now()
  const batch = await request.post(`${apiBaseUrl}/events/batch`, {
    headers: { Origin: origin },
    data: {
      schemaVersion: 1,
      batchId: randomUUID(),
      appKey: app.appKey,
      sentAt: timestamp,
      sdk: { name: '@traceflow/web-sdk', version: '0.1.0' },
      events: ids.map((eventId, index) => ({
        eventId,
        timestamp,
        type: 'error',
        sessionId: randomUUID(),
        environment: 'development',
        release: index === 0 ? release : missing,
        page: { url: origin + '/', path: '/' },
        payload: {
          mechanism: 'manual',
          name: 'Error',
          message,
          stack,
          handled: true,
        },
      })),
    },
  })
  expect(batch.ok()).toBeTruthy()
  const issues = await (
    await request.get(`${apiBaseUrl}/issues`, {
      params: { applicationId: app.id, release },
    })
  ).json()
  expect(issues.items).toHaveLength(1)
  const issueId = issues.items[0].id
  const events = await (
    await request.get(`${apiBaseUrl}/issues/${issueId}/events`, {
      params: { applicationId: app.id },
    })
  ).json()
  const first = events.items.find(
    (item: { eventId: string }) => item.eventId === ids[0],
  )
  const second = events.items.find(
    (item: { eventId: string }) => item.eventId === ids[1],
  )
  expect(first).toBeTruthy()
  expect(second).toBeTruthy()
  const resolve = async () =>
    (
      await request.get(`${apiBaseUrl}/events/${first.id}/stacktrace`, {
        params: { applicationId: app.id },
      })
    ).json()
  expect(
    (await resolve()).diagnostics.map((item: { code: string }) => item.code),
  ).toContain('RELEASE_NOT_FOUND')
  const js = Buffer.from("throw Error('fixture')")
  const content = '<img src=x onerror="window.__traceflowXss=1">'
  const map = Buffer.from(
    JSON.stringify({
      version: 3,
      file: 'a.js',
      sources: ['src/fixture.ts'],
      names: [],
      mappings: 'AAAA',
      sourcesContent: [content],
    }),
  )
  const hash = (bytes: Buffer) =>
    createHash('sha256').update(bytes).digest('hex')
  const created = await request.post(`${apiBaseUrl}/releases`, {
    headers: await csrfHeaders(request),
    data: {
      applicationId: app.id,
      releaseName: release,
      artifacts: [
        {
          artifactPath: '/m4-fixture/a.js',
          jsSha256: hash(js),
          mapSha256: hash(map),
        },
      ],
    },
  })
  expect(created.status()).toBe(201)
  const releaseId = (await created.json()).release.id
  expect(
    (await resolve()).diagnostics.map((item: { code: string }) => item.code),
  ).toContain('RELEASE_NOT_FINALIZED')
  expect(
    (
      await request.post(
        `${apiBaseUrl}/releases/${releaseId}/source-maps?applicationId=${app.id}`,
        {
          headers: await csrfHeaders(request),
          multipart: {
            artifactPath: '/m4-fixture/a.js',
            javascript: {
              name: 'a.js',
              mimeType: 'text/javascript',
              buffer: js,
            },
            sourceMap: {
              name: 'a.js.map',
              mimeType: 'application/json',
              buffer: map,
            },
          },
        },
      )
    ).status(),
  ).toBe(201)
  expect(
    (
      await request.post(
        `${apiBaseUrl}/releases/${releaseId}/finalize?applicationId=${app.id}`,
        { headers: await csrfHeaders(request) },
      )
    ).ok(),
  ).toBeTruthy()
  const result = await resolve()
  expect(result.status).toBe('partial')
  expect(result.frames[0].original.context[0].content).toBe(content)
  expect(result.frames[1].reason).toBe('SOURCE_MAP_NOT_FOUND')

  await page.goto(
    `${consoleBaseUrl}/apps/${app.id}/issues/${issueId}?eventId=${first.id}`,
  )
  await expect(page.getByTestId('source-context').first()).toContainText(
    content,
  )
  expect(await page.getByTestId('source-context').locator('img').count()).toBe(
    0,
  )
  expect(
    await page.evaluate(
      () => (window as unknown as { __traceflowXss?: number }).__traceflowXss,
    ),
  ).toBeUndefined()
  await page.getByText('原始堆栈', { exact: true }).click()
  await expect(page.locator('.stack-trace')).toContainText(stack)
  await page
    .locator(`[data-testid="issue-event"][data-event-id="${second.id}"]`)
    .click()
  await expect(page.getByRole('alert').getByText('该应用尚未注册此版本', { exact: true })).toBeVisible()
  await expect(page.getByTestId('source-context')).toHaveCount(0)
  await page.getByText('原始堆栈', { exact: true }).click()
  await expect(page.locator('.stack-trace')).toContainText(stack)
})
