import { useQuery } from '@tanstack/react-query'
import { Alert, Spin } from 'antd'
import { Navigate } from 'react-router-dom'
import { listApplications } from '../api/client'

export function ApplicationEntryPage() {
  const applicationsQuery = useQuery({ queryKey: ['applications'], queryFn: listApplications })

  if (applicationsQuery.isPending) {
    return <div className="entry-state"><Spin description="正在加载应用" /></div>
  }

  if (applicationsQuery.isError || !applicationsQuery.data.length) {
    return <div className="entry-state"><Alert type="warning" showIcon title="暂时没有可用应用" description="请确认后端服务和 MySQL 已启动。" /></div>
  }

  return <Navigate to={`/apps/${applicationsQuery.data[0].id}/overview`} replace />
}
