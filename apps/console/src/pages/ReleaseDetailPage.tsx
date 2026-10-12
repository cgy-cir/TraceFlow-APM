import {
  ArrowLeftOutlined,
  ReloadOutlined,
  UploadOutlined,
  DeleteOutlined,
  LockOutlined,
  CalendarOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Descriptions,
  Skeleton,
  Table,
  Tag,
  Tooltip,
  Modal,
} from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiErrorMessage } from '../api/http'
import {
  getRelease,
  listSourceMaps,
  deleteSourceMap,
  finalizeRelease,
  type ReleaseArtifact,
} from '../api/releases'
import { SourceMapUploadModal } from '../components/SourceMapUploadModal'
import { RegisterDeploymentModal } from '../components/RegisterDeploymentModal'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { formatDateTime } from './issuePresentation'

const formatBytes = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1024 / 1024).toFixed(2)} MiB`

export function ReleaseDetailPage() {
  const { appId = '', releaseId = '' } = useParams()
  const applicationId = Number(appId)
  const id = Number(releaseId)
  const { data: currentUser } = useCurrentUser()
  const queryClient = useQueryClient()
  const [uploadTarget, setUploadTarget] = useState<ReleaseArtifact | null>(null)
  const [deploymentOpen, setDeploymentOpen] = useState(false)
  const [modal, contextHolder] = Modal.useModal()
  const valid =
    Number.isSafeInteger(applicationId) &&
    applicationId > 0 &&
    Number.isSafeInteger(id) &&
    id > 0
  const query = useQuery({
    queryKey: ['release', applicationId, id],
    queryFn: () => getRelease(applicationId, id),
    enabled: valid,
  })
  const maps = useQuery({
    queryKey: ['source-maps', applicationId, id],
    queryFn: () => listSourceMaps(applicationId, id),
    enabled: valid && query.isSuccess,
  })
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['release', applicationId, id],
      }),
      queryClient.invalidateQueries({
        queryKey: ['source-maps', applicationId, id],
      }),
      queryClient.invalidateQueries({ queryKey: ['releases', applicationId] }),
      // 补传与封存后，之前缓存的“无法定位”结果也要失效，返回错误详情时才会重新查询。
      queryClient.invalidateQueries({
        queryKey: ['event-stacktrace', applicationId],
      }),
    ])
  }
  const deletion = useMutation({
    mutationFn: (mapId: number) => deleteSourceMap(applicationId, id, mapId),
    onSuccess: refresh,
  })
  const finalization = useMutation({
    mutationFn: () => finalizeRelease(applicationId, id),
    onSuccess: refresh,
  })

  if (!valid) return <Alert type="error" showIcon title="应用或版本 ID 无效" />
  if (query.isPending) return <Skeleton active />
  if (query.isError)
    return (
      <Alert
        type="error"
        showIcon
        title={apiErrorMessage(query.error)}
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      />
    )
  const { release, artifacts } = query.data
  const canWrite = currentUser?.role === 'admin' && release.status === 'draft'
  const canRegisterDeployment =
    currentUser?.role === 'admin' &&
    release.status === 'finalized' &&
    release.deployedAt === null
  const busy = deletion.isPending || finalization.isPending
  return (
    <div className="monitoring-page flex min-w-0 flex-col gap-6">
      {contextHolder}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <Link
            aria-label="版本列表"
            className="mb-3 inline-flex items-center gap-2 text-sm"
            to={`/apps/${appId}/releases`}
          >
            <ArrowLeftOutlined />
            版本列表
          </Link>
          <h1 className="m-0 break-all text-2xl font-semibold text-[#101828]">
            {release.releaseName}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRegisterDeployment && (
            <Button
              aria-label="登记首次部署"
              icon={<CalendarOutlined />}
              onClick={() => setDeploymentOpen(true)}
            >
              登记首次部署
            </Button>
          )}
          <Tooltip title="刷新版本详情">
            <Button
              aria-label="刷新版本详情"
              icon={<ReloadOutlined spin={query.isFetching} />}
              disabled={query.isFetching}
              onClick={() => void refresh()}
            />
          </Tooltip>
        </div>
      </header>
      <Descriptions
        column={{ xs: 1, sm: 2, lg: 3 }}
        items={[
          {
            key: 'status',
            label: '状态',
            children: (
              <Tag
                color={release.status === 'finalized' ? 'success' : 'default'}
              >
                {release.status === 'finalized' ? '已封存' : '草稿'}
              </Tag>
            ),
          },
          {
            key: 'artifacts',
            label: '已上传产物',
            children: `${release.artifactCount} / ${release.expectedArtifactCount}`,
          },
          {
            key: 'size',
            label: 'Map 总量',
            children: formatBytes(release.totalMapBytes),
          },
          {
            key: 'commit',
            label: 'Commit SHA',
            children: release.commitSha ? (
              <code className="break-all">{release.commitSha}</code>
            ) : (
              '未关联'
            ),
          },
          {
            key: 'created',
            label: '创建时间',
            children: formatDateTime(release.createdAt),
          },
          {
            key: 'finalized',
            label: '封存时间',
            children:
              release.finalizedAt === null
                ? '未封存'
                : formatDateTime(release.finalizedAt),
          },
          {
            key: 'deployed',
            label: '首次部署',
            children:
              release.deployedAt === null
                ? '未登记'
                : formatDateTime(release.deployedAt),
          },
        ]}
      />
      {(maps.isError || deletion.isError || finalization.isError) && (
        <Alert
          type="error"
          showIcon
          title={apiErrorMessage(
            deletion.error ?? finalization.error ?? maps.error,
          )}
        />
      )}
      <section className="min-w-0 border-t border-[#e4e7ec] pt-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-base font-semibold text-[#101828]">
            产物清单
          </h2>
          {canWrite && (
            <Button
              aria-label="封存版本"
              icon={<LockOutlined />}
              disabled={
                busy ||
                maps.isPending ||
                maps.isError ||
                maps.data?.length !== artifacts.length
              }
              onClick={() =>
                modal.confirm({
                  title: '封存该版本？',
                  content: '封存后不能新增、替换或删除构建产物。',
                  okText: '封存',
                  cancelText: '取消',
                  onOk: () => finalization.mutateAsync(),
                })
              }
            >
              封存版本
            </Button>
          )}
        </div>
        <Table
          tableLayout="fixed"
          rowKey="artifactPath"
          dataSource={artifacts}
          pagination={false}
          scroll={{ x: canWrite ? 1220 : 1100 }}
          loading={maps.isPending}
          columns={[
            {
              title: 'JS 资源路径',
              dataIndex: 'artifactPath',
              width: 330,
              render: (value: string) => (
                <code className="block truncate" title={value}>
                  {value}
                </code>
              ),
            },
            {
              title: '上传状态',
              key: 'uploaded',
              width: 120,
              render: (_, artifact) =>
                maps.isError ? (
                  '查询失败'
                ) : maps.data?.some(
                    (map) => map.artifactPath === artifact.artifactPath,
                  ) ? (
                  <Tag color="success">已上传</Tag>
                ) : (
                  '待上传'
                ),
            },
            {
              title: '源码内容',
              key: 'coverage',
              width: 130,
              render: (_, artifact) => {
                const map = maps.data?.find(
                  (item) => item.artifactPath === artifact.artifactPath,
                )
                return map
                  ? `${map.sourcesWithContent} / ${map.sourceCount}`
                  : '—'
              },
            },
            ...(canWrite
              ? [
                  {
                    title: '操作',
                    key: 'actions',
                    width: 120,
                    render: (_: unknown, artifact: ReleaseArtifact) => {
                      const map = maps.data?.find(
                        (item) => item.artifactPath === artifact.artifactPath,
                      )
                      return (
                        <div className="flex gap-2">
                          <Tooltip title="上传 JS 与 Map">
                            <Button
                              aria-label={`上传 ${artifact.artifactPath}`}
                              type="text"
                              size="small"
                              icon={<UploadOutlined />}
                              disabled={
                                busy ||
                                Boolean(map) ||
                                maps.isPending ||
                                maps.isError
                              }
                              onClick={() => setUploadTarget(artifact)}
                            />
                          </Tooltip>
                          {map && (
                            <Tooltip title="删除草稿产物">
                              <Button
                                aria-label={`删除 ${artifact.artifactPath}`}
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                disabled={busy}
                                onClick={() =>
                                  modal.confirm({
                                    title: '删除该构建产物？',
                                    content: artifact.artifactPath,
                                    okText: '删除',
                                    cancelText: '取消',
                                    okButtonProps: { danger: true },
                                    onOk: () => deletion.mutateAsync(map.id),
                                  })
                                }
                              />
                            </Tooltip>
                          )}
                        </div>
                      )
                    },
                  },
                ]
              : []),
            {
              title: 'JS SHA-256',
              dataIndex: 'jsSha256',
              width: 260,
              render: (value: string) => (
                <Tooltip title={value}>
                  <code className="block truncate">{value}</code>
                </Tooltip>
              ),
            },
            {
              title: 'Map SHA-256',
              dataIndex: 'mapSha256',
              width: 260,
              render: (value: string) => (
                <Tooltip title={value}>
                  <code className="block truncate">{value}</code>
                </Tooltip>
              ),
            },
          ]}
        />
      </section>
      {uploadTarget && canWrite && (
        <SourceMapUploadModal
          key={`${applicationId}:${id}:${uploadTarget.artifactPath}`}
          applicationId={applicationId}
          releaseId={id}
          artifact={uploadTarget}
          onClose={() => setUploadTarget(null)}
          onUploaded={refresh}
        />
      )}
      {deploymentOpen &&
        canRegisterDeployment &&
        release.finalizedAt !== null && (
          <RegisterDeploymentModal
            key={`${applicationId}:${id}`}
            applicationId={applicationId}
            releaseId={id}
            finalizedAt={release.finalizedAt}
            onClose={() => setDeploymentOpen(false)}
            onRegistered={refresh}
          />
        )}
    </div>
  )
}
