import { afterEach, describe, expect, it, vi } from 'vitest'
import { init } from './index'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('init', () => {
  it('creates a protocol v1 batch for the configured application', () => {
    const client = init({
      appKey: 'tf_app_demo_web',
      endpoint: 'http://localhost:8080/api/v1/events/batch',
    })

    const batch = client.createEmptyBatch()

    expect(batch.schemaVersion).toBe(1)
    expect(batch.appKey).toBe('tf_app_demo_web')
    expect(batch.events).toEqual([])
  })

  it('requires an app key and endpoint', () => {
    expect(() => init({ appKey: '', endpoint: '/api/v1/events/batch' })).toThrow(
      'TraceFlow appKey is required',
    )
  })

  it('attaches a defensive breadcrumb snapshot to an error event', async () => {
    const fetchMock = installBrowser()
    const client = init({
      appKey: 'tf_app_demo_web',
      endpoint: 'http://localhost:8080/api/v1/events/batch',
      autoCapture: false,
    })

    const data = { step: 'checkout' }
    client.addBreadcrumb({ category: 'custom', level: 'info', message: 'Submit order', data })
    client.captureException(new Error('Checkout failed'))
    data.step = 'changed after capture'
    await client.flush()

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.events[0].breadcrumbs).toEqual([expect.objectContaining({
      category: 'custom',
      message: 'Submit order',
      data: { step: 'checkout' },
    })])
    client.destroy()
  })

  it('keeps the in-memory queue within its configured limit', async () => {
    const fetchMock = installBrowser()
    const client = init({
      appKey: 'tf_app_demo_web',
      endpoint: 'http://localhost:8080/api/v1/events/batch',
      autoCapture: false,
      maxQueueSize: 2,
    })

    client.captureException(new Error('first'))
    client.captureException(new Error('second'))
    client.captureException(new Error('third'))
    await client.flush()

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.events.map((event: { payload: { message: string } }) => event.payload.message)).toEqual([
      'second',
      'third',
    ])
    client.destroy()
  })
})

function installBrowser() {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
  const location = {
    href: 'http://localhost:5174/checkout',
    origin: 'http://localhost:5174',
    pathname: '/checkout',
    search: '',
  }
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
    JSON.stringify({ accepted: 1 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ))
  vi.stubGlobal('location', location)
  vi.stubGlobal('document', { title: 'Checkout', referrer: '' })
  vi.stubGlobal('navigator', { userAgent: 'Vitest', language: 'en', sendBeacon: vi.fn() })
  vi.stubGlobal('window', {
    fetch: fetchMock,
    location,
    screen: { width: 1920, height: 1080 },
    innerWidth: 1280,
    innerHeight: 720,
    sessionStorage: storage,
    localStorage: storage,
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  return fetchMock
}
