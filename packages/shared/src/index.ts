export const EVENT_SCHEMA_VERSION = 1 as const

export type EventType = 'page_view' | 'error' | 'http'

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

export type TraceEventV1 = PageViewEventV1 | ErrorEventV1 | HttpEventV1

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
