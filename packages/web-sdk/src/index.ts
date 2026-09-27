import { EVENT_SCHEMA_VERSION, type EventBatchV1 } from '@traceflow/shared'

export interface TraceFlowOptions {
  appKey: string
  endpoint: string
  environment?: string
  release?: string
}

export interface TraceFlowClient {
  readonly options: Readonly<TraceFlowOptions>
  readonly schemaVersion: typeof EVENT_SCHEMA_VERSION
  createEmptyBatch(): EventBatchV1
}

export function init(options: TraceFlowOptions): TraceFlowClient {
  if (!options.appKey.trim()) {
    throw new Error('TraceFlow appKey is required')
  }

  if (!options.endpoint.trim()) {
    throw new Error('TraceFlow endpoint is required')
  }

  const normalizedOptions = Object.freeze({ ...options })

  return {
    options: normalizedOptions,
    schemaVersion: EVENT_SCHEMA_VERSION,
    createEmptyBatch() {
      return {
        schemaVersion: EVENT_SCHEMA_VERSION,
        batchId: crypto.randomUUID(),
        appKey: normalizedOptions.appKey,
        sentAt: Date.now(),
        sdk: {
          name: '@traceflow/web-sdk',
          version: '0.1.0',
        },
        events: [],
      }
    },
  }
}

export type {
  ErrorEventV1,
  EventBatchResponseV1,
  EventBatchV1,
  HttpEventV1,
  PageViewEventV1,
  TraceEventV1,
} from '@traceflow/shared'
