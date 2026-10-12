import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ensureDemoApplication, waitForDemoReady } from './production-demo.mjs'
import { withUploadSession } from './upload-source-maps.mjs'

const origin = 'https://demo.revengedog.online'

test('monitoring page readiness waits for rendered UI, not global network idle', async () => {
  const calls = []
  const page = {
    goto: async (url, options) => { calls.push({ url, options }) },
    getByRole: (role, options) => {
      assert.equal(role, 'heading')
      assert.equal(options.name, '监控事件实验台')
      return { waitFor: async (options) => assert.equal(options.state, 'visible') }
    },
  }
  await waitForDemoReady(page, origin)
  assert.equal(calls[0].url, origin)
  assert.equal(calls[0].options.waitUntil, 'domcontentloaded')
})
const application = {
  id: 7,
  name: 'Demo Web',
  appKey: `tf_app_${'a'.repeat(32)}`,
  allowedOrigins: [origin],
  status: 'active',
}
function api(items) {
  const writes = []
  return {
    writes,
    fetchSession: async () => Response.json({ items }),
    write: async (...args) => {
      writes.push(args)
      return Response.json(application)
    },
  }
}

test('fresh production creates an application with the exact Demo origin, never a dev key', async () => {
  const client = api([])
  assert.deepEqual(await ensureDemoApplication(client, origin), application)
  assert.equal(client.writes.length, 1)
  assert.deepEqual(JSON.parse(client.writes[0][1].body), {
    name: 'Demo Web',
    allowedOrigins: [origin],
  })
  assert.equal(client.writes[0][2], 1)
})

test('reuse is scoped by explicit ID or unambiguous name and validates production configuration', async () => {
  const client = api([application])
  assert.deepEqual(
    await ensureDemoApplication(client, origin, '7'),
    application,
  )
  assert.equal(client.writes.length, 0)
  await assert.rejects(
    ensureDemoApplication(client, origin, '8'),
    /does not exist/,
  )
  await assert.rejects(ensureDemoApplication(client, origin, '0'), /Invalid/)
  await assert.rejects(
    ensureDemoApplication(client, origin + '/path'),
    /origin/,
  )
  await assert.rejects(
    ensureDemoApplication(
      api([application, { ...application, id: 8 }]),
      origin,
    ),
    /Multiple/,
  )
  for (const patch of [
    { status: 'inactive' },
    { appKey: 'tf_app_demo_web' },
    { allowedOrigins: [] },
  ]) {
    await assert.rejects(
      ensureDemoApplication(api([{ ...application, ...patch }]), origin),
      /must be active/,
    )
  }
})

test('shared upload session retains cookies, renews CSRF after login and logs out on action failure', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init })
    if (url.endsWith('/auth/csrf'))
      return Response.json(
        { headerName: 'X-CSRF-TOKEN', token: `token-${calls.length}` },
        {
          headers: {
            'Set-Cookie': 'JSESSIONID=session; Path=/; Secure; HttpOnly',
          },
        },
      )
    return Response.json({ role: 'admin' })
  })
  await assert.rejects(
    withUploadSession(
      async ({ write }) => {
        await write('/applications', { method: 'POST', body: '{}' }, 1)
        throw new Error('action failed')
      },
      {
        TRACEFLOW_API_BASE: 'https://apm.example/api/v1',
        TRACEFLOW_UPLOAD_EMAIL: 'fixture@example.com',
        TRACEFLOW_UPLOAD_PASSWORD: 'fixture-only',
      },
    ),
    /action failed/,
  )
  assert.deepEqual(
    calls.map((call) => new URL(call.url).pathname),
    [
      '/api/v1/auth/csrf',
      '/api/v1/auth/login',
      '/api/v1/auth/csrf',
      '/api/v1/applications',
      '/api/v1/auth/csrf',
      '/api/v1/auth/logout',
    ],
  )
  assert.equal(calls[3].init.headers.get('Cookie'), 'JSESSIONID=session')
  assert.notEqual(
    calls[1].init.headers.get('X-CSRF-TOKEN'),
    calls[3].init.headers.get('X-CSRF-TOKEN'),
  )
})

test('upload credentials never travel over remote plain HTTP', async () => {
  await assert.rejects(
    withUploadSession(() => assert.fail('Must not log in'), {
      TRACEFLOW_API_BASE: 'http://apm.example/api/v1',
      TRACEFLOW_UPLOAD_EMAIL: 'fixture@example.com',
      TRACEFLOW_UPLOAD_PASSWORD: 'fixture-only',
    }),
    /requires HTTPS/,
  )
})
