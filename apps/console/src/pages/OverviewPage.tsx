import { useQuery } from '@tanstack/react-query'
import { Alert, Statistic, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate, useParams } from 'react-router-dom'
import { getOverview, getPerformanceTrends, type PagePerformance } from '../api/client'
import { PerformanceFiltersBar } from '../components/PerformanceFiltersBar'
import { PerformanceMetricCard } from '../components/PerformanceMetricCard'
import { formatMetric } from '../components/performancePresentation'
import { LazyPerformanceTrendChart } from '../components/LazyPerformanceTrendChart'
import { usePerformanceFilters } from '../hooks/usePerformanceFilters'

const pageColumns: ColumnsType<PagePerformance> = [
  { title: '页面', dataIndex: 'pagePath', ellipsis: true },
  { title: 'LCP P75', dataIndex: 'lcpP75', width: 120, render: (value) => formatMetric(value, 'ms') },
  { title: 'INP P75', dataIndex: 'inpP75', width: 120, render: (value) => formatMetric(value, 'ms') },
  { title: 'CLS P75', dataIndex: 'clsP75', width: 110, render: (value) => formatMetric(value, 'score') },
  { title: '样本', dataIndex: 'sampleCount', width: 90 },
  { title: '结论', dataIndex: 'lowSample', width: 100, render: (value) => value ? <Tag>样本较少</Tag> : <Tag color="processing">可参考</Tag> },
]

export function OverviewPage() {
  const { appId = '' } = useParams()
  const navigate = useNavigate()
  const applicationId = Number(appId)
  const { filters, update } = usePerformanceFilters()
  const interval = filters.to - filters.from > 48 * 60 * 60 * 1000 ? 'day' : 'hour'

  const overviewQuery = useQuery({
    // React Query 的缓存身份来自 queryKey；筛选对象必须完整进入 key，效果类似 Vue Query 的响应式 queryKey。
    queryKey: ['overview', applicationId, filters],
    queryFn: () => getOverview(applicationId, filters),
    enabled: Number.isFinite(applicationId),
  })
  const trendsQuery = useQuery({
    queryKey: ['performance-trends', applicationId, filters, ['LCP', 'INP', 'CLS'], interval],
    queryFn: () => getPerformanceTrends(applicationId, filters, ['LCP', 'INP', 'CLS'], interval),
    enabled: Number.isFinite(applicationId),
  })

  const metrics = new Map(overviewQuery.data?.coreWebVitals.map((metric) => [metric.metric, metric]))
  const hasError = overviewQuery.isError || trendsQuery.isError

  return (
    <>
      <div className="page-heading"><h1>总览</h1><p>核心体验、错误和请求质量的统一扫描入口。</p></div>
      <PerformanceFiltersBar filters={filters} onChange={update} />
      {hasError && <Alert type="error" showIcon title="总览数据加载失败" description="请确认后端已启动并完成性能聚合。" />}

      <div className="metric-grid overview-vitals">
        {['LCP', 'INP', 'CLS'].map((name) => (
          <PerformanceMetricCard key={name} metric={metrics.get(name)} loading={overviewQuery.isPending} />
        ))}
        <div className="sample-stat"><Statistic title="核心指标样本" value={overviewQuery.data?.performanceSampleCount ?? 0} loading={overviewQuery.isPending} /><span>按指标累计</span></div>
      </div>

      <section className="dashboard-section">
        <div className="section-title"><div><h2>核心指标趋势</h2><p>P75 固定直方图近似值，空白时段不按零值绘制。</p></div><Tag>{interval === 'day' ? '按天' : '按小时'}</Tag></div>
        <LazyPerformanceTrendChart series={trendsQuery.data?.series ?? []} />
      </section>

      <div className="overview-lower-grid">
        <section className="dashboard-section">
          <div className="section-title"><div><h2>最差页面</h2><p>高样本页面优先，再按最差核心指标排序。</p></div></div>
          <Table
            rowKey="pagePath"
            size="small"
            columns={pageColumns}
            dataSource={overviewQuery.data?.worstPages}
            loading={overviewQuery.isPending}
            pagination={false}
            scroll={{ x: 680 }}
            onRow={(page) => ({
              role: 'button',
              tabIndex: 0,
              className: 'clickable-row',
              onClick: () => navigate(`/apps/${appId}/performance?from=${filters.from}&to=${filters.to}&pagePath=${encodeURIComponent(page.pagePath)}`),
            })}
          />
        </section>

        <section className="dashboard-section operations-summary">
          <div className="section-title"><div><h2>运行质量</h2><p>同一筛选窗口内的错误与请求事件。</p></div></div>
          <div className="operations-grid">
            <Statistic title="错误事件" value={overviewQuery.data?.errorEventCount ?? 0} loading={overviewQuery.isPending} />
            <Statistic title="请求总数" value={overviewQuery.data?.httpEventCount ?? 0} loading={overviewQuery.isPending} />
            <Statistic title="失败请求" value={overviewQuery.data?.failedHttpEventCount ?? 0} loading={overviewQuery.isPending} />
          </div>
        </section>
      </div>
    </>
  )
}
