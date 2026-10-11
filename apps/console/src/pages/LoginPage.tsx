import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Form, Input, Spin } from 'antd'
import { Navigate, useSearchParams } from 'react-router-dom'
import { login } from '../api/users'
import { apiErrorMessage } from '../api/http'
import { CURRENT_USER_KEY, useCurrentUser } from '../hooks/useCurrentUser'

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const userQuery = useCurrentUser()
  const returnTo = searchParams.get('returnTo')
  const target =
    returnTo?.startsWith('/') &&
    !returnTo.startsWith('//') &&
    !returnTo.includes('\\') &&
    !returnTo.startsWith('/login')
      ? returnTo
      : '/'
  const mutation = useMutation({
    mutationFn: login,
    onSuccess: async (user) => {
      console.log(user, 'user---')
      await queryClient.cancelQueries()
      queryClient.clear()
      queryClient.setQueryData(CURRENT_USER_KEY, user)
    },
  })
  if (userQuery.isPending)
    return (
      <div className="entry-state">
        <Spin />
      </div>
    )
  if (userQuery.data) return <Navigate to={target} replace />

  return (
    <main className="flex min-h-screen flex-col bg-[#f7f8fa]">
      <header className="border-b border-[#e4e7ec] bg-white">
        <div className="brand">
          <span className="brand-mark">TF</span>TraceFlow APM
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px]">
          <h1 className="m-0 mb-2 text-2xl font-semibold text-[#101828]">
            登录控制台
          </h1>
          <p className="m-0 mb-8 text-sm text-[#667085]">
            使用你的 TraceFlow 账号
          </p>
          {(mutation.isError || userQuery.isError) && (
            <Alert
              className="mb-5"
              type="error"
              showIcon
              title={
                mutation.isError
                  ? apiErrorMessage(mutation.error, '登录失败')
                  : '无法连接登录服务，请检查后端'
              }
            />
          )}
          <Form
            name="login"
            layout="vertical"
            requiredMark={false}
            onFinish={(values: { email: string; password: string }) =>
              mutation.mutate({ ...values, email: values.email.trim() })
            }
          >
            <Form.Item
              name="email"
              label="邮箱"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '请输入有效的邮箱' },
              ]}
            >
              <Input
                size="large"
                prefix={<MailOutlined className="text-[#98a2b3]" />}
                autoComplete="username"
                maxLength={191}
              />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                size="large"
                prefix={<LockOutlined className="text-[#98a2b3]" />}
                autoComplete="current-password"
                maxLength={72}
              />
            </Form.Item>
            <Button
              size="large"
              type="primary"
              htmlType="submit"
              block
              loading={mutation.isPending}
            >
              登录
            </Button>
          </Form>
        </div>
      </div>
    </main>
  )
}
