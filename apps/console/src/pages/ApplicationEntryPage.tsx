import { useQuery } from '@tanstack/react-query'
import { PlusOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Spin } from 'antd'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { listApplications } from '../api/client'
import { apiErrorMessage } from '../api/http'
import { AccountMenu } from '../components/AccountMenu'
import { CreateApplicationModal } from '../components/CreateApplicationModal'
import { useCurrentUser } from '../hooks/useCurrentUser'

export function ApplicationEntryPage() {
  const applicationsQuery = useQuery({ queryKey: ['applications'], queryFn: listApplications })
  const { data: user } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  if (applicationsQuery.isPending) {
    return <div className="entry-state"><Spin description="正在加载应用" /></div>
  }

  if (applicationsQuery.data?.length && !open) {
    return <Navigate to={`/apps/${applicationsQuery.data[0].id}/overview`} replace />
  }

  return (
    <div className="application-entry">
      <header className="application-entry-header">
        <div className="brand"><span className="brand-mark">TF</span>TraceFlow</div>
        <AccountMenu />
      </header>
      <main className="application-entry-content">
        <div className="page-heading"><h1>监控应用</h1></div>
        {applicationsQuery.isError ? (
          <Alert type="error" showIcon title="应用列表加载失败"
            description={apiErrorMessage(applicationsQuery.error, '无法连接服务，请稍后重试')}
            action={<Button aria-label="重试" icon={<ReloadOutlined />} loading={applicationsQuery.isFetching}
              onClick={() => void applicationsQuery.refetch()}>重试</Button>} />
        ) : (
          <div className="application-entry-empty">
            <Empty description={user?.role === 'admin' ? '暂无监控应用' : '暂无监控应用，请联系管理员创建'}>
              {user?.role === 'admin' && <Button aria-label="创建应用" type="primary" icon={<PlusOutlined />}
                onClick={() => setOpen(true)}>创建应用</Button>}
            </Empty>
          </div>
        )}
        {user?.role === 'admin' && <Button aria-label="用户管理" className="mt-4" icon={<TeamOutlined />}
          onClick={() => navigate('/users')}>用户管理</Button>}
      </main>
      {/* React vs Vue: 条件渲染卸载弹窗，下次打开时表单和 mutation 状态都会重新初始化。 */}
      {open && <CreateApplicationModal onClose={() => setOpen(false)} onCreated={(application) => {
        navigate(`/apps/${application.id}/settings`)
      }} />}
    </div>
  )
}
