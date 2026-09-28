import { useQuery } from '@tanstack/react-query'
import { Alert, Segmented, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useParams, useSearchParams } from 'react-router-dom'
import { listIssues, type Issue } from '../api/client'

const statusLabels: Record<string, string> = { unresolved: '待处理', resolving: '处理中', resolved: '已解决', ignored: '已忽略' }

const columns: ColumnsType<Issue> = [
  {
    title: '问题',
    dataIndex: 'title',
    render: (title, issue) => <div className="primary-cell"><strong>{title}</strong><span>{issue.errorType}</span></div>,
  },
  { title: '级别', dataIndex: 'level', width: 100, render: (level) => <Tag color={level === 'error' ? 'error' : 'warning'}>{level}</Tag> },
  { title: '状态', dataIndex: 'status', width: 110, render: (status) => statusLabels[status] ?? status },
  { title: '事件数', dataIndex: 'eventCount', width: 100 },
  { title: '用户数', dataIndex: 'affectedUserCount', width: 100 },
  { title: '最近发生', dataIndex: 'lastSeenAt', width: 180, render: formatDateTime },
]

export function IssuesPage() {
  const { appId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status') ?? ''
  const page = positiveInt(searchParams.get('page'))

  // React vs Vue: 查询参数不是可直接修改的响应式对象；创建新的 URLSearchParams 后交给 setter 才会触发路由更新。
  const updateFilters = (nextStatus: string, nextPage = 1) => {
    const next = new URLSearchParams()
    if (nextStatus) next.set('status', nextStatus)
    if (nextPage > 1) next.set('page', String(nextPage))
    setSearchParams(next)
  }

  const issuesQuery = useQuery({
    queryKey: ['issues', appId, status, page],
    queryFn: () => listIssues(Number(appId), status, page),
    enabled: Number.isFinite(Number(appId)),
  })

  return (
    <>
      <div className="page-heading"><h1>错误</h1><p>按指纹聚合浏览器异常，定位最近发生且影响面较大的问题。</p></div>
      <div className="table-toolbar">
        <Segmented
          aria-label="错误状态"
          value={status}
          options={[{ label: '全部', value: '' }, { label: '待处理', value: 'unresolved' }, { label: '处理中', value: 'resolving' }, { label: '已解决', value: 'resolved' }, { label: '已忽略', value: 'ignored' }]}
          onChange={(value) => updateFilters(value)}
        />
      </div>
      {issuesQuery.isError ? <Alert type="error" showIcon title="错误列表加载失败" description="请确认后端服务已经重启并加载 M1 接口。" /> : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={issuesQuery.data?.items}
          loading={issuesQuery.isPending}
          scroll={{ x: 820 }}
          pagination={{ current: page, pageSize: issuesQuery.data?.pageSize ?? 20, total: issuesQuery.data?.total, showSizeChanger: false, onChange: (nextPage) => updateFilters(status, nextPage) }}
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
