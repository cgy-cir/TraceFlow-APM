import { FilterOutlined } from '@ant-design/icons'
import { Input, Segmented, Select, Space, Typography } from 'antd'
import type { PerformanceFilters } from '../api/client'
import { RANGE_MS } from '../hooks/usePerformanceFilters'

const MINUTE_MS = 60_000

export function PerformanceFiltersBar({
  filters,
  onChange,
}: {
  filters: PerformanceFilters
  onChange: (values: Partial<Record<keyof PerformanceFilters, string | number | undefined>>) => void
}) {
  const duration = filters.to - filters.from
  const selectedRange = Object.entries(RANGE_MS).find(([, value]) => value === duration)?.[0] ?? 'custom'

  return (
    <div className="performance-filters">
      <Space size={8} className="filter-title"><FilterOutlined /><Typography.Text strong>筛选</Typography.Text></Space>
      <Segmented
        aria-label="时间范围"
        value={selectedRange}
        options={[{ label: '24 小时', value: '24h' }, { label: '7 天', value: '7d' }, { label: '30 天', value: '30d' }]}
        onChange={(value) => {
          const to = Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS
          onChange({ from: to - RANGE_MS[value as keyof typeof RANGE_MS], to })
        }}
      />
      <Input
        key={`environment-${filters.environment ?? ''}`}
        aria-label="性能环境"
        defaultValue={filters.environment}
        placeholder="环境"
        allowClear
        onPressEnter={(event) => onChange({ environment: event.currentTarget.value.trim() || undefined })}
        onClear={() => onChange({ environment: undefined })}
      />
      <Input
        key={`release-${filters.release ?? ''}`}
        aria-label="性能版本"
        defaultValue={filters.release}
        placeholder="Release"
        allowClear
        onPressEnter={(event) => onChange({ release: event.currentTarget.value.trim() || undefined })}
        onClear={() => onChange({ release: undefined })}
      />
      <Input
        key={`page-${filters.pagePath ?? ''}`}
        aria-label="页面路径"
        defaultValue={filters.pagePath}
        placeholder="页面路径"
        allowClear
        onPressEnter={(event) => onChange({ pagePath: event.currentTarget.value.trim() || undefined })}
        onClear={() => onChange({ pagePath: undefined })}
      />
      <Select
        aria-label="设备类型"
        value={filters.deviceType}
        allowClear
        placeholder="全部设备"
        options={[
          { label: '桌面端', value: 'desktop' },
          { label: '移动端', value: 'mobile' },
          { label: '平板', value: 'tablet' },
          { label: '未知', value: 'unknown' },
        ]}
        onChange={(deviceType) => onChange({ deviceType })}
      />
      <Typography.Text type="secondary" className="filter-window">
        {formatRange(filters.from, filters.to)}
      </Typography.Text>
    </div>
  )
}

function formatRange(from: number, to: number) {
  const formatter = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  return `${formatter.format(from)} - ${formatter.format(to)}`
}
