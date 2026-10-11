import { Skeleton, Tag } from 'antd'
import type { MetricSummary } from '../api/client'
import { formatMetric } from './performancePresentation'

const labels: Record<string, string> = {
  LCP: '最大内容绘制',
  INP: '交互响应',
  CLS: '布局偏移',
  FCP: '首次内容绘制',
  TTFB: '首字节时间',
  NAV_DNS: 'DNS',
  NAV_TCP: 'TCP',
  NAV_TLS: 'TLS',
  NAV_REQUEST: '请求等待',
  NAV_RESPONSE: '响应下载',
  NAV_DOM_INTERACTIVE: 'DOM 可交互',
  NAV_DCL: 'DOM 内容加载',
  NAV_LOAD: '页面加载',
  RESOURCE_DURATION: '资源耗时',
  RESOURCE_TRANSFER_SIZE: '传输大小',
}

export function PerformanceMetricCard({
  metric,
  loading = false,
}: {
  metric?: MetricSummary
  loading?: boolean
}) {
  const rating =
    metric && metric.p75 !== null ? ratingFor(metric.metric, metric.p75) : null

  return (
    <article className="flex min-h-[186px] min-w-0 flex-col rounded-lg border border-[#e4e7ec] bg-white p-4 sm:p-5">
      <div className="flex min-h-6 items-start justify-between gap-2">
        <span className="text-sm font-medium text-[#344054]">
          {metric ? (labels[metric.metric] ?? metric.metric) : '指标'}
        </span>
        {rating && !loading && (
          <Tag variant="filled" color={rating.color}>
            {rating.label}
          </Tag>
        )}
      </div>
      {loading ? (
        <Skeleton
          active
          title={false}
          paragraph={{ rows: 1 }}
          className="my-4"
        />
      ) : (
        <div className="my-3 text-[26px] font-semibold leading-9 text-[#101828] tabular-nums sm:text-[30px]">
          {formatMetric(metric?.p75, metric?.unit)}
        </div>
      )}
      <span title={metric?.metric} className="mb-4 truncate text-[11px] text-[#98a2b3]">
        {metric?.metric ?? '--'}
      </span>
      <div className="mt-auto flex flex-wrap justify-between gap-2 border-t border-[#f2f4f7] pt-3 text-xs text-[#667085]">
        <span>P75 近似值</span>
        <span>{metric?.sampleCount ?? 0} 个样本</span>
      </div>
    </article>
  )
}

function ratingFor(metric: string, value: number) {
  const thresholds: Record<string, [number, number]> = {
    LCP: [2500, 4000],
    INP: [200, 500],
    CLS: [0.1, 0.25],
    FCP: [1800, 3000],
    TTFB: [800, 1800],
  }
  const threshold = thresholds[metric]
  if (!threshold) return null
  if (value <= threshold[0]) return { label: '良好', color: 'success' }
  if (value <= threshold[1]) return { label: '待改善', color: 'warning' }
  return { label: '较差', color: 'error' }
}
