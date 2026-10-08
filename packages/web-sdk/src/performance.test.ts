import { describe, expect, it, vi } from 'vitest'
import type { MetricWithAttribution } from 'web-vitals/attribution'
import type { PerformanceEventV1 } from '@traceflow/shared'
import {
  SlowResourceBuffer,
  createNavigationTimingEvent,
  createResourceTimingEvent,
  createWebVitalEvent,
  generateSafeTarget,
  isSampled,
} from './performance'

const baseEvent = (): Omit<PerformanceEventV1, 'type' | 'payload'> => ({
  eventId: '58fcf769-d55a-4df5-b0b9-733f87f35f99',
  timestamp: 1_791_234_567_000,
  sessionId: 'a2e10c1f-7f08-4819-a430-fb7c9c5ed7b3',
  environment: 'test',
  page: { url: 'https://demo.example.com/orders', path: '/orders' },
})

describe('performance sampling', () => {
  it('keeps page-level sampling deterministic at boundary rates', () => {
    const random = vi.fn(() => 0.4)

    expect(isSampled(0, random)).toBe(false)
    expect(isSampled(1, random)).toBe(true)
    expect(isSampled(0.5, random)).toBe(true)
    expect(isSampled(0.2, random)).toBe(false)
    expect(random).toHaveBeenCalledTimes(2)
  })
})

describe('Web Vitals mapping', () => {
  it('maps LCP and keeps only the protocol attribution fields', () => {
    const metric = {
      name: 'LCP',
      id: 'v6-123',
      value: 2384.72456,
      delta: 2384.72456,
      rating: 'good',
      navigationType: 'navigate',
      entries: [],
      navigationId: 1,
      attribution: {
        target: 'img[data-traceflow-name="hero"]',
        url: 'https://cdn.example.com/hero.webp?token=secret',
        timeToFirstByte: 182.3456,
        resourceLoadDelay: 41.2345,
        resourceLoadDuration: 812.4567,
        elementRenderDelay: 119.8765,
        navigationEntry: { serverTiming: [{ description: 'must-not-leak' }] },
      },
    } as unknown as MetricWithAttribution

    const event = createWebVitalEvent(metric, {
      createBaseEvent: baseEvent,
      sanitizeUrl: (value) => value.replace('token=secret', 'token=%5BFiltered%5D'),
    })

    expect(event.payload).toMatchObject({
      metricName: 'LCP',
      measurementId: 'v6-123',
      value: 2384.7246,
      unit: 'ms',
      rating: 'good',
      attribution: {
        resourceUrl: 'https://cdn.example.com/hero.webp?token=%5BFiltered%5D',
        timeToFirstByte: 182.346,
      },
    })
    expect(JSON.stringify(event)).not.toContain('serverTiming')
  })

  it('uses score for CLS and does not invent attribution for TTFB', () => {
    const cls = createWebVitalEvent({
      name: 'CLS', id: 'cls-1', value: 0.1, delta: 0.1, rating: 'good',
      navigationType: 'reload', entries: [], navigationId: 1,
      attribution: { largestShiftValue: 0.05 },
    } as unknown as MetricWithAttribution, { createBaseEvent: baseEvent, sanitizeUrl: String })
    const ttfb = createWebVitalEvent({
      name: 'TTFB', id: 'ttfb-1', value: 300, delta: 300, rating: 'good',
      navigationType: 'navigate', entries: [], navigationId: 1,
      attribution: { requestDuration: 200 },
    } as unknown as MetricWithAttribution, { createBaseEvent: baseEvent, sanitizeUrl: String })

    expect(cls.payload).toMatchObject({ unit: 'score', attribution: { largestShiftValue: 0.05 } })
    expect(ttfb.payload).not.toHaveProperty('attribution')
    expect(generateSafeTarget(null)).toBe('unknown')
  })
})

describe('Navigation Timing mapping', () => {
  it('calculates phases, normalizes back-forward, and clamps invalid durations', () => {
    const event = createNavigationTimingEvent({
      type: 'back_forward',
      redirectCount: 2,
      domainLookupStart: 10,
      domainLookupEnd: 14.2345,
      connectStart: 14,
      connectEnd: 25,
      secureConnectionStart: 18,
      requestStart: 30,
      responseStart: 80,
      responseEnd: 75,
      domInteractive: 200,
      domContentLoadedEventEnd: 250,
      loadEventEnd: 300,
      transferSize: 1200,
      encodedBodySize: 1000,
      decodedBodySize: 3000,
    }, baseEvent())

    expect(event.payload).toEqual({
      kind: 'navigation',
      navigationType: 'back-forward',
      redirectCount: 2,
      dns: 4.235,
      tcp: 11,
      tls: 7,
      request: 50,
      response: 0,
      domInteractive: 200,
      domContentLoaded: 250,
      load: 300,
      transferSize: 1200,
      encodedBodySize: 1000,
      decodedBodySize: 3000,
    })
  })
})

describe('Resource Timing collection', () => {
  const resource = (name: string, duration: number, startTime = 1) => ({
    name,
    initiatorType: 'script',
    startTime,
    duration,
    transferSize: 0,
    encodedBodySize: 0,
    decodedBodySize: 0,
    nextHopProtocol: 'h2',
  })

  it('deduplicates entries and retains only the slowest resources', () => {
    const buffer = new SlowResourceBuffer(2)
    buffer.add(resource('https://cdn.example.com/fast.js', 10))
    buffer.add(resource('https://cdn.example.com/slow.js', 100))
    buffer.add(resource('https://cdn.example.com/medium.js', 50))
    buffer.add(resource('https://cdn.example.com/slow.js', 100))

    expect(buffer.drain().map(({ name }) => name)).toEqual([
      'https://cdn.example.com/slow.js',
      'https://cdn.example.com/medium.js',
    ])
    expect(buffer.drain()).toEqual([])
  })

  it('marks unavailable cross-origin sizes and sanitizes the URL', () => {
    const event = createResourceTimingEvent(
      resource('https://cdn.example.com/app.js?access_token=secret', 42.1236),
      baseEvent(),
      (value) => value.replace('access_token=secret', 'access_token=%5BFiltered%5D'),
    )

    expect(event.payload).toMatchObject({
      url: 'https://cdn.example.com/app.js?access_token=%5BFiltered%5D',
      duration: 42.124,
      sizeAvailable: false,
      nextHopProtocol: 'h2',
    })
    expect(event.payload).not.toHaveProperty('transferSize')
  })
})
