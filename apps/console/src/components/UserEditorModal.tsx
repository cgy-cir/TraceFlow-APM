import { useMutation } from '@tanstack/react-query'
import { Alert, Form, Input, Modal, Select } from 'antd'
import { apiErrorMessage } from '../api/http'
import {
  createUser,
  updateUser,
  type ConsoleUser,
  type UserInput,
  type UserStatus,
} from '../api/users'
import { PasswordFields } from './PasswordFields'

interface UserEditorModalProps {
  user: ConsoleUser | null
  currentUserId?: number
  onClose: () => void
  onSaved: () => Promise<void>
}

export function UserEditorModal({
  user,
  currentUserId,
  onClose,
  onSaved,
}: UserEditorModalProps) {
  const [form] = Form.useForm<UserInput & { status: UserStatus }>()
  const saveMutation = useMutation({
    mutationFn: (values: UserInput & { status: UserStatus }) =>
      user
        ? updateUser(user.id, {
            displayName: values.displayName.trim(),
            role: values.role,
            status: values.status,
          })
        : createUser({
            email: values.email.trim(),
            displayName: values.displayName.trim(),
            password: values.password,
            role: values.role,
          }),
    onSuccess: async () => {
      // React vs Vue: 回调 props 类似 emit；调用父组件传入的函数通知保存成功和关闭。
      await onSaved()
      onClose()
    },
  })

  return (
    <Modal
      title={user ? '编辑用户' : '创建用户'}
      open
      okText="保存"
      okButtonProps={{ 'aria-label': '保存用户' }}
      cancelText="取消"
      cancelButtonProps={{ disabled: saveMutation.isPending }}
      confirmLoading={saveMutation.isPending}
      closable={!saveMutation.isPending}
      mask={{ closable: !saveMutation.isPending }}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      {saveMutation.isError && (
        <Alert
          className="mb-4"
          type="error"
          showIcon
          title={apiErrorMessage(saveMutation.error)}
        />
      )}
      <Form
        name="user-editor"
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={user ?? { role: 'member', status: 'active' }}
        onFinish={(values) => saveMutation.mutate(values)}
      >
        <Form.Item
          name="displayName"
          label="姓名"
          rules={[
            { required: true, whitespace: true, message: '请输入姓名' },
            { max: 100, message: '姓名不能超过 100 个字符' },
          ]}
        >
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item
          name="email"
          label="邮箱"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '请输入有效的邮箱' },
          ]}
        >
          <Input disabled={Boolean(user)} maxLength={191} autoComplete="off" />
        </Form.Item>
        <Form.Item name="role" label="角色" rules={[{ required: true }]}>
          <Select
            options={[
              { label: '管理员', value: 'admin' },
              { label: '成员', value: 'member' },
            ]}
            disabled={user?.id === currentUserId}
          />
        </Form.Item>
        {user ? (
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { label: '已启用', value: 'active' },
                { label: '已禁用', value: 'disabled' },
              ]}
              disabled={user.id === currentUserId}
            />
          </Form.Item>
        ) : (
          <PasswordFields label="密码" />
        )}
      </Form>
    </Modal>
  )
}
