import { useMutation } from '@tanstack/react-query'
import { Alert, Form, Modal } from 'antd'
import { apiErrorMessage } from '../api/http'
import { resetUserPassword, type ConsoleUser } from '../api/users'
import { PasswordFields } from './PasswordFields'

interface ResetPasswordModalProps {
  user: ConsoleUser
  onClose: () => void
}

export function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const [form] = Form.useForm<{ password: string }>()
  const passwordMutation = useMutation({
    mutationFn: (password: string) => resetUserPassword(user.id, password),
    onSuccess: onClose,
  })

  return (
    <Modal
      title="重置密码"
      open
      okText="重置密码"
      cancelText="取消"
      cancelButtonProps={{ disabled: passwordMutation.isPending }}
      confirmLoading={passwordMutation.isPending}
      closable={!passwordMutation.isPending}
      mask={{ closable: !passwordMutation.isPending }}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <p className="mb-5 break-all text-sm text-[#667085]">{user.email}</p>
      {passwordMutation.isError && (
        <Alert
          className="mb-4"
          type="error"
          showIcon
          title={apiErrorMessage(passwordMutation.error)}
        />
      )}
      <Form
        name="user-password-reset"
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => passwordMutation.mutate(values.password)}
      >
        <PasswordFields />
      </Form>
    </Modal>
  )
}
