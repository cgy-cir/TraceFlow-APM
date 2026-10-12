import {
  BugOutlined,
  DashboardOutlined,
  FundProjectionScreenOutlined,
  GlobalOutlined,
  SettingOutlined,
  TeamOutlined,
  TagsOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Layout, Menu, Select, Tooltip, Typography } from 'antd'
import { useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { listApplications } from '../api/client'
import { AccountMenu } from '../components/AccountMenu'
import { CreateApplicationModal } from '../components/CreateApplicationModal'
import { useCurrentUser } from '../hooks/useCurrentUser'

import '../App.css'

const { Header, Content, Sider } = Layout

const items = [
  { key: 'overview', icon: <DashboardOutlined />, label: '总览' },
  { key: 'issues', icon: <BugOutlined />, label: '错误' },
  { key: 'network', icon: <GlobalOutlined />, label: '请求' },
  { key: 'performance', icon: <FundProjectionScreenOutlined />, label: '性能' },
  { key: 'releases', icon: <TagsOutlined />, label: '版本' },
  { key: 'settings', icon: <SettingOutlined />, label: '设置' },
]

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { appId = '' } = useParams()
  const pathSegments = location.pathname.split('/')
  const selectedKey =
    location.pathname === '/users' ? 'users' : pathSegments[3] || 'overview'
  const applicationsQuery = useQuery({
    queryKey: ['applications'],
    queryFn: listApplications,
  })
  const { data: user } = useCurrentUser()
  const [createOpen, setCreateOpen] = useState(false)
  const navigationItems =
    user?.role === 'admin'
      ? [...items, { key: 'users', icon: <TeamOutlined />, label: '用户' }]
      : items
  const currentAppId = appId || applicationsQuery.data?.[0]?.id

  return (
    <Layout className="app-shell">
      <Sider className="app-sider" theme="light" width={220}>
        <div className="brand">
          <span className="brand-mark">TF</span>TraceFlow
        </div>
        <Menu
          items={navigationItems}
          style={
            { '--nav-count': navigationItems.length } as React.CSSProperties
          }
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) =>
            navigate(
              key === 'users'
                ? '/users'
                : currentAppId
                  ? `/apps/${currentAppId}/${key}`
                  : '/',
            )
          }
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          {selectedKey === 'users' ? (
            <Typography.Text strong>用户管理</Typography.Text>
          ) : (
            <div className="application-selector"><Select
              aria-label="当前应用"
              loading={applicationsQuery.isPending}
              options={applicationsQuery.data?.map((application) => ({
                label: application.name,
                value: application.id,
              }))}
              value={appId ? Number(appId) : undefined}
              onChange={(nextAppId) =>
                navigate(`/apps/${nextAppId}/${selectedKey}`)
              }
              style={{ width: 200, maxWidth: '100%' }}
            />
            {user?.role === 'admin' && <Tooltip title="创建应用">
              <Button aria-label="创建应用" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} />
            </Tooltip>}</div>
          )}
          <AccountMenu />
        </Header>
        <Content className="app-content">
          <div className="content-wrap">
            {/* React vs Vue: Outlet 对应嵌套路由中的 router-view，由父布局决定子页面渲染位置。 */}
            <Outlet />
          </div>
        </Content>
      </Layout>
      {createOpen && <CreateApplicationModal onClose={() => setCreateOpen(false)} onCreated={(application) => {
        setCreateOpen(false)
        navigate(`/apps/${application.id}/settings`)
      }} />}
    </Layout>
  )
}
