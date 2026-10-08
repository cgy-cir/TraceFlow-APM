import { Card, Skeleton, Tag } from 'antd'
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

export function PerformanceMetricCard({ metric, loading = false }: { metric?: MetricSummary; loading?: boolean }) {
  if (loading) return <Card size="small" className="performance-metric-card"><Skeleton active paragraph={false} /></Card>
  const rating = metric && metric.p75 !== null ? ratingFor(metric.metric, metric.p75) : null

  return (
    <Card size="small" className="performance-metric-card">
      <div className="metric-card-heading">
        <div><span>{metric ? labels[metric.metric] ?? metric.metric : '指标'}</span><strong>{metric?.metric ?? '--'}</strong></div>
        {rating && <Tag color={rating.color}>{rating.label}</Tag>}
      </div>
      <div className="metric-card-value">{formatMetric(metric?.p75, metric?.unit)}</div>
      <div className="metric-card-meta"><span>P75 近似值</span><span>{metric?.sampleCount ?? 0} 个样本</span></div>
    </Card>
  )
}

function ratingFor(metric: string, value: number) {
  const thresholds: Record<string, [number, number]> = {
    LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25], FCP: [1800, 3000], TTFB: [800, 1800],
  }
  const threshold = thresholds[metric]
  if (!threshold) return null
  if (value <= threshold[0]) return { label: '良好', color: 'success' }
  if (value <= threshold[1]) return { label: '待改善', color: 'warning' }
  return { label: '较差', color: 'error' }
}
