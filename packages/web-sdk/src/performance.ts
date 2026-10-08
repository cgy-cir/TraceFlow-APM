import {
  onCLS,
  onFCP,
  onINP,
  onLCP,
  onTTFB,
  type MetricWithAttribution,
} from 'web-vitals/attribution'
import type {
  NavigationTimingPayloadV1,
  PerformanceEventV1,
  ResourceEventV1,
  TraceEventV1,
  WebVitalAttributionV1,
} from '@traceflow/shared'

export interface PerformanceCaptureOptions {
  endpoint: string
  capturePerformance: boolean
  captureResources: boolean
  performanceSampleRate: number
  resourceSampleRate: number
  maxResourcesPerPage: number
}

type PerformanceBaseEvent = Omit<PerformanceEventV1, 'type' | 'payload'>

export interface PerformanceCaptureHooks {
  createBaseEvent(): PerformanceBaseEvent
  enqueue(event: TraceEventV1): void
  flush(): Promise<void>
  sanitizeUrl(value: string): string
  isCollectorUrl(value: string): boolean
}

interface ResourceTimingLike {
  name: string
  initiatorType: string
  startTime: number
  duration: number
  transferSize: number
  encodedBodySize: number
  decodedBodySize: number
  nextHopProtocol: string
  renderBlockingStatus?: string
}

const RESOURCE_SETTLE_MS = 5_000

export function installPerformanceCapture(
  options: Readonly<PerformanceCaptureOptions>,
  hooks: PerformanceCaptureHooks,
  cleanups: Array<() => void>,
  random: () => number = Math.random,
) {
  const performanceSampled = options.capturePerformance && isSampled(options.performanceSampleRate, random)
  const resourcesSampled = options.captureResources && options.maxResourcesPerPage > 0
    && isSampled(options.resourceSampleRate, random)

  if (performanceSampled) {
    installWebVitals(hooks, cleanups)
    installNavigationTiming(hooks, cleanups)
  }
  if (resourcesSampled) installResourceTiming(options, hooks, cleanups)
}

export function isSampled(rate: number, random: () => number = Math.random) {
  if (rate <= 0) return false
  if (rate >= 1) return true
  return random() < rate
}

function installWebVitals(hooks: PerformanceCaptureHooks, cleanups: Array<() => void>) {
  let active = true
  const measurements = new Set<string>()
  const report = (metric: MetricWithAttribution) => {
    if (!active) return
    const key = `${metric.name}:${metric.id}`
    if (measurements.has(key)) return
    measurements.add(key)
    hooks.enqueue(createWebVitalEvent(metric, hooks))
  }
  const reportOptions = { generateTarget: generateSafeTarget }

  // web-vitals owns its observers for the page lifetime; the active guard makes destroy stop our callbacks.
  safelyRegister(() => onCLS(report, reportOptions))
  safelyRegister(() => onFCP(report, reportOptions))
  safelyRegister(() => onINP(report, reportOptions))
  safelyRegister(() => onLCP(report, reportOptions))
  safelyRegister(() => onTTFB(report, reportOptions))
  cleanups.push(() => {
    active = false
    measurements.clear()
  })
}

function safelyRegister(register: () => void) {
  try {
    register()
  } catch {
    // Unsupported browser APIs must not create recursive SDK errors.
  }
}

export function createWebVitalEvent(
  metric: MetricWithAttribution,
  hooks: Pick<PerformanceCaptureHooks, 'createBaseEvent' | 'sanitizeUrl'>,
): PerformanceEventV1 {
  const base = baseEventForNavigationUrl(hooks.createBaseEvent(), metric.navigationURL, hooks.sanitizeUrl)
  const attribution = createAttribution(metric, hooks.sanitizeUrl)
  return {
    ...base,
    type: 'performance',
    payload: {
      kind: 'web_vital',
      metricName: metric.name,
      measurementId: metric.id.slice(0, 100),
      value: round(metric.value, 4),
      delta: round(metric.delta, 4),
      unit: metric.name === 'CLS' ? 'score' : 'ms',
      rating: metric.rating,
      navigationType: metric.navigationType ?? 'other',
      ...(attribution ? { attribution } : {}),
    },
  }
}

function createAttribution(
  metric: MetricWithAttribution,
  sanitizeUrl: (value: string) => string,
): WebVitalAttributionV1 | undefined {
  let attribution: WebVitalAttributionV1
  switch (metric.name) {
    case 'LCP':
      attribution = {
        target: safeText(metric.attribution.target, 256),
        resourceUrl: metric.attribution.url ? sanitizeUrl(metric.attribution.url).slice(0, 2048) : undefined,
        timeToFirstByte: finiteTiming(metric.attribution.timeToFirstByte),
        resourceLoadDelay: finiteTiming(metric.attribution.resourceLoadDelay),
        resourceLoadDuration: finiteTiming(metric.attribution.resourceLoadDuration),
        elementRenderDelay: finiteTiming(metric.attribution.elementRenderDelay),
      }
      break
    case 'CLS':
      attribution = {
        target: safeText(metric.attribution.largestShiftTarget, 256),
        largestShiftTime: finiteTiming(metric.attribution.largestShiftTime),
        largestShiftValue: finiteTiming(metric.attribution.largestShiftValue, 4),
      }
      break
    case 'INP':
      attribution = {
        target: safeText(metric.attribution.interactionTarget, 256),
        interactionType: safeText(metric.attribution.interactionType, 40),
        inputDelay: finiteTiming(metric.attribution.inputDelay),
        processingDuration: finiteTiming(metric.attribution.processingDuration),
        presentationDelay: finiteTiming(metric.attribution.presentationDelay),
      }
      break
    case 'FCP':
      attribution = { timeToFirstByte: finiteTiming(metric.attribution.timeToFirstByte) }
      break
    case 'TTFB':
      attribution = {}
      break
  }
  return Object.values(attribution).some((value) => value !== undefined) ? attribution : undefined
}

export function generateSafeTarget(node: Node | null) {
  if (typeof Element === 'undefined' || !(node instanceof Element)) return 'unknown'
  const tag = node.tagName.toLowerCase()
  const traceflowName = safeAttribute(node.getAttribute('data-traceflow-name'))
  if (traceflowName) return `${tag}[data-traceflow-name="${traceflowName}"]`.slice(0, 256)
  const role = safeAttribute(node.getAttribute('role'))
  return role ? `${tag}[role="${role}"]`.slice(0, 256) : tag.slice(0, 256)
}

function installNavigationTiming(hooks: PerformanceCaptureHooks, cleanups: Array<() => void>) {
  let timer: number | undefined
  let sent = false
  const capture = () => {
    if (sent) return
    timer = window.setTimeout(() => {
      const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (!entry || sent) return
      sent = true
      hooks.enqueue(createNavigationTimingEvent(entry, hooks.createBaseEvent()))
    })
  }

  if (document.readyState === 'complete') capture()
  else window.addEventListener('load', capture, { once: true })
  cleanups.push(() => {
    window.removeEventListener('load', capture)
    if (timer !== undefined) window.clearTimeout(timer)
  })
}

export function createNavigationTimingEvent(
  entry: Pick<PerformanceNavigationTiming,
    'type' | 'redirectCount' | 'domainLookupStart' | 'domainLookupEnd' | 'connectStart' | 'connectEnd'
    | 'secureConnectionStart' | 'requestStart' | 'responseStart' | 'responseEnd' | 'domInteractive'
    | 'domContentLoadedEventEnd' | 'loadEventEnd' | 'transferSize' | 'encodedBodySize' | 'decodedBodySize'>,
  base: PerformanceBaseEvent,
): PerformanceEventV1 {
  const payload: NavigationTimingPayloadV1 = {
    kind: 'navigation',
    navigationType: normalizeNavigationType(entry.type),
    redirectCount: clampInteger(entry.redirectCount, 100),
    dns: duration(entry.domainLookupEnd, entry.domainLookupStart),
    tcp: duration(entry.connectEnd, entry.connectStart),
    tls: entry.secureConnectionStart > 0 ? duration(entry.connectEnd, entry.secureConnectionStart) : 0,
    request: duration(entry.responseStart, entry.requestStart),
    response: duration(entry.responseEnd, entry.responseStart),
    domInteractive: finiteTiming(entry.domInteractive) ?? 0,
    domContentLoaded: finiteTiming(entry.domContentLoadedEventEnd) ?? 0,
    load: finiteTiming(entry.loadEventEnd) ?? 0,
    transferSize: safeSize(entry.transferSize),
    encodedBodySize: safeSize(entry.encodedBodySize),
    decodedBodySize: safeSize(entry.decodedBodySize),
  }
  return { ...base, type: 'performance', payload }
}

function installResourceTiming(
  options: Readonly<PerformanceCaptureOptions>,
  hooks: PerformanceCaptureHooks,
  cleanups: Array<() => void>,
) {
  const resources = new SlowResourceBuffer(options.maxResourcesPerPage)
  let observer: PerformanceObserver | undefined
  let timer: number | undefined
  let finalized = false

  const collect = (entries: PerformanceEntry[]) => {
    if (finalized) return
    for (const entry of entries) {
      if (entry.entryType !== 'resource') continue
      const resource = entry as PerformanceResourceTiming
      if (hooks.isCollectorUrl(resource.name) || !isHttpUrl(resource.name)) continue
      resources.add(resource)
    }
  }
  const finalize = () => {
    if (finalized) return
    finalized = true
    observer?.disconnect()
    for (const entry of resources.drain()) {
      hooks.enqueue(createResourceTimingEvent(entry, hooks.createBaseEvent(), hooks.sanitizeUrl))
    }
    void hooks.flush()
  }
  const scheduleFinalize = () => {
    if (timer !== undefined || finalized) return
    timer = window.setTimeout(finalize, RESOURCE_SETTLE_MS)
  }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') finalize()
  }

  try {
    observer = new PerformanceObserver((list) => collect(list.getEntries()))
    observer.observe({ type: 'resource', buffered: true })
  } catch {
    return
  }
  if (document.readyState === 'complete') scheduleFinalize()
  else window.addEventListener('load', scheduleFinalize, { once: true })
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', finalize, { once: true })
  cleanups.push(() => {
    observer?.disconnect()
    window.removeEventListener('load', scheduleFinalize)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', finalize)
    if (timer !== undefined) window.clearTimeout(timer)
  })
}

export class SlowResourceBuffer {
  private readonly entries = new Map<string, ResourceTimingLike>()

  constructor(private readonly capacity: number) {}

  add(entry: ResourceTimingLike) {
    if (this.capacity <= 0 || !Number.isFinite(entry.duration) || entry.duration < 0) return
    const key = `${entry.name}\n${entry.startTime}\n${entry.duration}`
    if (this.entries.has(key)) return
    if (this.entries.size >= this.capacity) {
      const fastest = [...this.entries.entries()].reduce((candidate, current) =>
        current[1].duration < candidate[1].duration ? current : candidate)
      if (fastest[1].duration >= entry.duration) return
      this.entries.delete(fastest[0])
    }
    this.entries.set(key, entry)
  }

  drain() {
    const entries = [...this.entries.values()].sort((left, right) => right.duration - left.duration)
    this.entries.clear()
    return entries
  }
}

export function createResourceTimingEvent(
  entry: ResourceTimingLike,
  base: PerformanceBaseEvent,
  sanitizeUrl: (value: string) => string,
): ResourceEventV1 {
  const sizeAvailable = [entry.transferSize, entry.encodedBodySize, entry.decodedBodySize]
    .some((value) => Number.isSafeInteger(value) && value > 0)
  const renderBlockingStatus = entry.renderBlockingStatus === 'blocking'
    || entry.renderBlockingStatus === 'non-blocking' ? entry.renderBlockingStatus : undefined
  const sizes = sizeAvailable ? {
    transferSize: safeSize(entry.transferSize),
    encodedBodySize: safeSize(entry.encodedBodySize),
    decodedBodySize: safeSize(entry.decodedBodySize),
  } : {}
  return {
    ...base,
    type: 'resource',
    payload: {
      url: sanitizeUrl(entry.name).slice(0, 2048),
      initiatorType: (entry.initiatorType || 'other').slice(0, 40),
      startTime: finiteTiming(entry.startTime) ?? 0,
      duration: finiteTiming(entry.duration) ?? 0,
      ...sizes,
      sizeAvailable,
      ...(safeText(entry.nextHopProtocol, 40) ? {
        nextHopProtocol: safeText(entry.nextHopProtocol, 40),
      } : {}),
      ...(renderBlockingStatus ? { renderBlockingStatus } : {}),
    },
  }
}

function baseEventForNavigationUrl(
  base: PerformanceBaseEvent,
  navigationUrl: string | undefined,
  sanitizeUrl: (value: string) => string,
) {
  if (!navigationUrl) return base
  try {
    const url = new URL(navigationUrl, location.href)
    return { ...base, page: { ...base.page, url: sanitizeUrl(url.href), path: url.pathname } }
  } catch {
    return base
  }
}

function normalizeNavigationType(type: PerformanceNavigationTiming['type']): NavigationTimingPayloadV1['navigationType'] {
  if (type === 'back_forward') return 'back-forward'
  if (type === 'navigate' || type === 'reload' || type === 'prerender') return type
  return 'other'
}

function duration(end: number, start: number) {
  return finiteTiming(Math.max(0, end - start)) ?? 0
}

function finiteTiming(value: number | undefined, digits = 3) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? round(value, digits) : undefined
}

function safeSize(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function clampInteger(value: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(0, Math.trunc(value))) : 0
}

function round(value: number, digits: number) {
  return Number(value.toFixed(digits))
}

function safeText(value: string | undefined, max: number) {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return normalized ? normalized.slice(0, max) : undefined
}

function safeAttribute(value: string | null) {
  return value?.replace(/[\u0000-\u001f\u007f"\\]/g, '').trim().slice(0, 200) || undefined
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value, location.href)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
