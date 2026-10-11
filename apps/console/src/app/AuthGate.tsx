import { Alert, Button, Spin } from 'antd'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useCurrentUser } from '../hooks/useCurrentUser'

export function AuthGate() {
  const userQuery = useCurrentUser()
  const location = useLocation()
  if (userQuery.isPending)
    return (
      <div className="entry-state">
        <Spin />
      </div>
    )
  if (userQuery.isError)
    return (
      <div className="entry-state">
        <Alert
          type="error"
          showIcon
          title="无法连接登录服务"
          action={
            <Button onClick={() => void userQuery.refetch()}>重试</Button>
          }
        />
      </div>
    )
  if (!userQuery.data)
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    )
  return <Outlet />
}
