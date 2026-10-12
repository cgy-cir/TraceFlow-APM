import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Input, Select, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiErrorMessage } from '../api/http'
import {
  listReleases,
  type ReleaseFilters,
  type ReleaseSummary,
} from '../api/releases'
import { CreateReleaseModal } from '../components/CreateReleaseModal'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { formatDateTime } from './issuePresentation'

export function ReleasesPage() {
  const { appId = '' } = useParams()
  const applicationId = Number(appId)
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const [createOpen, setCreateOpen] = useState(false)
  const page = Number(params.get('page') || 1)
  const status = params.get('status')
  const filters: ReleaseFilters = {
    page: Number.isInteger(page) && page > 0 && page <= 10000 ? page : 1,
    query: params.get('query') || undefined,
    status: status === 'draft' || status === 'finalized' ? status : undefined,
  }
  const validApplication =
    Number.isSafeInteger(applicationId) && applicationId > 0
  const query = useQuery({
    queryKey: ['releases', applicationId, filters],
    queryFn: () => listReleases(applicationId, filters),
    enabled: validApplication,
  })
  const updateFilter = (name: string, value?: string) => {
    // React vs Vue: URLSearchParams 不是响应式对象，创建新对象后交给 router setter 才会更新页面和查询。
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    if (name !== 'page') next.delete('page')
    setParams(next)
  }
  const columns: ColumnsType<ReleaseSummary> = [
    {
      title: '版本',
      dataIndex: 'releaseName',
      width: 300,
      render: (name: string, release) => (
        <Link
          className="block truncate"
          title={name}
          to={`/apps/${appId}/releases/${release.id}`}
        >
          {name}
        </Link>
      ),
    },
    {
      title: 'Commit',
      dataIndex: 'commitSha',
      width: 120,
      render: (sha: string | null) =>
        sha ? (
          <Tooltip title={sha}>
            <code>{sha.slice(0, 8)}</code>
          </Tooltip>
        ) : (
          '—'
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: string) => (
        <Tag color={value === 'finalized' ? 'success' : 'default'}>
          {value === 'finalized' ? '已封存' : '草稿'}
        </Tag>
      ),
    },
    {
      title: '产物',
      key: 'artifacts',
      width: 100,
      render: (_, release) =>
        `${release.artifactCount} / ${release.expectedArtifactCount}`,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 190,
      render: formatDateTime,
    },
    {
      title: '首次部署',
      dataIndex: 'deployedAt',
      width: 190,
      render: (value: number | null) =>
        value === null ? '未部署' : formatDateTime(value),
    },
  ]

  if (!validApplication)
    return <Alert type="error" showIcon title="应用 ID 无效" />
  return (
    <div className="monitoring-page flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="m-0 text-2xl font-semibold text-[#101828]">版本</h1>
          <span className="text-sm text-[#667085]">
            {query.data?.total ?? 0} 个版本
          </span>
        </div>
        <div className="flex gap-2">
          <Tooltip title="刷新版本列表">
            <Button
              aria-label="刷新版本列表"
              icon={<ReloadOutlined spin={query.isFetching} />}
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            />
          </Tooltip>
          {currentUser?.role === 'admin' && (
            <Button
              aria-label="创建版本"
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
            >
              创建版本
            </Button>
          )}
        </div>
      </header>
      <div className="grid grid-cols-1 gap-3 border-y border-[#e4e7ec] py-4 sm:grid-cols-[minmax(180px,1fr)_160px]">
        <Input.Search
          key={appId + (filters.query ?? '')}
          aria-label="搜索版本"
          placeholder="版本名称"
          prefix={<SearchOutlined />}
          allowClear
          maxLength={100}
          defaultValue={filters.query}
          onSearch={(value) => updateFilter('query', value || undefined)}
        />
        <Select
          aria-label="版本状态"
          placeholder="全部状态"
          allowClear
          value={filters.status}
          options={[
            { label: '草稿', value: 'draft' },
            { label: '已封存', value: 'finalized' },
          ]}
          onChange={(value) => updateFilter('status', value)}
        />
      </div>
      {query.isError && (
        <Alert type="error" showIcon title={apiErrorMessage(query.error)} />
      )}
      <Table
        tableLayout="fixed"
        rowKey="id"
        columns={columns}
        dataSource={query.data?.items ?? []}
        loading={query.isPending}
        scroll={{ x: 1000 }}
        locale={{ emptyText: '暂无版本' }}
        pagination={{
          current: filters.page,
          pageSize: 20,
          total: query.data?.total,
          showSizeChanger: false,
          onChange: (value) => updateFilter('page', String(value)),
        }}
      />
      {/* React vs Vue: 条件挂载类似 v-if，每次重新打开都会得到新的表单和 mutation 状态。 */}
      {createOpen && (
        <CreateReleaseModal
          key={appId}
          applicationId={applicationId}
          onClose={() => setCreateOpen(false)}
          onCreated={async (detail) => {
            // mutation 不自动修改查询缓存；只失效当前应用的版本列表，再写入已返回的详情。
            await queryClient.invalidateQueries({
              queryKey: ['releases', applicationId],
            })
            queryClient.setQueryData(
              ['release', applicationId, detail.release.id],
              detail,
            )
            setCreateOpen(false)
            navigate(`/apps/${appId}/releases/${detail.release.id}`)
          }}
        />
      )}
    </div>
  )
}
