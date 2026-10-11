import { LockOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Avatar, Button, Dropdown, Form, Input, Modal } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiErrorMessage } from '../api/http'
import { changePassword, logout } from '../api/users'
import { CURRENT_USER_KEY, useCurrentUser } from '../hooks/useCurrentUser'
import { PasswordFields } from './PasswordFields'

export function AccountMenu() {
  const { data: user } = useCurrentUser()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()
  const clearSession = async () => {
    await queryClient.cancelQueries()
    queryClient.clear()
    queryClient.setQueryData(CURRENT_USER_KEY, null)
    navigate('/login', { replace: true })
  }
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: clearSession,
  })
  const passwordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: clearSession,
  })

  return (
    <>
      <Dropdown
        trigger={['click']}
        menu={{
          items: [
            {
              key: 'identity',
              label: (
                <div className="max-w-60">
                  <div className="truncate font-medium">
                    {user?.displayName}
                  </div>
                  <div className="truncate text-xs text-[#667085]">
                    {user?.email}
                  </div>
                </div>
              ),
              disabled: true,
            },
            { type: 'divider' },
            {
              key: 'password',
              icon: <LockOutlined />,
              label: '修改密码',
              onClick: () => {
                form.resetFields()
                passwordMutation.reset()
                setOpen(true)
              },
            },
            {
              key: 'logout',
              icon: <LogoutOutlined />,
              label: '退出登录',
              disabled: logoutMutation.isPending,
              onClick: () => logoutMutation.mutate(),
            },
          ],
        }}
      >
        <Button
          type="text"
          aria-label="账号菜单"
          className="account-menu-button"
          icon={
            <Avatar
              size={26}
              style={{ backgroundColor: '#eaf4f1', color: '#176b5b' }}
              icon={<UserOutlined />}
            />
          }
        >
          <span className="account-display-name">{user?.displayName}</span>
        </Button>
      </Dropdown>
      {logoutMutation.isError && (
        <Alert
          className="account-error"
          type="error"
          showIcon
          title={apiErrorMessage(logoutMutation.error)}
          closable
        />
      )}
      <Modal
        title="修改密码"
        open={open}
        forceRender
        okText="保存并重新登录"
        cancelText="取消"
        confirmLoading={passwordMutation.isPending}
        closable={!passwordMutation.isPending}
        mask={{ closable: !passwordMutation.isPending }}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
      >
        {passwordMutation.isError && (
          <Alert
            className="mb-4"
            type="error"
            showIcon
            title={apiErrorMessage(passwordMutation.error)}
          />
        )}
        <Form
        name="account-password"
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(values: { currentPassword: string; password: string }) =>
            passwordMutation.mutate({
              currentPassword: values.currentPassword,
              password: values.password,
            })
          }
        >
          <Form.Item
            name="currentPassword"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <PasswordFields />
        </Form>
      </Modal>
    </>
  )
}
