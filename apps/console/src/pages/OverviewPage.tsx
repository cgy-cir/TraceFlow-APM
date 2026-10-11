import {
  ArrowRightOutlined,
  DatabaseOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Skeleton, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link, useParams } from 'react-router-dom'
import {
  getOverview,
  getPerformanceTrends,
  type MetricSummary,
  type PagePerformance,
} from '../api/client'
import { PerformanceFiltersBar } from '../components/PerformanceFiltersBar'
import { formatMetric } from '../components/performancePresentation'
import { LazyPerformanceTrendChart } from '../components/LazyPerformanceTrendChart'
import { usePerformanceFilters } from '../hooks/usePerformanceFilters'

const vitals = [
  {
    name: 'LCP',
    label: '最大内容绘制',
    threshold: 2500,
    poor: 4000,
    color: '#176b5b',
    target: '≤ 2.5 s',
  },
  {
    name: 'INP',
    label: '交互响应',
    threshold: 200,
    poor: 500,
    color: '#d97706',
    target: '≤ 200 ms',
  },
  {
    name: 'CLS',
    label: '布局偏移',
    threshold: 0.1,
    poor: 0.25,
    color: '#2563eb',
    target: '≤ 0.1',
  },
] as const

export function OverviewPage() {
  const { appId = '' } = useParams()
  const applicationId = Number(appId)
  const { filters, update } = usePerformanceFilters()
  const interval =
    filters.to - filters.from > 48 * 60 * 60 * 1000 ? 'day' : 'hour'

  const overviewQuery = useQuery({
    queryKey: ['overview', applicationId, filters],
    queryFn: () => getOverview(applicationId, filters),
    enabled: Number.isFinite(applicationId),
  })
  const trendsQuery = useQuery({
    queryKey: [
      'performance-trends',
      applicationId,
      filters,
      ['LCP', 'INP', 'CLS'],
      interval,
    ],
    queryFn: () =>
      getPerformanceTrends(
        applicationId,
        filters,
        ['LCP', 'INP', 'CLS'],
        interval,
      ),
    enabled: Number.isFinite(applicationId),
  })

  const metrics = new Map(
    overviewQuery.data?.coreWebVitals.map((metric) => [metric.metric, metric]),
  )
  const hasError = overviewQuery.isError || trendsQuery.isError
  const busy = overviewQuery.isFetching || trendsQuery.isFetching
  const summary = overviewQuery.data
  const successRate =
    summary && summary.httpEventCount > 0
      ? (1 - summary.failedHttpEventCount / summary.httpEventCount) * 100
      : null
  const numberFormatter = new Intl.NumberFormat('zh-CN')
  const performanceUrl = (pagePath?: string) => {
    const params = new URLSearchParams()
    Object.entries({
      ...filters,
      ...(pagePath === undefined ? {} : { pagePath }),
    }).forEach(([key, value]) => {
      if (value !== undefined) params.set(key, String(value))
    })
    return `/apps/${appId}/performance?${params}`
  }
  const pageColumns: ColumnsType<PagePerformance> = [
    {
      title: '页面路径',
      dataIndex: 'pagePath',
      ellipsis: true,
      render: (path: string) => (
        <Link to={performanceUrl(path)} title={path} className="font-medium">
          {path}
        </Link>
      ),
    },
    {
      title: 'LCP P75',
      dataIndex: 'lcpP75',
      width: 112,
      align: 'right',
      render: (value) => formatMetric(value, 'ms'),
    },
    {
      title: 'INP P75',
      dataIndex: 'inpP75',
      width: 112,
      align: 'right',
      render: (value) => formatMetric(value, 'ms'),
    },
    {
      title: 'CLS P75',
      dataIndex: 'clsP75',
      width: 100,
      align: 'right',
      render: (value) => formatMetric(value, 'score'),
    },
    {
      title: '样本',
      dataIndex: 'sampleCount',
      width: 80,
      align: 'right',
      render: (value: number) => numberFormatter.format(value),
    },
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

  return (
    <div className="overview-page monitoring-page flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="m-0 text-2xl font-semibold leading-8 text-[#101828]">
            总览
          </h1>
          <span className="text-sm text-[#667085]">应用运行概况</span>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip title="刷新总览数据">
            <Button
              aria-label="刷新总览数据"
              icon={<ReloadOutlined spin={busy} />}
              disabled={busy}
              onClick={() => {
                void overviewQuery.refetch()
                void trendsQuery.refetch()
              }}
            />
          </Tooltip>
          <Link
            to={performanceUrl()}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-solid border-[#d0d5dd] bg-white px-3 text-sm text-[#344054] hover:border-[#176b5b] hover:text-[#176b5b]"
          >
            性能分析
            <ArrowRightOutlined />
          </Link>
        </div>
      </header>

      <PerformanceFiltersBar
        variant="dashboard"
        filters={filters}
        onChange={update}
      />
      {hasError && (
        <Alert
          type="error"
          showIcon
          title="总览数据加载失败"
          description="请稍后重试，或检查后端服务是否正常。"
        />
      )}

      <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {vitals.map((vital) => (
          <OverviewVital
            key={vital.name}
            vital={vital}
            metric={metrics.get(vital.name)}
            loading={overviewQuery.isPending}
          />
        ))}
        <article className="flex min-h-[176px] min-w-0 flex-col rounded-lg border border-solid border-[#e4e7ec] bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#344054]">
              核心指标样本
            </span>
            <DatabaseOutlined className="text-[#98a2b3]" />
          </div>
          {overviewQuery.isPending ? (
            <Skeleton
              active
              title={false}
              paragraph={{ rows: 1 }}
              className="my-4"
            />
          ) : (
            <div className="my-4 text-[26px] font-semibold leading-9 text-[#101828] tabular-nums sm:text-[30px]">
              {summary
                ? numberFormatter.format(summary.performanceSampleCount)
                : '--'}
            </div>
          )}
          <div className="mt-auto flex flex-wrap justify-between gap-2 text-xs text-[#667085]">
            <span>LCP / INP / CLS</span>
            <span>累计样本数</span>
          </div>
        </article>
      </div>

      <section
        aria-labelledby="overview-trends"
        className="min-w-0 border-b border-solid border-[#e4e7ec] pb-6"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h2
              id="overview-trends"
              className="m-0 text-base font-semibold text-[#101828]"
            >
              核心体验趋势
            </h2>
            <Tooltip title="P75 为固定直方图估算的第 75 百分位">
              <span className="rounded border border-solid border-[#e4e7ec] px-1.5 py-0.5 text-xs text-[#667085]">
                P75
              </span>
            </Tooltip>
          </div>
          <span className="text-xs text-[#667085]">
            {interval === 'day' ? '按天聚合' : '按小时聚合'}
          </span>
        </div>
        <LazyPerformanceTrendChart series={trendsQuery.data?.series ?? []} />
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section aria-labelledby="overview-pages" className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2
              id="overview-pages"
              className="m-0 text-base font-semibold text-[#101828]"
            >
              待关注页面
            </h2>
            <Link to={performanceUrl()} className="whitespace-nowrap text-sm">
              全部页面 <ArrowRightOutlined />
            </Link>
          </div>
          <Table
            rowKey="pagePath"
            size="middle"
            columns={pageColumns}
            dataSource={summary?.worstPages ?? []}
            loading={overviewQuery.isPending}
            pagination={false}
            scroll={{ x: 700 }}
            locale={{ emptyText: '当前范围暂无页面数据' }}
          />
        </section>

        <section
          aria-labelledby="overview-quality"
          className="min-w-0 xl:border-l xl:border-solid xl:border-[#e4e7ec] xl:pl-6"
        >
          <h2
            id="overview-quality"
            className="m-0 mb-4 text-base font-semibold text-[#101828]"
          >
            运行质量
          </h2>
          <div className="border-b border-solid border-[#e4e7ec] pb-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-[#667085]">请求成功率</span>
              <span className="font-semibold text-[#101828] tabular-nums">
                {successRate === null ? '--' : `${successRate.toFixed(1)}%`}
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded bg-[#eaecf0]"
              role="meter"
              aria-label="请求成功率"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={successRate ?? undefined}
            >
              <div
                className="h-full rounded bg-[#176b5b]"
                style={{ width: `${successRate ?? 0}%` }}
              />
            </div>
          </div>
          <dl className="m-0 divide-y divide-[#e4e7ec]">
            {[
              {
                label: '错误事件',
                value: summary?.errorEventCount,
                tone: 'text-[#b42318]',
              },
              {
                label: '请求总数',
                value: summary?.httpEventCount,
                tone: 'text-[#101828]',
              },
              {
                label: '失败请求',
                value: summary?.failedHttpEventCount,
                tone: 'text-[#b45309]',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-3 py-4"
              >
                <dt className="text-sm text-[#667085]">{item.label}</dt>
                <dd
                  className={`m-0 text-xl font-semibold tabular-nums ${item.tone}`}
                >
                  {item.value === undefined
                    ? '--'
                    : numberFormatter.format(item.value)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  )
}

function OverviewVital({
  vital,
  metric,
  loading,
}: {
  vital: (typeof vitals)[number]
  metric?: MetricSummary
  loading: boolean
}) {
  const value = metric?.p75
  const rating =
    value === null || value === undefined
      ? null
      : value <= vital.threshold
        ? { label: '良好', color: 'success' }
        : value <= vital.poor
          ? { label: '待改善', color: 'warning' }
          : { label: '较差', color: 'error' }
  return (
    <article className="flex min-h-[176px] min-w-0 flex-col rounded-lg border border-solid border-[#e4e7ec] bg-white p-4 sm:p-5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: vital.color }}
          />
          <span className="text-sm font-semibold text-[#344054]">
            {vital.name}
          </span>
        </div>
        {rating ? (
          <Tag variant="filled" color={rating.color}>
            {rating.label}
          </Tag>
        ) : (
          <span className="text-xs text-[#98a2b3]">
            {loading ? '加载中' : '暂无样本'}
          </span>
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
          {formatMetric(value, vital.name === 'CLS' ? 'score' : 'ms')}
        </div>
      )}
      <div className="mb-4 text-xs text-[#667085]">
        {vital.label}
        <span className="ml-2 text-[#98a2b3]">P75</span>
      </div>
      <div className="mt-auto flex flex-wrap justify-between gap-2 border-t border-solid border-[#f2f4f7] pt-3 text-xs text-[#667085]">
        <span>{metric?.sampleCount ?? 0} 个样本</span>
        <Tooltip title="良好评级的 P75 阈值">
          <span>{vital.target}</span>
        </Tooltip>
      </div>
    </article>
  )
}
