import { SearchOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Alert, Input, Segmented, Select, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { listIssues, type Issue, type IssueFilters, type IssueStatus } from '../api/client'
import { formatDateTime, statusLabels } from './issuePresentation'

const statusColors: Record<IssueStatus, string> = {
  unresolved: 'error',
  resolving: 'processing',
  resolved: 'success',
  ignored: 'default',
  regressed: 'warning',
}

const columns: ColumnsType<Issue> = [
  {
    title: '问题',
    dataIndex: 'title',
    render: (title, issue) => <div className="primary-cell"><strong>{title}</strong><span>{issue.errorType}</span></div>,
  },
  { title: '级别', dataIndex: 'level', width: 90, render: (level) => <Tag color={level === 'error' ? 'error' : 'warning'}>{level}</Tag> },
  { title: '状态', dataIndex: 'status', width: 110, render: (status: IssueStatus) => <Tag color={statusColors[status]}>{statusLabels[status]}</Tag> },
  { title: '事件数', dataIndex: 'eventCount', width: 90 },
  { title: '影响数', dataIndex: 'affectedUserCount', width: 90 },
  { title: '最近发生', dataIndex: 'lastSeenAt', width: 180, render: formatDateTime },
]

export function IssuesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { appId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status') ?? ''
  const page = positiveInt(searchParams.get('page'))
  const filters: IssueFilters = {
    status: status || undefined,
    environment: searchParams.get('environment') || undefined,
    release: searchParams.get('release') || undefined,
    query: searchParams.get('query') || undefined,
    sort: (searchParams.get('sort') as IssueFilters['sort']) || 'lastSeen',
  }

  // React vs Vue: URLSearchParams 不是响应式对象；每次都创建新实例并交给 setter，路由才会更新。
  const updateFilter = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setSearchParams(next)
  }

  const issuesQuery = useQuery({
    // React Query 只根据 queryKey 判断缓存身份，所有筛选值都必须显式放入 key。
    queryKey: ['issues', appId, filters, page],
    queryFn: () => listIssues(Number(appId), filters, page),
    enabled: Number.isFinite(Number(appId)),
  })

  return (
    <>
      <div className="page-heading"><h1>错误</h1><p>按指纹聚合同类异常，并进入详情查看错误发生前的上下文。</p></div>
      <div className="table-toolbar issue-toolbar">
        <Segmented
          aria-label="错误状态"
          value={status}
          options={[
            { label: '全部', value: '' },
            { label: '待处理', value: 'unresolved' },
            { label: '处理中', value: 'resolving' },
            { label: '已回归', value: 'regressed' },
            { label: '已解决', value: 'resolved' },
            { label: '已忽略', value: 'ignored' },
          ]}
          onChange={(value) => updateFilter('status', value)}
        />
        <div className="filter-row">
          <Input.Search
            key={`query-${filters.query ?? ''}`}
            aria-label="搜索错误"
            allowClear
            defaultValue={filters.query}
            placeholder="错误标题或类型"
            prefix={<SearchOutlined />}
            onSearch={(value) => updateFilter('query', value.trim())}
          />
          <Input
            key={`environment-${filters.environment ?? ''}`}
            aria-label="环境"
            defaultValue={filters.environment}
            placeholder="环境"
            onPressEnter={(event) => updateFilter('environment', event.currentTarget.value.trim())}
          />
          <Input
            key={`release-${filters.release ?? ''}`}
            aria-label="版本"
            defaultValue={filters.release}
            placeholder="Release"
            onPressEnter={(event) => updateFilter('release', event.currentTarget.value.trim())}
          />
          <Select
            aria-label="排序"
            value={filters.sort}
            options={[
              { label: '最近发生', value: 'lastSeen' },
              { label: '首次发生', value: 'firstSeen' },
              { label: '事件最多', value: 'events' },
            ]}
            onChange={(value) => updateFilter('sort', value === 'lastSeen' ? undefined : value)}
          />
        </div>
      </div>
      {issuesQuery.isError ? <Alert type="error" showIcon title="错误列表加载失败" description="请确认后端已启动并完成 V3 数据库迁移。" /> : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={issuesQuery.data?.items}
          loading={issuesQuery.isPending}
          scroll={{ x: 900 }}
          onRow={(issue) => {
            const openIssue = () => navigate(`/apps/${appId}/issues/${issue.id}`, {
              state: { from: `${location.pathname}${location.search}` },
            })
            return {
              role: 'button',
              tabIndex: 0,
              onClick: openIssue,
              onKeyDown: (event) => {
                if (event.key === 'Enter') openIssue()
              },
            }
          }}
          rowClassName="clickable-row"
          pagination={{
            current: page,
            pageSize: issuesQuery.data?.pageSize ?? 20,
            total: issuesQuery.data?.total,
            showSizeChanger: false,
            onChange: (nextPage) => {
              const next = new URLSearchParams(searchParams)
              if (nextPage > 1) next.set('page', String(nextPage))
              else next.delete('page')
              setSearchParams(next)
            },
          }}
        />
      )}
    </>
  )
}

function positiveInt(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}
