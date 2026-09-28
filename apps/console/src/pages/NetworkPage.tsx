import { useQuery } from '@tanstack/react-query'
import { Alert, Segmented, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useParams, useSearchParams } from 'react-router-dom'
import { listHttpEvents, type HttpEvent } from '../api/client'

const columns: ColumnsType<HttpEvent> = [
  { title: '方法', dataIndex: 'method', width: 90, render: (method) => <Tag>{method}</Tag> },
  { title: 'URL', dataIndex: 'url', ellipsis: true },
  { title: '状态码', dataIndex: 'status', width: 100, render: (status) => status ?? '-' },
  { title: '耗时', dataIndex: 'durationMs', width: 110, render: (duration) => `${Number(duration).toFixed(1)} ms` },
  { title: '结果', dataIndex: 'outcome', width: 100, render: (outcome) => <Tag color={outcome === 'success' ? 'success' : 'error'}>{outcome === 'success' ? '成功' : '失败'}</Tag> },
  { title: '发生时间', dataIndex: 'occurredAt', width: 180, render: formatDateTime },
]

export function NetworkPage() {
  const { appId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const outcome = searchParams.get('outcome') ?? ''
  const page = positiveInt(searchParams.get('page'))

  const updateFilters = (nextOutcome: string, nextPage = 1) => {
    const next = new URLSearchParams()
    if (nextOutcome) next.set('outcome', nextOutcome)
    if (nextPage > 1) next.set('page', String(nextPage))
    setSearchParams(next)
  }

  const eventsQuery = useQuery({
    queryKey: ['http-events', appId, outcome, page],
    queryFn: () => listHttpEvents(Number(appId), outcome, page),
    enabled: Number.isFinite(Number(appId)),
  })

  return (
    <>
      <div className="page-heading"><h1>请求</h1><p>查看 SDK 捕获的 Fetch 与 XMLHttpRequest 性能和失败记录。</p></div>
      <div className="table-toolbar">
        <Segmented
          aria-label="请求结果"
          value={outcome}
          options={[{ label: '全部', value: '' }, { label: '成功', value: 'success' }, { label: '失败', value: 'failure' }]}
          onChange={(value) => updateFilters(value)}
        />
      </div>
      {eventsQuery.isError ? <Alert type="error" showIcon title="请求列表加载失败" description="请确认后端服务已经重启并加载 M1 接口。" /> : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={eventsQuery.data?.items}
          loading={eventsQuery.isPending}
          scroll={{ x: 900 }}
          pagination={{ current: page, pageSize: eventsQuery.data?.pageSize ?? 20, total: eventsQuery.data?.total, showSizeChanger: false, onChange: (nextPage) => updateFilters(outcome, nextPage) }}
        />
      )}
    </>
  )
}

function positiveInt(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value))
}
