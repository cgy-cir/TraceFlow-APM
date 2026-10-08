export function formatMetric(value: number | null | undefined, unit?: string) {
  if (value === null || value === undefined) return '--'
  if (unit === 'bytes') return formatBytes(value)
  if (unit === 'score') return value.toFixed(3)
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value.toFixed(0)} ms`
}

export function formatBytes(value: number | null | undefined) {
  if (value === null || value === undefined) return '--'
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}
