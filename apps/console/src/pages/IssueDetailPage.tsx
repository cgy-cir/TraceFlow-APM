import { ArrowLeftOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Descriptions, Empty, Listy, Select, Skeleton, Space, Statistic, Tag, Timeline, Typography } from 'antd'
import { useEffect } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  getEvent,
  getIssue,
  listIssueEvents,
  updateIssueStatus,
  type Breadcrumb,
  type IssueStatus,
} from '../api/client'
import { formatDateTime, statusLabels } from './issuePresentation'
import { EventStacktrace } from '../components/EventStacktrace'

const statusTransitions: Record<IssueStatus, IssueStatus[]> = {
  unresolved: ['resolving', 'resolved', 'ignored'],
  resolving: ['unresolved', 'resolved', 'ignored'],
  resolved: ['unresolved', 'ignored'],
  ignored: ['unresolved'],
  regressed: ['resolving', 'resolved', 'ignored'],
}

export function IssueDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { appId = '', issueId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const applicationId = Number(appId)
  const selectedFromUrl = Number(searchParams.get('eventId'))

  const issueQuery = useQuery({
    queryKey: ['issue', applicationId, issueId],
    queryFn: () => getIssue(applicationId, Number(issueId)),
    enabled: Number.isFinite(applicationId) && Number.isFinite(Number(issueId)),
  })
  const eventsQuery = useQuery({
    queryKey: ['issue-events', applicationId, issueId],
    queryFn: () => listIssueEvents(applicationId, Number(issueId)),
    enabled: Number.isFinite(applicationId) && Number.isFinite(Number(issueId)),
  })
  const selectedEventId = Number.isFinite(selectedFromUrl) && selectedFromUrl > 0
    ? selectedFromUrl
    : eventsQuery.data?.items[0]?.id
  const eventQuery = useQuery({
    queryKey: ['event', applicationId, selectedEventId],
    queryFn: () => getEvent(applicationId, selectedEventId!),
    enabled: selectedEventId !== undefined,
  })

  useEffect(() => {
    if (!selectedFromUrl && selectedEventId) {
      const next = new URLSearchParams(searchParams)
      next.set('eventId', String(selectedEventId))
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, selectedEventId, selectedFromUrl, setSearchParams])

  const statusMutation = useMutation({
    mutationFn: (status: IssueStatus) => updateIssueStatus(applicationId, Number(issueId), status),
    onSuccess: async () => {
      // React Query mutation 不会像 Vue 响应式对象一样自动改列表，因此显式失效相关缓存。
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['issue', applicationId, issueId] }),
        queryClient.invalidateQueries({ queryKey: ['issues', String(applicationId)] }),
      ])
    },
  })

  if (issueQuery.isPending) return <Skeleton active paragraph={{ rows: 8 }} />
  if (issueQuery.isError || !issueQuery.data) {
    return <Alert type="error" showIcon title="错误详情加载失败" description="该 Issue 不存在，或后端尚未加载 M2 接口。" />
  }

  const issue = issueQuery.data
  const event = eventQuery.data
  const device = asRecord(asRecord(event?.context).device)

  return (
    <div className="issue-detail">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate((location.state as { from?: string } | null)?.from ?? `/apps/${appId}/issues`)}
      >返回错误列表</Button>
      <div className="detail-heading">
        <div><Typography.Text type="secondary">{issue.errorType}</Typography.Text><h1>{issue.title}</h1></div>
        <Space wrap>
          <Tag color={issue.status === 'regressed' ? 'warning' : issue.status === 'resolved' ? 'success' : 'error'}>
            {statusLabels[issue.status]}
          </Tag>
          <Select<IssueStatus>
            aria-label="修改 Issue 状态"
            loading={statusMutation.isPending}
            placeholder="修改状态"
            value={undefined}
            options={statusTransitions[issue.status].map((status) => ({ label: statusLabels[status], value: status }))}
            onChange={(status) => statusMutation.mutate(status)}
          />
        </Space>
      </div>
      {statusMutation.isError && <Alert type="error" showIcon title="状态修改失败" closable />}

      <div className="detail-metrics">
        <Statistic title="事件总数" value={issue.eventCount} />
        <Statistic title="影响访问者" value={issue.affectedUserCount} />
        <Statistic title="首次发生" value={formatDateTime(issue.firstSeenAt)} />
        <Statistic title="最近发生" value={formatDateTime(issue.lastSeenAt)} />
      </div>

      <div className="detail-grid">
        <aside className="event-rail">
          <h2>同类事件</h2>
          {eventsQuery.isPending ? <Skeleton active title={false} paragraph={{ rows: 3 }} /> : eventsQuery.isError ? (
            <Alert type="error" showIcon title="事件列表加载失败" />
          ) : !eventsQuery.data?.items.length ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无事件" />
          ) : <Listy
            items={eventsQuery.data.items}
            rowKey="id"
            styles={{ item: { padding: 0 } }}
            itemRender={(item) => (
              <button
                type="button"
                data-testid="issue-event"
                data-event-id={item.id}
                aria-pressed={item.id === selectedEventId}
                className={`event-selection-button ${item.id === selectedEventId ? 'selected-event' : ''}`}
                onClick={() => {
                  const next = new URLSearchParams(searchParams)
                  next.set('eventId', String(item.id))
                  setSearchParams(next)
                }}
              >
                <div><strong>{formatDateTime(item.occurredAt)}</strong><span>{item.environment} · {item.releaseName || '无版本'}</span></div>
              </button>
            )}
          />}
        </aside>

        <div className="diagnostic-content">
          {eventQuery.isPending ? <Skeleton active /> : eventQuery.isError || !event ? (
            <Alert type="error" showIcon title="事件详情加载失败" />
          ) : (
            <>
              {/* React vs Vue: key 随事件变化会重新挂载定位面板，重置展开项与视图；不会沿用上一条事件的局部状态。 */}
              <EventStacktrace key={`${applicationId}:${event.id}`} applicationId={applicationId} event={event} />
              <section className="detail-section">
                <h2>发生前的面包屑</h2>
                <BreadcrumbTimeline breadcrumbs={event.breadcrumbs ?? []} />
              </section>
              <section className="detail-section">
                <h2>事件上下文</h2>
                <Descriptions bordered column={{ xs: 1, sm: 1, md: 2 }} size="small">
                  <Descriptions.Item label="发生时间">{formatDateTime(event.occurredAt)}</Descriptions.Item>
                  <Descriptions.Item label="接收时间">{formatDateTime(event.receivedAt)}</Descriptions.Item>
                  <Descriptions.Item label="环境">{event.environment}</Descriptions.Item>
                  <Descriptions.Item label="Release">{event.releaseName || '-'}</Descriptions.Item>
                  <Descriptions.Item label="页面" span={2}>{event.pageUrl}</Descriptions.Item>
                  <Descriptions.Item label="用户">{event.userId || event.anonymousId || '-'}</Descriptions.Item>
                  <Descriptions.Item label="会话">{event.sessionId}</Descriptions.Item>
                  <Descriptions.Item label="语言">{String(device.language ?? '-')}</Descriptions.Item>
                  <Descriptions.Item label="视口">{device.viewportWidth && device.viewportHeight ? `${device.viewportWidth} × ${device.viewportHeight}` : '-'}</Descriptions.Item>
                </Descriptions>
              </section>
            </>
          )}
          <section className="detail-section">
            <h2>状态记录</h2>
            <Timeline items={issue.statusHistory.map((item) => ({
              content: <div><strong>{statusLabels[item.toStatus]}</strong><span>{formatDateTime(item.changedAt)}{item.reason ? ` · ${item.reason}` : ''}</span></div>,
            }))} />
          </section>
        </div>
      </div>
    </div>
  )
}

function BreadcrumbTimeline({ breadcrumbs }: { breadcrumbs: Breadcrumb[] }) {
  if (breadcrumbs.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该事件没有面包屑" />
  return <Timeline items={breadcrumbs.map((breadcrumb) => ({
    color: breadcrumb.level === 'error' ? 'red' : breadcrumb.level === 'warning' ? 'orange' : 'blue',
    content: (
      <div className="breadcrumb-item">
        <strong>{breadcrumb.message || breadcrumb.category}</strong>
        <span>{formatDateTime(breadcrumb.timestamp)} · {breadcrumb.category}</span>
        {breadcrumb.data && <code>{JSON.stringify(breadcrumb.data)}</code>}
      </div>
    ),
  }))} />
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
