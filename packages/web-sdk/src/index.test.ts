import { describe, expect, it } from 'vitest'
import { init } from './index'

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
})
