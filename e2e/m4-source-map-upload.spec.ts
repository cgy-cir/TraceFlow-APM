import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
import {
  adminEmail,
  adminPassword,
  apiBaseUrl,
  consoleBaseUrl,
  csrfHeaders,
  loginApi,
} from './auth-helpers'

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const js = Buffer.from("throw new Error('fixture')")
const map = Buffer.from(
  JSON.stringify({
    version: 3,
    file: 'a.js',
    sources: ['src/a.ts'],
    names: [],
    mappings: 'AAAA',
    sourcesContent: ["throw new Error('fixture')"],
  }),
)

test('M4.2 浏览器上传、删除、重传和封存', async ({ page, request }) => {
  await loginApi(request)
  await loginApi(page.request)
  const apps = await (await request.get(`${apiBaseUrl}/applications`)).json()
  const applicationId = apps.items.find(
    (app: { appKey: string }) => app.appKey === 'tf_app_demo_web',
  ).id
  const response = await request.post(`${apiBaseUrl}/releases`, {
    headers: await csrfHeaders(request),
    data: {
      applicationId,
      releaseName: `m4-upload-${Date.now()}`,
      artifacts: [
        { artifactPath: '/a.js', jsSha256: hash(js), mapSha256: hash(map) },
      ],
    },
  })
  expect(response.status()).toBe(201)
  const id = (await response.json()).release.id
  const route = `${apiBaseUrl}/releases/${id}`
  expect(
    (
      await request.post(`${route}/finalize?applicationId=${applicationId}`, {
        headers: await csrfHeaders(request),
      })
    ).status(),
  ).toBe(409)
  await page.goto(`${consoleBaseUrl}/apps/${applicationId}/releases/${id}`)
  const uploadButton = page.getByRole('button', {
    name: '上传 /a.js',
    exact: true,
  })
  const modal = page.getByRole('dialog', { name: '上传构建产物' })
  const files = async () => {
    await modal
      .getByLabel('JavaScript 文件', { exact: true })
      .setInputFiles({ name: 'a.js', mimeType: 'text/javascript', buffer: js })
    await modal.getByLabel('Source Map 文件', { exact: true }).setInputFiles({
      name: 'a.js.map',
      mimeType: 'application/json',
      buffer: map,
    })
  }
  await expect(uploadButton).toBeEnabled()
  await uploadButton.click()
  await files()
  await modal.getByLabel('JavaScript 文件', { exact: true }).setInputFiles({
    name: 'a.js',
    mimeType: 'text/javascript',
    buffer: Buffer.from('changed JS'),
  })
  await modal.getByRole('button', { name: '提交上传产物', exact: true }).click()
  await expect(
    modal.getByText('文件摘要与版本清单不一致，请上传同一次构建的文件'),
  ).toBeVisible()
  await files()
  await modal.getByRole('button', { name: '提交上传产物', exact: true }).click()
  await expect(modal).toBeHidden()
  await expect(page.getByText('已上传', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '删除 /a.js', exact: true }).click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByText('待上传', { exact: true })).toBeVisible()
  await uploadButton.click()
  await files()
  await page.setViewportSize({ width: 320, height: 800 })
  await expect(modal).toHaveCSS('opacity', '1')
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('upload-mobile.png'),
    fullPage: true,
  })
  await modal.getByRole('button', { name: '提交上传产物', exact: true }).click()
  await expect(modal).toBeHidden()
  await page.getByRole('button', { name: '封存版本', exact: true }).click()
  await page.getByRole('button', { name: '封存', exact: true }).click()
  await expect(page.getByText('已封存', { exact: true })).toBeVisible()
  await expect(uploadButton).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '删除 /a.js', exact: true }),
  ).toHaveCount(0)
  const metadata = await (
    await request.get(`${route}/source-maps?applicationId=${applicationId}`)
  ).json()
  expect(metadata.items).toHaveLength(1)
  expect(metadata.items[0].mapContent).toBeUndefined()
  expect(metadata.items[0].sourcesWithContent).toBe(1)
  expect(
    (
      await request.delete(
        `${route}/source-maps/${metadata.items[0].id}?applicationId=${applicationId}`,
        { headers: await csrfHeaders(request) },
      )
    ).status(),
  ).toBe(409)
  expect(
    (
      await request.post(
        `${route}/source-maps?applicationId=${applicationId}`,
        {
          headers: await csrfHeaders(request),
          multipart: {
            artifactPath: '/a.js',
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
  ).toBe(200)
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
    path: test.info().outputPath('finalized-desktop.png'),
    fullPage: true,
  })
})

test('M4.4 真实构建、私有 Map、首次部署登记与源码定位闭环', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)
  await loginApi(request)
  const output = path.resolve(test.info().outputPath('public'))
  const server = createServer(async (incoming, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(incoming.url ?? '/', 'http://localhost').pathname,
      )
      if (!pathname.startsWith('/m4/')) {
        response.writeHead(404).end()
        return
      }
      const relative = pathname.slice(4) || 'index.html'
      const file = path.resolve(output, relative)
      if (!file.startsWith(output + path.sep)) {
        response.writeHead(404).end()
        return
      }
      const resolved = await realpath(file)
      if (!resolved.startsWith(output + path.sep)) {
        response.writeHead(404).end()
        return
      }
      const bytes = await readFile(resolved)
      const type = file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : 'text/html'
      response.writeHead(200, { 'Content-Type': type }).end(bytes)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const origin = `http://127.0.0.1:${port}`
  const name = `demo-web@m4-production-${Date.now()}`
  try {
    const created = await request.post(`${apiBaseUrl}/applications`, {
      headers: await csrfHeaders(request),
      data: { name: `Z M4 Production ${Date.now()}`, allowedOrigins: [origin] },
    })
    expect(created.status()).toBe(201)
    const application = await created.json()
    const env = {
      ...process.env,
      VITE_TRACEFLOW_ENDPOINT: `${apiBaseUrl}/events/batch`,
      VITE_TRACEFLOW_APP_KEY: application.appKey,
      VITE_TRACEFLOW_ENVIRONMENT: 'production',
      TRACEFLOW_API_BASE: apiBaseUrl,
      TRACEFLOW_UPLOAD_EMAIL: adminEmail,
      TRACEFLOW_UPLOAD_PASSWORD: adminPassword,
    }
    const buildStarted = performance.now()
    execFileSync(
      process.execPath,
      [
        'scripts/build-demo-release.mjs',
        '--release',
        name,
        '--url-prefix',
        '/m4/',
      ],
      { cwd: process.cwd(), env, stdio: 'pipe' },
    )
    const buildMs = performance.now() - buildStarted
    const dist = path.resolve('apps/demo/dist-private')
    const args = [
      'scripts/upload-source-maps.mjs',
      '--application-id',
      String(application.id),
      '--release',
      name,
      '--dist',
      dist,
      '--url-prefix',
      '/m4/',
    ]
    const uploadStarted = performance.now()
    execFileSync(process.execPath, args, {
      cwd: process.cwd(),
      env,
      stdio: 'pipe',
    })
    const uploadMs = performance.now() - uploadStarted
    const repeatedUploadStarted = performance.now()
    // Running the same upload again must reuse the sealed version and skip existing matching artifacts.
    execFileSync(process.execPath, args, {
      cwd: process.cwd(),
      env,
      stdio: 'pipe',
    })
    const repeatedUploadMs = performance.now() - repeatedUploadStarted
    const result = await (
      await request.get(`${apiBaseUrl}/releases`, {
        params: { applicationId: application.id, query: name },
      })
    ).json()
    expect(result.items).toHaveLength(1)
    expect(result.items[0].status).toBe('finalized')
    expect(result.items[0].deployedAt).toBeNull()
    expect(result.items[0].artifactCount).toBe(
      result.items[0].expectedArtifactCount,
    )
    const publicStarted = performance.now()
    execFileSync(
      process.execPath,
      [
        'scripts/prepare-public-assets.mjs',
        '--release',
        name,
        '--dist',
        dist,
        '--out',
        output,
        '--url-prefix',
        '/m4/',
      ],
      { cwd: process.cwd(), env, stdio: 'pipe' },
    )
    const publicPreparationMs = performance.now() - publicStarted
    const artifacts = await (
      await request.get(
        `${apiBaseUrl}/releases/${result.items[0].id}/source-maps`,
        { params: { applicationId: application.id } },
      )
    ).json()
    expect(artifacts.items[0].sourcesWithContent).toBeGreaterThan(0)
    expect(
      (
        await request.get(`${origin}${artifacts.items[0].artifactPath}.map`)
      ).status(),
    ).toBe(404)
    expect(
      (await request.get(`${origin}/m4/traceflow-release.json`)).status(),
    ).toBe(404)
    await page.goto(`${origin}/m4/`)
    await expect(
      page.getByRole('heading', { name: '监控事件实验台' }),
    ).toBeVisible()
    const deployedAt = Date.now()
    const batch = page.waitForResponse(
      (response) =>
        response.url() === `${apiBaseUrl}/events/batch` &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /手动错误/ }).click()
    await page.getByRole('button', { name: /立即上报/ }).click()
    expect((await batch).ok()).toBeTruthy()
    await expect
      .poll(async () => {
        const issues = await (
          await request.get(`${apiBaseUrl}/issues`, {
            params: { applicationId: application.id, release: name },
          })
        ).json()
        return issues.total
      })
      .toBeGreaterThan(0)
    await loginApi(page.request)
    const releaseId = result.items[0].id
    await page.goto(
      `${consoleBaseUrl}/apps/${application.id}/releases/${releaseId}`,
    )
    await page
      .getByRole('button', { name: '登记首次部署', exact: true })
      .click()
    const deploymentModal = page.getByRole('dialog', {
      name: '登记首次部署',
      exact: true,
    })
    await deploymentModal
      .getByLabel('首次部署时间', { exact: true })
      .fill('2000-01-01T00:00')
    await deploymentModal
      .getByRole('button', { name: '提交首次部署登记', exact: true })
      .click()
    await expect(
      deploymentModal.getByText('不能早于封存时间或超过当前时间一分钟'),
    ).toBeVisible()
    const localDateTime = await page.evaluate((timestamp) => {
      const date = new Date(timestamp)
      const input = document.createElement('input')
      input.type = 'datetime-local'
      input.value = new Date(timestamp - date.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, -1)
      // Native inputs normalize zero seconds and trailing fractional zeros; fill the canonical value.
      return input.value
    }, deployedAt)
    await deploymentModal
      .getByLabel('首次部署时间', { exact: true })
      .fill(localDateTime)
    await page.setViewportSize({ width: 320, height: 800 })
    await expect(deploymentModal).toHaveCSS('opacity', '1')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy()
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('deployment-mobile.png'),
      fullPage: true,
    })
    const registration = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().includes(`/releases/${releaseId}/deployment`),
    )
    await deploymentModal
      .getByRole('button', { name: '提交首次部署登记', exact: true })
      .click()
    const registered = await registration
    expect(registered.status()).toBe(200)
    expect(registered.request().postDataJSON()).toEqual({ deployedAt })
    expect((await registered.json()).release.deployedAt).toBe(deployedAt)
    await expect(deploymentModal).toBeHidden()
    await expect(
      page.getByRole('button', { name: '登记首次部署', exact: true }),
    ).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('未登记', { exact: true })).toHaveCount(0)
    const deploymentRoute = `${apiBaseUrl}/releases/${releaseId}/deployment`
    expect(
      (
        await request.patch(deploymentRoute, {
          params: { applicationId: application.id },
          data: { deployedAt },
        })
      ).status(),
    ).toBe(403)
    for (const [timestamp, status] of [
      [deployedAt, 200],
      [deployedAt + 1, 409],
    ]) {
      const response = await request.patch(deploymentRoute, {
        params: { applicationId: application.id },
        headers: await csrfHeaders(request),
        data: { deployedAt: timestamp },
      })
      expect(response.status()).toBe(status)
    }
    expect(
      (
        await request.patch(deploymentRoute, {
          params: { applicationId: Number.MAX_SAFE_INTEGER },
          headers: await csrfHeaders(request),
          data: { deployedAt },
        })
      ).status(),
    ).toBe(404)
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
      path: test.info().outputPath('deployed-release-desktop.png'),
      fullPage: true,
    })
    const issues = await (
      await request.get(`${apiBaseUrl}/issues`, {
        params: { applicationId: application.id, release: name },
      })
    ).json()
    const issueId = issues.items[0].id
    const detail = await (
      await request.get(`${apiBaseUrl}/issues/${issueId}`, {
        params: { applicationId: application.id },
      })
    ).json()
    const eventId = detail.latestEvent.id
    const before = await (
      await request.get(`${apiBaseUrl}/events/${eventId}`, {
        params: { applicationId: application.id },
      })
    ).json()
    const coldStarted = performance.now()
    const stackResponse = await request.get(
      `${apiBaseUrl}/events/${eventId}/stacktrace`,
      { params: { applicationId: application.id } },
    )
    expect(stackResponse.headers()['cache-control']).toContain('no-store')
    const stacktrace = await stackResponse.json()
    const coldQueryMs = performance.now() - coldStarted
    const warmStarted = performance.now()
    await request.get(`${apiBaseUrl}/events/${eventId}/stacktrace`, {
      params: { applicationId: application.id },
    })
    const cachedQueryMs = performance.now() - warmStarted
    await writeFile(
      test.info().outputPath('source-stack-example.json'),
      JSON.stringify(
        {
          applicationId: application.id,
          issueId,
          eventId,
          releaseId: result.items[0].id,
          deployedAt,
          artifactCount: result.items[0].artifactCount,
          totalMapBytes: result.items[0].totalMapBytes,
          buildMs,
          uploadMs,
          repeatedUploadMs,
          publicPreparationMs,
          deploymentUrl: `${consoleBaseUrl}/apps/${application.id}/releases/${releaseId}`,
          issueUrl: `${consoleBaseUrl}/apps/${application.id}/issues/${issueId}?eventId=${eventId}`,
          coldQueryMs,
          cachedQueryMs,
        },
        null,
        2,
      ),
    )
    expect(['resolved', 'partial']).toContain(stacktrace.status)
    const frame = stacktrace.frames.find(
      (item: { original: { filename: string } | null }) =>
        item.original?.filename.endsWith('/src/App.tsx'),
    )
    expect(frame).toBeTruthy()
    const source = await readFile('apps/demo/src/App.tsx', 'utf8')
    const expectedLine =
      source
        .split('\n')
        .findIndex((line) =>
          line.includes('traceFlow.captureException(new Error('),
        ) + 1
    expect(frame.original.line).toBe(expectedLine)
    const metadata = JSON.parse(
      await readFile(path.join(dist, 'traceflow-release.json'), 'utf8'),
    )
    const generatedPath = new URL(frame.generated.filename).pathname
    const artifact = metadata.artifacts.find(
      (item: { artifactPath: string }) => item.artifactPath === generatedPath,
    )
    expect(artifact).toBeTruthy()
    const mapFile = path.join(dist, generatedPath.slice('/m4/'.length) + '.map')
    const independent = originalPositionFor(
      new TraceMap(JSON.parse(await readFile(mapFile, 'utf8'))),
      {
        line: frame.generated.line,
        column: frame.generated.column - 1,
      },
    )
    // trace-mapping uses a zero-based column while the Java adapter and Console use one-based columns.
    expect(frame.original.line).toBe(independent.line)
    expect(frame.original.column).toBe(independent.column! + 1)
    expect(
      frame.original.context.find(
        (line: { isErrorLine: boolean }) => line.isErrorLine,
      ).content,
    ).toContain('traceFlow.captureException(new Error(')
    expect(
      await (
        await request.get(`${apiBaseUrl}/events/${eventId}`, {
          params: { applicationId: application.id },
        })
      ).json(),
    ).toEqual(before)
    const afterIssue = await (
      await request.get(`${apiBaseUrl}/issues/${issueId}`, {
        params: { applicationId: application.id },
      })
    ).json()
    expect(afterIssue.fingerprint).toBe(detail.fingerprint)
    expect(afterIssue.eventCount).toBe(detail.eventCount)
    expect(
      (
        await request.get(`${apiBaseUrl}/events/${eventId}/stacktrace`, {
          params: { applicationId: Number.MAX_SAFE_INTEGER },
        })
      ).status(),
    ).toBe(404)

    await page.goto(
      `${consoleBaseUrl}/apps/${application.id}/issues/${issueId}?eventId=${eventId}`,
    )
    await expect(page.getByTestId('source-context').first()).toBeVisible()
    await expect(
      page
        .getByTestId('source-context')
        .first()
        .locator('[data-error-line="true"]'),
    ).toContainText('traceFlow.captureException(new Error(')
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('source-stack-desktop.png'),
      fullPage: true,
    })
    await page.getByText('原始堆栈', { exact: true }).click()
    await expect(page.locator('.stack-trace')).toContainText(
      before.payload.stack,
    )
    await page.getByText('源码堆栈', { exact: true }).click()
    await page.setViewportSize({ width: 320, height: 800 })
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('source-stack-mobile.png'),
      fullPage: true,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy()
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
