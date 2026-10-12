import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import https from 'node:https'

const project = `traceflow-check-${randomBytes(4).toString('hex')}`
const password = randomBytes(24).toString('hex')
const env = {
  ...process.env,
  SERVER_IMAGE:
    process.env.TRACEFLOW_CHECK_SERVER_IMAGE || 'traceflow-server-check:local',
  WEB_IMAGE:
    process.env.TRACEFLOW_CHECK_WEB_IMAGE || 'traceflow-web-check:local',
  APM_HOST: 'localhost',
  DEMO_HOST: 'demo.localhost',
  ACME_EMAIL: 'check@example.com',
  TRACEFLOW_DB_PASSWORD: randomBytes(24).toString('hex'),
  TRACEFLOW_MYSQL_ROOT_PASSWORD: randomBytes(24).toString('hex'),
  TRACEFLOW_BOOTSTRAP_ADMIN_EMAIL: 'check@example.com',
  TRACEFLOW_BOOTSTRAP_ADMIN_PASSWORD: password,
}
const args = [
  'compose',
  '--project-name',
  project,
  '--env-file',
  'deploy/.env.production.example',
  '-f',
  'deploy/compose.production.yml',
  '-f',
  'deploy/compose.check.yml',
]
const compose = (...command) =>
  execFileSync('docker', [...args, ...command], {
    env,
    encoding: 'utf8',
    timeout: 300_000,
  })
let cookies = new Map()
let port

function request(path, { method = 'GET', headers = {}, body } = {}) {
  // Only this isolated loopback test trusts Caddy's temporary local certificate.
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port,
        servername: 'localhost',
        rejectUnauthorized: false,
        path,
        method,
        headers: {
          Host: 'localhost',
          Cookie: [...cookies]
            .map(([key, value]) => `${key}=${value}`)
            .join('; '),
          ...headers,
        },
      },
      (response) => {
        const chunks = []
        for (const value of response.headers['set-cookie'] ?? []) {
          const pair = value.split(';')[0]
          const separator = pair.indexOf('=')
          cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
        }
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve({
            status: response.statusCode,
            headers: response.headers,
            text,
            json: () => JSON.parse(text),
          })
        })
      },
    )
    req.setTimeout(15_000, () =>
      req.destroy(new Error('Loopback request timed out')),
    )
    req.on('error', reject)
    req.end(body)
  })
}

async function write(path, data) {
  const csrf = await request('/api/v1/auth/csrf')
  assert.equal(csrf.status, 200)
  const token = csrf.json()
  return request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [token.headerName]: token.token,
    },
    body: JSON.stringify(data),
  })
}

try {
  compose('up', '-d', '--wait', '--wait-timeout', '240')
  const address = compose('port', 'web', '443').trim()
  assert.match(address, /^127\.0\.0\.1:\d+$/)
  port = Number(address.split(':').at(-1))
  const health = await request('/api/v1/health')
  assert.equal(health.status, 200)
  assert.equal(health.json().status, 'UP')
  assert.match((await request('/login')).text, /id="root"/)
  const csrf = (await request('/api/v1/auth/csrf')).json()
  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      [csrf.headerName]: csrf.token,
    },
    body: new URLSearchParams({
      email: 'check@example.com',
      password,
    }).toString(),
  })
  assert.equal(login.status, 200)
  assert.equal(login.json().role, 'admin')
  assert.match(login.headers['set-cookie'].join(';'), /HttpOnly/i)
  assert.match(login.headers['set-cookie'].join(';'), /Secure/i)
  assert.equal(
    (await request('/api/v1/auth/me')).json().email,
    'check@example.com',
  )
  assert.equal(
    (await request('/api/v1/applications')).json().items.length,
    0,
    'prod must not initialize the development Demo',
  )
  const created = await write('/api/v1/applications', {
    name: 'Production container check',
    allowedOrigins: ['https://demo.localhost'],
  })
  assert.equal(created.status, 201)
  const application = created.json()
  const javascript = "throw new Error('fixture')"
  const sourceMap = JSON.stringify({
    version: 3,
    file: 'a.js',
    sources: ['src/a.ts'],
    names: [],
    mappings: 'AAAA',
    sourcesContent: [javascript],
  })
  const sha = (value) => createHash('sha256').update(value).digest('hex')
  const release = await write('/api/v1/releases', {
    applicationId: application.id,
    releaseName: 'container-check',
    artifacts: [
      {
        artifactPath: '/assets/a.js',
        jsSha256: sha(javascript),
        mapSha256: sha(sourceMap),
      },
    ],
  })
  assert.equal(release.status, 201)
  const releaseId = release.json().release.id
  const form = new FormData()
  form.set('artifactPath', '/assets/a.js')
  form.set('javascript', new Blob([javascript]), 'a.js')
  form.set('sourceMap', new Blob([sourceMap]), 'a.js.map')
  const multipart = new Request('https://localhost/', {
    method: 'POST',
    body: form,
  })
  const uploadCsrf = (await request('/api/v1/auth/csrf')).json()
  const uploaded = await request(
    `/api/v1/releases/${releaseId}/source-maps?applicationId=${application.id}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': multipart.headers.get('Content-Type'),
        [uploadCsrf.headerName]: uploadCsrf.token,
      },
      body: Buffer.from(await multipart.arrayBuffer()),
    },
  )
  assert.equal(uploaded.status, 201)
  assert.equal(
    (
      await write(
        `/api/v1/releases/${releaseId}/finalize?applicationId=${application.id}`,
        undefined,
      )
    ).status,
    200,
  )
  const batch = {
    schemaVersion: 1,
    batchId: randomUUID(),
    appKey: application.appKey,
    sentAt: Date.now(),
    sdk: { name: '@traceflow/web-sdk', version: '0.1.0' },
    events: [
      {
        eventId: randomUUID(),
        type: 'error',
        timestamp: Date.now(),
        sessionId: randomUUID(),
        environment: 'production',
        release: 'container-check',
        page: { url: 'https://demo.localhost/', path: '/' },
        payload: {
          mechanism: 'manual',
          name: 'Error',
          message: 'fixture',
          stack:
            'Error: fixture\n    at fn (https://demo.localhost/assets/a.js:1:1)',
          handled: true,
        },
      },
    ],
  }
  const ingestion = await request('/api/v1/events/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://demo.localhost',
    },
    body: JSON.stringify(batch),
  })
  assert.equal(ingestion.status, 200)
  assert.equal(ingestion.json().accepted, 1)
  const issues = (
    await request(
      `/api/v1/issues?applicationId=${application.id}&release=container-check`,
    )
  ).json()
  const issue = (
    await request(
      `/api/v1/issues/${issues.items[0].id}?applicationId=${application.id}`,
    )
  ).json()
  const stack = await request(
    `/api/v1/events/${issue.latestEvent.id}/stacktrace?applicationId=${application.id}`,
  )
  assert.equal(stack.status, 200)
  assert.equal(stack.json().frames[0].original.filename, 'src/a.ts')
  const serverId = compose('ps', '-q', 'server').trim()
  const runtime = JSON.parse(
    execFileSync('docker', ['inspect', serverId], { encoding: 'utf8' }),
  )[0]
  assert.equal(runtime.HostConfig.Memory, 768 * 1024 * 1024)
  assert.equal(runtime.Config.User, 'traceflow')
  console.log(
    'Production container check passed: fresh migrations, bootstrap login, Secure Cookie, no dev fixtures, ingestion and private Map resolution under the memory limit.',
  )
} catch (error) {
  try {
    console.error(
      compose(
        'logs',
        '--no-color',
        '--tail',
        '40',
        'server',
        'web',
        'mysql',
      ).replaceAll(password, '[redacted]'),
    )
  } catch {
    /* Preserve original failure if Docker is unavailable. */
  }
  throw error
} finally {
  // Only this random test project is removed; existing development/production volumes are untouched.
  console.log(compose('down', '--volumes', '--remove-orphans'))
}
