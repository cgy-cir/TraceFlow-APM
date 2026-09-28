import { useQuery } from '@tanstack/react-query'
import { Alert, Descriptions, Skeleton, Tag } from 'antd'
import { useParams } from 'react-router-dom'
import { listApplications } from '../api/client'

export function SettingsPage() {
  const { appId = '' } = useParams()
  const applicationsQuery = useQuery({ queryKey: ['applications'], queryFn: listApplications })
  const application = applicationsQuery.data?.find((item) => item.id === Number(appId))

  if (applicationsQuery.isPending) return <Skeleton active />
  if (!application) return <Alert type="warning" showIcon title="没有找到当前应用" />

  const items = [
    { key: 'name', label: '应用名称', children: application.name },
    { key: 'appKey', label: 'App Key', children: <code>{application.appKey}</code> },
    { key: 'platform', label: '平台', children: application.platform },
    { key: 'origins', label: '允许的 Origin', children: application.allowedOrigins.map((origin) => <Tag key={origin}>{origin}</Tag>) },
    { key: 'retention', label: '数据保留', children: `${application.retentionDays} 天` },
    { key: 'schema', label: '协议版本', children: <Tag>v1</Tag> },
  ]

  return (
    <>
      <div className="page-heading"><h1>应用设置</h1><p>查看当前应用用于 SDK 初始化和 Origin 校验的配置。</p></div>
      <Descriptions bordered column={1} items={items} size="small" />
    </>
  )
}
