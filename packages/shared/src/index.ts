export const EVENT_SCHEMA_VERSION = 1 as const

export type EventType = 'page_view' | 'error' | 'http' | 'performance' | 'resource'

export interface SdkContext {
  name: '@traceflow/web-sdk'
  version: string
}

export interface PageContext {
  url: string
  path: string
  title?: string
  referrer?: string
}

export interface UserContext {
  id: string
}

export interface DeviceContext {
  userAgent?: string
  language?: string
  screenWidth?: number
  screenHeight?: number
  viewportWidth?: number
  viewportHeight?: number
}

export interface Breadcrumb {
  timestamp: number
  category: 'navigation' | 'ui.click' | 'http' | 'console' | 'custom'
  level: 'debug' | 'info' | 'warning' | 'error'
  message?: string
  data?: Record<string, string | number | boolean | null>
}

interface TraceEventBaseV1 {
  eventId: string
  timestamp: number
  sessionId: string
  anonymousId?: string
  environment: string
  release?: string
  traceId?: string
  page: PageContext
  user?: UserContext
  device?: DeviceContext
  tags?: Record<string, string>
  breadcrumbs?: Breadcrumb[]
}

export interface PageViewEventV1 extends TraceEventBaseV1 {
  type: 'page_view'
  payload: {
    navigationType: 'initial' | 'push' | 'replace' | 'pop'
    from?: string
    to: string
  }
}

export interface ErrorEventV1 extends TraceEventBaseV1 {
  type: 'error'
  payload: {
    mechanism: 'onerror' | 'unhandledrejection' | 'resource' | 'manual'
    name: string
    message: string
    stack?: string
    filename?: string
    lineno?: number
    colno?: number
    handled: boolean
    resourceType?: string
  }
}

export interface HttpEventV1 extends TraceEventBaseV1 {
  type: 'http'
  payload: {
    transport: 'fetch' | 'xhr'
    method: string
    url: string
    status?: number
    duration: number
    outcome: 'success' | 'failure' | 'aborted'
    errorMessage?: string
    requestSize?: number
    responseSize?: number
  }
}

export type WebVitalName = 'LCP' | 'CLS' | 'INP' | 'FCP' | 'TTFB'

export type MetricRating = 'good' | 'needs-improvement' | 'poor'

export type WebVitalNavigationType =
  | 'navigate'
  | 'reload'
  | 'back-forward'
  | 'back-forward-cache'
  | 'prerender'
  | 'restore'
  | 'soft-navigation'
  | 'other'

export interface WebVitalAttributionV1 {
  target?: string
  resourceUrl?: string
  interactionType?: string
  timeToFirstByte?: number
  resourceLoadDelay?: number
  resourceLoadDuration?: number
  elementRenderDelay?: number
  largestShiftTime?: number
  largestShiftValue?: number
  inputDelay?: number
  processingDuration?: number
  presentationDelay?: number
}

export interface WebVitalPayloadV1 {
  kind: 'web_vital'
  metricName: WebVitalName
  measurementId: string
  value: number
  delta: number
  unit: 'ms' | 'score'
  rating: MetricRating
  navigationType: WebVitalNavigationType
  attribution?: WebVitalAttributionV1
}

export type DocumentNavigationType = 'navigate' | 'reload' | 'back-forward' | 'prerender' | 'other'

export interface NavigationTimingPayloadV1 {
  kind: 'navigation'
  navigationType: DocumentNavigationType
  redirectCount: number
  dns: number
  tcp: number
  tls: number
  request: number
  response: number
  domInteractive: number
  domContentLoaded: number
  load: number
  transferSize?: number
  encodedBodySize?: number
  decodedBodySize?: number
}

export interface PerformanceEventV1 extends TraceEventBaseV1 {
  type: 'performance'
  payload: WebVitalPayloadV1 | NavigationTimingPayloadV1
  breadcrumbs?: never
}

export interface ResourceEventV1 extends TraceEventBaseV1 {
  type: 'resource'
  payload: {
    url: string
    initiatorType: string
    startTime: number
    duration: number
    transferSize?: number
    encodedBodySize?: number
    decodedBodySize?: number
    sizeAvailable: boolean
    nextHopProtocol?: string
    renderBlockingStatus?: 'blocking' | 'non-blocking'
  }
  breadcrumbs?: never
}

export type TraceEventV1 =
  | PageViewEventV1
  | ErrorEventV1
  | HttpEventV1
  | PerformanceEventV1
  | ResourceEventV1

export interface EventBatchV1 {
  schemaVersion: typeof EVENT_SCHEMA_VERSION
  batchId: string
  appKey: string
  sentAt: number
  sdk: SdkContext
  events: TraceEventV1[]
}

export type EventRejectionCode =
  | 'UNSUPPORTED_SCHEMA'
  | 'INVALID_EVENT_ID'
  | 'DUPLICATE_EVENT'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TYPE'
  | 'INVALID_PAYLOAD'
  | 'EVENT_TOO_LARGE'
  | 'RATE_LIMITED'

export interface EventRejection {
  index: number
  eventId?: string
  code: EventRejectionCode
  message: string
}

export interface EventBatchResponseV1 {
  requestId: string
  accepted: number
  rejected: number
  errors: EventRejection[]
}
