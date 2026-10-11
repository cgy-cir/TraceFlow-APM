import { ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Empty, Skeleton, Table, Tabs, Tag, Tooltip } from 'antd'
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
import {
  formatBytes,
  formatMetric,
} from '../components/performancePresentation'
import { LazyPerformanceTrendChart } from '../components/LazyPerformanceTrendChart'
import { usePerformanceFilters } from '../hooks/usePerformanceFilters'

type PerformanceTab = 'vitals' | 'navigation' | 'resources'

const metricsByTab: Record<PerformanceTab, string[]> = {
  vitals: ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'],
  navigation: [
    'NAV_DNS',
    'NAV_TCP',
    'NAV_TLS',
    'NAV_REQUEST',
    'NAV_RESPONSE',
    'NAV_DOM_INTERACTIVE',
    'NAV_DCL',
    'NAV_LOAD',
  ],
  resources: ['RESOURCE_DURATION', 'RESOURCE_TRANSFER_SIZE'],
}

const pageColumns: ColumnsType<PagePerformance> = [
  { title: '页面', dataIndex: 'pagePath', ellipsis: true },
  {
    title: 'LCP P75',
    dataIndex: 'lcpP75',
    width: 120,
    align: 'right',
    render: (value) => formatMetric(value, 'ms'),
  },
  {
    title: 'INP P75',
    dataIndex: 'inpP75',
    width: 120,
    align: 'right',
    render: (value) => formatMetric(value, 'ms'),
  },
  {
    title: 'CLS P75',
    dataIndex: 'clsP75',
    width: 110,
    align: 'right',
    render: (value) => formatMetric(value, 'score'),
  },
  {
    title: '较差占比',
    dataIndex: 'poorRate',
    width: 110,
    align: 'right',
    render: (value) => `${(Number(value) * 100).toFixed(1)}%`,
  },
  { title: '样本', dataIndex: 'sampleCount', width: 80, align: 'right' },
  {
    title: '可信度',
    dataIndex: 'lowSample',
    width: 100,
    align: 'right',
    render: (value) => (
      <Tag variant="filled" color={value ? 'default' : 'processing'}>
        {value ? '样本较少' : '可参考'}
      </Tag>
    ),
  },
]

const resourceColumns: ColumnsType<ResourceDetail> = [
  {
    title: '资源 URL',
    dataIndex: 'url',
    ellipsis: true,
    render: (url: string, item) => (
      <div className="flex min-w-0 flex-col gap-1">
        <span title={url} className="truncate font-medium text-[#344054]">
          {url}
        </span>
        <span className="truncate text-xs text-[#98a2b3]">{item.pagePath}</span>
      </div>
    ),
  },
  {
    title: '类型',
    dataIndex: 'resourceType',
    width: 100,
    render: (value) => <Tag variant="filled">{value}</Tag>,
  },
  {
    title: '耗时',
    dataIndex: 'durationMs',
    width: 110,
    align: 'right',
    sorter: (a, b) => a.durationMs - b.durationMs,
    render: (value) => formatMetric(value, 'ms'),
  },
  {
    title: '传输大小',
    dataIndex: 'transferSize',
    width: 120,
    align: 'right',
    render: formatBytes,
  },
  {
    title: '协议',
    dataIndex: 'nextHopProtocol',
    width: 90,
    render: (value) => value || '-',
  },
  {
    title: '发生时间',
    dataIndex: 'occurredAt',
    width: 170,
    render: formatDateTime,
  },
]

export function PerformancePage() {
  const { appId = '' } = useParams()
  const applicationId = Number(appId)
  const { filters, searchParams, setSearchParams, update } =
    usePerformanceFilters()
  const tab = performanceTab(searchParams.get('tab'))
  const metrics = metricsByTab[tab]
  const interval =
    filters.to - filters.from > 48 * 60 * 60 * 1000 ? 'day' : 'hour'

  const summaryQuery = useQuery({
    queryKey: ['performance-summary', applicationId, filters, metrics],
    queryFn: () => getPerformanceSummary(applicationId, filters, metrics),
    enabled: Number.isFinite(applicationId),
  })
  const trendsQuery = useQuery({
    queryKey: ['performance-trends', applicationId, filters, metrics, interval],
    queryFn: () =>
      getPerformanceTrends(applicationId, filters, metrics, interval),
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

  const detailQuery =
    tab === 'vitals' ? pagesQuery : tab === 'resources' ? resourcesQuery : null
  const isError =
    summaryQuery.isError || trendsQuery.isError || detailQuery?.isError
  const busy =
    summaryQuery.isFetching || trendsQuery.isFetching || detailQuery?.isFetching
  const columns: ColumnsType<PagePerformance> = pageColumns.map((column) =>
    'dataIndex' in column && column.dataIndex === 'pagePath'
      ? {
          ...column,
          render: (path: string) => (
            <button
              type="button"
              className="max-w-full cursor-pointer truncate bg-transparent p-0 text-left font-medium text-[#176b5b] hover:underline focus-visible:outline-2 focus-visible:outline-[#176b5b]"
              title={path}
              onClick={() => update({ pagePath: path })}
            >
              {path}
            </button>
          ),
        }
      : column,
  )

  return (
    <div className="performance-page monitoring-page flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="m-0 text-2xl font-semibold leading-8 text-[#101828]">
            性能
          </h1>
          <span className="text-sm text-[#667085]">真实用户体验</span>
        </div>
        <Tooltip title="刷新性能数据">
          <Button
            aria-label="刷新性能数据"
            icon={<ReloadOutlined spin={Boolean(busy)} />}
            disabled={Boolean(busy)}
            onClick={() => {
              void summaryQuery.refetch()
              void trendsQuery.refetch()
              if (detailQuery) void detailQuery.refetch()
            }}
          />
        </Tooltip>
      </header>
      <PerformanceFiltersBar
        variant="dashboard"
        filters={filters}
        onChange={update}
      />
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
      {isError && (
        <Alert
          type="error"
          showIcon
          title="性能数据加载失败"
          description="请稍后重试，或检查后端服务是否正常。"
        />
      )}

      <div
        className={`grid min-w-0 grid-cols-2 gap-3 sm:gap-4 ${tab === 'vitals' ? 'lg:grid-cols-3 xl:grid-cols-5' : tab === 'navigation' ? 'lg:grid-cols-4' : 'w-full max-w-3xl'}`}
      >
        {metrics
          .map(
            (name) =>
              summaryQuery.data?.metrics.find(
                (metric) => metric.metric === name,
              ) ?? placeholder(name),
          )
          .map((metric) => (
            <PerformanceMetricCard
              key={metric.metric}
              metric={metric}
              loading={summaryQuery.isPending}
            />
          ))}
      </div>

      {tab === 'vitals' && (
        <RatingDistribution
          metrics={summaryQuery.data?.metrics ?? []}
          loading={summaryQuery.isPending}
        />
      )}

      <section className="min-w-0 border-t border-[#e4e7ec] pt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-semibold text-[#101828]">
            P75 趋势
          </h2>
          <span className="text-xs text-[#667085]">
            {interval === 'day' ? '按天聚合' : '按小时聚合'}
          </span>
        </div>
        <LazyPerformanceTrendChart series={trendsQuery.data?.series ?? []} />
      </section>

      {tab === 'vitals' && (
        <section className="min-w-0 border-t border-[#e4e7ec] pt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="m-0 text-base font-semibold text-[#101828]">
              页面体验排行
            </h2>
            <span className="text-xs text-[#667085]">
              {pagesQuery.data?.items.length ?? 0} 个页面
            </span>
          </div>
          <Table
            rowKey="pagePath"
            columns={columns}
            dataSource={pagesQuery.data?.items}
            loading={pagesQuery.isPending}
            pagination={false}
            scroll={{ x: 820 }}
            locale={{ emptyText: '当前范围暂无页面数据' }}
          />
        </section>
      )}

      {tab === 'resources' && (
        <section className="min-w-0 border-t border-[#e4e7ec] pt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="m-0 text-base font-semibold text-[#101828]">
              慢资源明细
            </h2>
            <span className="text-xs text-[#667085]">
              {resourcesQuery.data?.items.length ?? 0} 条记录
            </span>
          </div>
          <Table
            rowKey="id"
            columns={resourceColumns}
            dataSource={resourcesQuery.data?.items}
            loading={resourcesQuery.isPending}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 980 }}
            locale={{ emptyText: '当前范围暂无资源数据' }}
          />
        </section>
      )}
    </div>
  )
}

function RatingDistribution({
  metrics,
  loading,
}: {
  metrics: MetricSummary[]
  loading: boolean
}) {
  const rated = metrics.filter(
    (metric) =>
      metric.ratings.good +
        metric.ratings.needsImprovement +
        metric.ratings.poor >
      0,
  )
  return (
    <section className="min-w-0 border-t border-[#e4e7ec] pt-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-base font-semibold text-[#101828]">评级分布</h2>
        <div className="flex gap-4 text-xs text-[#667085]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[#16a34a]" />
            良好
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[#d97706]" />
            待改善
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[#dc2626]" />
            较差
          </span>
        </div>
      </div>
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      ) : rated.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前范围暂无评级样本"
        />
      ) : (
        <div className="grid gap-4">
          {rated.map((metric) => {
            const total =
              metric.ratings.good +
              metric.ratings.needsImprovement +
              metric.ratings.poor
            const good = (metric.ratings.good / total) * 100
            const needs = (metric.ratings.needsImprovement / total) * 100
            const poor = (metric.ratings.poor / total) * 100
            return (
              <div
                key={metric.metric}
                className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 md:grid-cols-[56px_minmax(0,1fr)_260px]"
              >
                <strong className="text-xs font-medium text-[#344054]">
                  {metric.metric}
                </strong>
                <div
                  className="flex h-2 overflow-hidden rounded bg-[#eaecf0]"
                  role="img"
                  aria-label={`${metric.metric}：良好 ${metric.ratings.good}，待改善 ${metric.ratings.needsImprovement}，较差 ${metric.ratings.poor}`}
                >
                  <span
                    className="h-full bg-[#16a34a]"
                    style={{ width: `${good}%` }}
                  />
                  <span
                    className="h-full bg-[#d97706]"
                    style={{ width: `${needs}%` }}
                  />
                  <span
                    className="h-full bg-[#dc2626]"
                    style={{ width: `${poor}%` }}
                  />
                </div>
                <div className="col-start-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#667085] tabular-nums md:col-start-auto md:justify-end">
                  <span>
                    良好{' '}
                    <b className="font-medium text-[#344054]">
                      {metric.ratings.good}
                    </b>
                  </span>
                  <span>
                    待改善{' '}
                    <b className="font-medium text-[#344054]">
                      {metric.ratings.needsImprovement}
                    </b>
                  </span>
                  <span>
                    较差{' '}
                    <b className="font-medium text-[#344054]">
                      {metric.ratings.poor}
                    </b>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function placeholder(metric: string): MetricSummary {
  return {
    metric,
    unit:
      metric === 'CLS'
        ? 'score'
        : metric === 'RESOURCE_TRANSFER_SIZE'
          ? 'bytes'
          : 'ms',
    sampleCount: 0,
    p75: null,
    p95: null,
    average: null,
    ratings: { good: 0, needsImprovement: 0, poor: 0 },
    percentileMethod: 'fixed_histogram_v1',
  }
}

function performanceTab(value: string | null): PerformanceTab {
  return value === 'navigation' || value === 'resources' ? value : 'vitals'
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
}
