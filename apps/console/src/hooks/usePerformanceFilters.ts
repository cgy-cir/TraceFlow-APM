import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { PerformanceFilters } from '../api/client'

const MINUTE_MS = 60_000
export const RANGE_MS = { '24h': 24 * 60 * MINUTE_MS, '7d': 7 * 24 * 60 * MINUTE_MS, '30d': 30 * 24 * 60 * MINUTE_MS }

export function usePerformanceFilters() {
  const [searchParams, setSearchParams] = useSearchParams()
  const fallbackTo = Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS
  const to = timestamp(searchParams.get('to')) ?? fallbackTo
  const from = timestamp(searchParams.get('from')) ?? to - RANGE_MS['24h']
  const filters: PerformanceFilters = {
    from,
    to,
    environment: searchParams.get('environment') || undefined,
    release: searchParams.get('release') || undefined,
    pagePath: searchParams.get('pagePath') || undefined,
    deviceType: asDeviceType(searchParams.get('deviceType')),
  }

  // React vs Vue: URL 参数不是可变的响应式对象；通过 effect 补齐默认值，并始终提交新的 URLSearchParams。
  useEffect(() => {
    if (searchParams.has('from') && searchParams.has('to')) return
    const next = new URLSearchParams(searchParams)
    next.set('from', String(from))
    next.set('to', String(to))
    setSearchParams(next, { replace: true })
  }, [from, searchParams, setSearchParams, to])

  const update = (values: Partial<Record<keyof PerformanceFilters, string | number | undefined>>) => {
    const next = new URLSearchParams(searchParams)
    Object.entries(values).forEach(([key, value]) => {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, String(value))
    })
    setSearchParams(next)
  }

  return { filters, searchParams, setSearchParams, update }
}

function timestamp(value: string | null) {
  if (value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function asDeviceType(value: string | null): PerformanceFilters['deviceType'] {
  return value === 'desktop' || value === 'mobile' || value === 'tablet' || value === 'unknown' ? value : undefined
}
