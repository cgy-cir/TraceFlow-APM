import { BugOutlined, DashboardOutlined, GlobalOutlined, SettingOutlined } from '@ant-design/icons'
import { Layout, Menu, Select, Typography } from 'antd'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import '../App.css'

const { Header, Content, Sider } = Layout

const items = [
  { key: 'overview', icon: <DashboardOutlined />, label: '总览' },
  { key: 'issues', icon: <BugOutlined />, label: '错误' },
  { key: 'network', icon: <GlobalOutlined />, label: '请求' },
  { key: 'settings', icon: <SettingOutlined />, label: '设置' },
]

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { appId = 'demo' } = useParams()
  const pathSegments = location.pathname.split('/')
  const selectedKey = pathSegments[pathSegments.length - 1] || 'overview'

  return (
    <Layout className="app-shell">
      <Sider className="app-sider" theme="light" width={220}>
        <div className="brand"><span className="brand-mark">TF</span>TraceFlow</div>
        <Menu
          items={items}
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) => navigate(`/apps/${appId}/${key}`)}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Select
            aria-label="当前应用"
            options={[{ label: 'Demo Web', value: 'demo' }]}
            value={appId}
            style={{ width: 200 }}
          />
          <Typography.Text type="secondary">M0 工程骨架</Typography.Text>
        </Header>
        <Content className="app-content">
          <div className="content-wrap">
            {/* React vs Vue: Outlet 对应嵌套路由中的 router-view，由父布局决定子页面渲染位置。 */}
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
