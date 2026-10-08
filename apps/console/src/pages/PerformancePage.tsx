import { useQuery } from '@tanstack/react-query'
import { Alert, Table, Tabs, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useParams } from 'react-router-dom'
import {
  getPerformancePages,
  getPerformanceSummary,
  getPerformanceTrends,
  getResources,
  type MetricSummary,
  type PagePerformance,
  type ResourceDetail,
} from '../api/client'
import { PerformanceFiltersBar } from '../components/PerformanceFiltersBar'
import { PerformanceMetricCard } from '../components/PerformanceMetricCard'
import { formatBytes, formatMetric } from '../components/performancePresentation'
import { LazyPerformanceTrendChart } from '../components/LazyPerformanceTrendChart'
import { usePerformanceFilters } from '../hooks/usePerformanceFilters'

type PerformanceTab = 'vitals' | 'navigation' | 'resources'

const metricsByTab: Record<PerformanceTab, string[]> = {
  vitals: ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'],
  navigation: ['NAV_DNS', 'NAV_TCP', 'NAV_TLS', 'NAV_REQUEST', 'NAV_RESPONSE', 'NAV_DOM_INTERACTIVE', 'NAV_DCL', 'NAV_LOAD'],
  resources: ['RESOURCE_DURATION', 'RESOURCE_TRANSFER_SIZE'],
}

const pageColumns: ColumnsType<PagePerformance> = [
  { title: '页面', dataIndex: 'pagePath', ellipsis: true },
  { title: 'LCP P75', dataIndex: 'lcpP75', width: 120, render: (value) => formatMetric(value, 'ms') },
  { title: 'INP P75', dataIndex: 'inpP75', width: 120, render: (value) => formatMetric(value, 'ms') },
  { title: 'CLS P75', dataIndex: 'clsP75', width: 110, render: (value) => formatMetric(value, 'score') },
  { title: '较差占比', dataIndex: 'poorRate', width: 110, render: (value) => `${(Number(value) * 100).toFixed(1)}%` },
  { title: '样本', dataIndex: 'sampleCount', width: 80 },
  { title: '可信度', dataIndex: 'lowSample', width: 100, render: (value) => value ? <Tag>样本较少</Tag> : <Tag color="processing">可参考</Tag> },
]

const resourceColumns: ColumnsType<ResourceDetail> = [
  { title: '资源', dataIndex: 'url', ellipsis: true, render: (url, item) => <div className="primary-cell"><strong>{url}</strong><span>{item.pagePath}</span></div> },
  { title: '类型', dataIndex: 'resourceType', width: 100, render: (value) => <Tag>{value}</Tag> },
  { title: '耗时', dataIndex: 'durationMs', width: 110, sorter: (a, b) => a.durationMs - b.durationMs, render: (value) => formatMetric(value, 'ms') },
  { title: '传输大小', dataIndex: 'transferSize', width: 120, render: formatBytes },
  { title: '协议', dataIndex: 'nextHopProtocol', width: 90, render: (value) => value || '-' },
  { title: '发生时间', dataIndex: 'occurredAt', width: 170, render: formatDateTime },
]

export function PerformancePage() {
  const { appId = '' } = useParams()
  const applicationId = Number(appId)
  const { filters, searchParams, setSearchParams, update } = usePerformanceFilters()
  const tab = performanceTab(searchParams.get('tab'))
  const metrics = metricsByTab[tab]
  const interval = filters.to - filters.from > 48 * 60 * 60 * 1000 ? 'day' : 'hour'

  const summaryQuery = useQuery({
    queryKey: ['performance-summary', applicationId, filters, metrics],
    queryFn: () => getPerformanceSummary(applicationId, filters, metrics),
    enabled: Number.isFinite(applicationId),
  })
  const trendsQuery = useQuery({
    queryKey: ['performance-trends', applicationId, filters, metrics, interval],
    queryFn: () => getPerformanceTrends(applicationId, filters, metrics, interval),
    enabled: Number.isFinite(applicationId),
  })
  const pagesQuery = useQuery({
    queryKey: ['performance-pages', applicationId, filters],
    queryFn: () => getPerformancePages(applicationId, filters),
    enabled: tab === 'vitals' && Number.isFinite(applicationId),
  })
  const resourcesQuery = useQuery({
    queryKey: ['performance-resources', applicationId, filters],
    queryFn: () => getResources(applicationId, filters),
    enabled: tab === 'resources' && Number.isFinite(applicationId),
  })

  const isError = summaryQuery.isError || trendsQuery.isError || pagesQuery.isError || resourcesQuery.isError

  return (
    <>
      <div className="page-heading"><h1>性能</h1><p>从核心体验到页面与资源明细，定位真实用户的性能瓶颈。</p></div>
      <PerformanceFiltersBar filters={filters} onChange={update} />
      <Tabs
        activeKey={tab}
        items={[
          { key: 'vitals', label: 'Core Web Vitals' },
          { key: 'navigation', label: 'Navigation' },
          { key: 'resources', label: 'Resources' },
        ]}
        onChange={(key) => {
          const next = new URLSearchParams(searchParams)
          if (key === 'vitals') next.delete('tab')
          else next.set('tab', key)
          setSearchParams(next)
        }}
      />
      {isError && <Alert type="error" showIcon title="性能数据加载失败" description="请确认后端已启动并完成性能聚合。" />}

      <div className={`metric-grid performance-metrics ${tab === 'navigation' ? 'dense-metrics' : ''}`}>
        {(summaryQuery.data?.metrics ?? metrics.map((metric) => placeholder(metric))).map((metric) => (
          <PerformanceMetricCard key={metric.metric} metric={metric} loading={summaryQuery.isPending} />
        ))}
      </div>

      {tab === 'vitals' && <RatingDistribution metrics={summaryQuery.data?.metrics ?? []} />}

      <section className="dashboard-section">
        <div className="section-title"><div><h2>P75 趋势</h2><p>分位数来自可合并固定直方图，断点表示该时段没有样本。</p></div><Tag>{interval === 'day' ? '按天' : '按小时'}</Tag></div>
        <LazyPerformanceTrendChart series={trendsQuery.data?.series ?? []} />
      </section>

      {tab === 'vitals' && (
        <section className="dashboard-section">
          <div className="section-title"><div><h2>页面体验排行</h2><p>点击页面可将其写入 URL 筛选条件。</p></div></div>
          <Table
            rowKey="pagePath"
            columns={pageColumns}
            dataSource={pagesQuery.data?.items}
            loading={pagesQuery.isPending}
            pagination={false}
            scroll={{ x: 820 }}
            onRow={(page) => ({ role: 'button', tabIndex: 0, className: 'clickable-row', onClick: () => update({ pagePath: page.pagePath }) })}
          />
        </section>
      )}

      {tab === 'resources' && (
        <section className="dashboard-section">
          <div className="section-title"><div><h2>慢资源明细</h2><p>按耗时降序展示最近范围内的脱敏资源 URL。</p></div></div>
          <Table
            rowKey="id"
            columns={resourceColumns}
            dataSource={resourcesQuery.data?.items}
            loading={resourcesQuery.isPending}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 980 }}
          />
        </section>
      )}
    </>
  )
}

function RatingDistribution({ metrics }: { metrics: MetricSummary[] }) {
  const rated = metrics.filter((metric) => metric.ratings.good + metric.ratings.needsImprovement + metric.ratings.poor > 0)
  if (rated.length === 0) return null
  return (
    <section className="dashboard-section rating-section">
      <div className="section-title"><div><h2>评级分布</h2><p>颜色之外同时保留数量与文字标签。</p></div></div>
      <div className="rating-grid">
        {rated.map((metric) => {
          const total = metric.ratings.good + metric.ratings.needsImprovement + metric.ratings.poor
          const good = metric.ratings.good / total * 100
          const needs = metric.ratings.needsImprovement / total * 100
          const poor = metric.ratings.poor / total * 100
          return (
            <div key={metric.metric} className="rating-row">
              <strong>{metric.metric}</strong>
              <div className="rating-bar" aria-label={`${metric.metric} 评级分布`}>
                <span className="rating-good" style={{ width: `${good}%` }} />
                <span className="rating-needs" style={{ width: `${needs}%` }} />
                <span className="rating-poor" style={{ width: `${poor}%` }} />
              </div>
              <span>良好 {metric.ratings.good}</span><span>待改善 {metric.ratings.needsImprovement}</span><span>较差 {metric.ratings.poor}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function placeholder(metric: string): MetricSummary {
  return { metric, unit: metric === 'CLS' ? 'score' : metric === 'RESOURCE_TRANSFER_SIZE' ? 'bytes' : 'ms', sampleCount: 0, p75: null, p95: null, average: null, ratings: { good: 0, needsImprovement: 0, poor: 0 }, percentileMethod: 'fixed_histogram_v1' }
}

function performanceTab(value: string | null): PerformanceTab {
  return value === 'navigation' || value === 'resources' ? value : 'vitals'
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value))
}
