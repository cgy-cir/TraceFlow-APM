import {
  EVENT_SCHEMA_VERSION,
  type ErrorEventV1,
  type EventBatchResponseV1,
  type EventBatchV1,
  type HttpEventV1,
  type PageViewEventV1,
  type TraceEventV1,
} from '@traceflow/shared'

export interface TraceFlowOptions {
  appKey: string
  endpoint: string
  environment?: string
  release?: string
  autoCapture?: boolean
  flushInterval?: number
  maxBatchSize?: number
}

export interface TraceFlowClient {
  readonly options: Readonly<TraceFlowOptions>
  readonly schemaVersion: typeof EVENT_SCHEMA_VERSION
  createEmptyBatch(events?: TraceEventV1[]): EventBatchV1
  captureException(error: unknown, mechanism?: ErrorEventV1['payload']['mechanism']): string
  capturePageView(navigationType?: PageViewEventV1['payload']['navigationType'], from?: string): string
  flush(): Promise<void>
  destroy(): void
}

interface QueueEntry {
  event: TraceEventV1
  attempts: number
}

interface XhrMetadata {
  method: string
  url: string
  startedAt: number
}

const SDK_NAME = '@traceflow/web-sdk' as const
const SDK_VERSION = '0.1.0'
const SENSITIVE_QUERY_KEYS = new Set([
  'token', 'access_token', 'code', 'password', 'secret', 'authorization', 'session',
])

export function init(options: TraceFlowOptions): TraceFlowClient {
  if (!options.appKey.trim()) throw new Error('TraceFlow appKey is required')
  if (!options.endpoint.trim()) throw new Error('TraceFlow endpoint is required')

  const normalizedOptions = Object.freeze({
    environment: 'development',
    autoCapture: true,
    flushInterval: 2_000,
    maxBatchSize: 10,
    ...options,
  })
  const queue: QueueEntry[] = []
  const cleanups: Array<() => void> = []
  const browser = typeof window !== 'undefined'
  const nativeFetch = browser ? window.fetch.bind(window) : undefined
  let flushPromise: Promise<void> | undefined
  let destroyed = false
  let lastPageView = { to: '', timestamp: 0 }

  const client: TraceFlowClient = {
    options: normalizedOptions,
    schemaVersion: EVENT_SCHEMA_VERSION,
    createEmptyBatch(events = []) {
      return {
        schemaVersion: EVENT_SCHEMA_VERSION,
        batchId: randomId(),
        appKey: normalizedOptions.appKey,
        sentAt: Date.now(),
        sdk: { name: SDK_NAME, version: SDK_VERSION },
        events,
      }
    },
    captureException(error, mechanism = 'manual') {
      const normalized = normalizeError(error)
      const event: ErrorEventV1 = {
        ...createBaseEvent(normalizedOptions),
        type: 'error',
        payload: {
          mechanism,
          name: normalized.name,
          message: normalized.message,
          stack: normalized.stack,
          filename: normalized.filename,
          lineno: normalized.lineno,
          colno: normalized.colno,
          handled: mechanism === 'manual',
        },
      }
      enqueue(event)
      return event.eventId
    },
    capturePageView(navigationType = 'initial', from) {
      const to = browser ? `${window.location.pathname}${window.location.search}` : '/'
      const now = Date.now()
      if (lastPageView.to === to && now - lastPageView.timestamp < 300) return ''
      lastPageView = { to, timestamp: now }
      const event: PageViewEventV1 = {
        ...createBaseEvent(normalizedOptions),
        type: 'page_view',
        payload: { navigationType, from, to: sanitizeUrl(to) },
      }
      enqueue(event)
      return event.eventId
    },
    async flush() {
      if (flushPromise) return flushPromise
      flushPromise = sendNextBatch().finally(() => {
        flushPromise = undefined
        if (queue.length >= normalizedOptions.maxBatchSize) void client.flush()
      })
      return flushPromise
    },
    destroy() {
      destroyed = true
      cleanups.splice(0).forEach((cleanup) => cleanup())
      void client.flush()
    },
  }

  function enqueue(event: TraceEventV1) {
    if (destroyed) return
    queue.push({ event, attempts: 0 })
    if (queue.length >= normalizedOptions.maxBatchSize) void client.flush()
  }

  async function sendNextBatch() {
    if (!nativeFetch || queue.length === 0) return
    const entries = queue.splice(0, normalizedOptions.maxBatchSize)
    const batch = client.createEmptyBatch(entries.map(({ event }) => event))
    try {
      const response = await nativeFetch(normalizedOptions.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        keepalive: true,
      })
      if (!response.ok) {
        if (response.status >= 500 || response.status === 429) requeue(entries)
        return
      }
      await response.json() as EventBatchResponseV1
    } catch {
      requeue(entries)
    }
  }

  function requeue(entries: QueueEntry[]) {
    const retryable = entries
      .filter(({ attempts }) => attempts < 2)
      .map((entry) => ({ ...entry, attempts: entry.attempts + 1 }))
    queue.unshift(...retryable)
    if (retryable.length > 0 && !destroyed) window.setTimeout(() => void client.flush(), 1_000)
  }

  if (browser) {
    const intervalId = window.setInterval(() => void client.flush(), normalizedOptions.flushInterval)
    cleanups.push(() => window.clearInterval(intervalId))
    if (normalizedOptions.autoCapture) {
      installErrorCapture(client, cleanups)
      installFetchCapture(normalizedOptions, enqueue, cleanups)
      installXhrCapture(normalizedOptions, enqueue, cleanups)
      installNavigationCapture(client, cleanups)
      client.capturePageView('initial')
    }
    const pageHide = () => flushWithBeacon(normalizedOptions, queue, client)
    window.addEventListener('pagehide', pageHide)
    cleanups.push(() => window.removeEventListener('pagehide', pageHide))
  }

  return client
}

function installErrorCapture(client: TraceFlowClient, cleanups: Array<() => void>) {
  const onError = (event: ErrorEvent) => {
    if (event.error) {
      client.captureException(event.error, 'onerror')
      return
    }
    client.captureException({
      name: 'ResourceError',
      message: `Failed to load resource: ${event.filename || 'unknown'}`,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    }, 'resource')
  }
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    client.captureException(event.reason, 'unhandledrejection')
  }
  window.addEventListener('error', onError, true)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  cleanups.push(() => window.removeEventListener('error', onError, true))
  cleanups.push(() => window.removeEventListener('unhandledrejection', onUnhandledRejection))
}

function installFetchCapture(options: Readonly<RequiredTransportOptions>, enqueue: (event: TraceEventV1) => void,
                             cleanups: Array<() => void>) {
  const originalFetch = window.fetch
  window.fetch = async (...args) => {
    const request = args[0]
    const init = args[1]
    const url = request instanceof Request ? request.url : String(request)
    if (isCollectorUrl(url, options.endpoint)) return originalFetch(...args)
    const method = (init?.method || (request instanceof Request ? request.method : 'GET')).toUpperCase()
    const startedAt = performance.now()
    try {
      const response = await originalFetch(...args)
      enqueue(createHttpEvent(options, 'fetch', method, url, response.status, performance.now() - startedAt,
        response.status >= 200 && response.status < 400 ? 'success' : 'failure'))
      return response
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError'
      enqueue(createHttpEvent(options, 'fetch', method, url, undefined, performance.now() - startedAt,
        aborted ? 'aborted' : 'failure', normalizeError(error).message))
      throw error
    }
  }
  cleanups.push(() => { window.fetch = originalFetch })
}

function installXhrCapture(options: Readonly<RequiredTransportOptions>, enqueue: (event: TraceEventV1) => void,
                           cleanups: Array<() => void>) {
  const metadata = new WeakMap<XMLHttpRequest, XhrMetadata>()
  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: Parameters<XMLHttpRequest['open']>) {
    metadata.set(this, { method: String(args[0]).toUpperCase(), url: String(args[1]), startedAt: 0 })
    return originalOpen.apply(this, args)
  } as XMLHttpRequest['open']
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: Parameters<XMLHttpRequest['send']>) {
    const current = metadata.get(this)
    if (current && !isCollectorUrl(current.url, options.endpoint)) {
      current.startedAt = performance.now()
      this.addEventListener('loadend', () => {
        const outcome = this.status === 0 ? 'failure' : this.status < 400 ? 'success' : 'failure'
        enqueue(createHttpEvent(options, 'xhr', current.method, current.url, this.status || undefined,
          performance.now() - current.startedAt, outcome))
      }, { once: true })
    }
    return originalSend.apply(this, args)
  }
  cleanups.push(() => { XMLHttpRequest.prototype.open = originalOpen })
  cleanups.push(() => { XMLHttpRequest.prototype.send = originalSend })
}

function installNavigationCapture(client: TraceFlowClient, cleanups: Array<() => void>) {
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState
  history.pushState = function (...args) {
    const from = `${location.pathname}${location.search}`
    const result = originalPushState.apply(this, args)
    queueMicrotask(() => client.capturePageView('push', from))
    return result
  }
  history.replaceState = function (...args) {
    const from = `${location.pathname}${location.search}`
    const result = originalReplaceState.apply(this, args)
    queueMicrotask(() => client.capturePageView('replace', from))
    return result
  }
  const onPopState = () => client.capturePageView('pop')
  window.addEventListener('popstate', onPopState)
  cleanups.push(() => { history.pushState = originalPushState })
  cleanups.push(() => { history.replaceState = originalReplaceState })
  cleanups.push(() => window.removeEventListener('popstate', onPopState))
}

type RequiredTransportOptions = Pick<TraceFlowOptions, 'endpoint' | 'environment' | 'release'>

function createHttpEvent(
  options: Readonly<RequiredTransportOptions>,
  transport: 'fetch' | 'xhr', method: string, url: string, status: number | undefined,
  duration: number, outcome: 'success' | 'failure' | 'aborted', errorMessage?: string,
): HttpEventV1 {
  return {
    ...createBaseEvent(options),
    type: 'http',
    payload: {
      transport,
      method: method.slice(0, 16),
      url: sanitizeUrl(url),
      status,
      duration: Math.max(0, Number(duration.toFixed(3))),
      outcome,
      errorMessage,
    },
  }
}

function createBaseEvent(options: Pick<TraceFlowOptions, 'environment' | 'release'>) {
  const pageUrl = typeof location === 'undefined' ? 'http://localhost/' : sanitizeUrl(location.href)
  return {
    eventId: randomId(),
    timestamp: Date.now(),
    sessionId: persistentId('traceflow_session_id', true),
    anonymousId: persistentId('traceflow_anonymous_id', false),
    environment: options.environment || 'development',
    release: options.release,
    page: {
      url: pageUrl,
      path: typeof location === 'undefined' ? '/' : location.pathname,
      title: typeof document === 'undefined' ? undefined : document.title,
      referrer: typeof document === 'undefined' || !document.referrer ? undefined : sanitizeUrl(document.referrer),
    },
    device: typeof navigator === 'undefined' ? undefined : {
      userAgent: navigator.userAgent,
      language: navigator.language,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    },
  }
}

function persistentId(key: string, session: boolean) {
  if (typeof window === 'undefined') return randomId()
  try {
    const storage = session ? window.sessionStorage : window.localStorage
    const existing = storage.getItem(key)
    if (existing) return existing
    const created = randomId()
    storage.setItem(key, created)
    return created
  } catch {
    return randomId()
  }
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name || 'Error', message: error.message || String(error), stack: error.stack }
  }
  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>
    return {
      name: String(candidate.name || 'Error'),
      message: String(candidate.message || safeStringify(error)),
      stack: typeof candidate.stack === 'string' ? candidate.stack : undefined,
      filename: typeof candidate.filename === 'string' ? candidate.filename : undefined,
      lineno: typeof candidate.lineno === 'number' ? candidate.lineno : undefined,
      colno: typeof candidate.colno === 'number' ? candidate.colno : undefined,
    }
  }
  return { name: 'Error', message: typeof error === 'string' ? error : safeStringify(error), stack: undefined }
}

function safeStringify(value: unknown) {
  try { return JSON.stringify(value) ?? String(value) } catch { return String(value) }
}

function sanitizeUrl(value: string) {
  try {
    const base = typeof location === 'undefined' ? 'http://localhost' : location.origin
    const url = new URL(value, base)
    url.username = ''
    url.password = ''
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.set(key, '[Filtered]')
    }
    return url.origin === base && !/^https?:/i.test(value) ? `${url.pathname}${url.search}${url.hash}` : url.toString()
  } catch {
    return value.slice(0, 2048)
  }
}

function isCollectorUrl(value: string, endpoint: string) {
  try {
    const base = location.href
    return new URL(value, base).href === new URL(endpoint, base).href
  } catch {
    return value === endpoint
  }
}

function flushWithBeacon(options: Readonly<TraceFlowOptions>, queue: QueueEntry[], client: TraceFlowClient) {
  if (queue.length === 0 || !navigator.sendBeacon) return
  const entries = queue.splice(0, options.maxBatchSize || 10)
  const body = JSON.stringify(client.createEmptyBatch(entries.map(({ event }) => event)))
  const accepted = navigator.sendBeacon(options.endpoint, new Blob([body], { type: 'text/plain;charset=UTF-8' }))
  if (!accepted) queue.unshift(...entries)
}

function randomId() {
  return crypto.randomUUID()
}

export type {
  ErrorEventV1,
  EventBatchResponseV1,
  EventBatchV1,
  HttpEventV1,
  PageViewEventV1,
  TraceEventV1,
} from '@traceflow/shared'
