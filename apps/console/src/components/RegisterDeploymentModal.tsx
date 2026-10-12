import { useMutation } from '@tanstack/react-query'
import { Alert, Form, Input, Modal } from 'antd'
import { apiErrorMessage } from '../api/http'
import { registerDeployment } from '../api/releases'

interface RegisterDeploymentModalProps {
  applicationId: number
  releaseId: number
  finalizedAt: number
  onClose: () => void
  onRegistered: () => Promise<void>
}

function localDateTime(timestamp: number) {
  const date = new Date(timestamp)
  return new Date(timestamp - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, -1)
}

export function RegisterDeploymentModal({
  applicationId,
  releaseId,
  finalizedAt,
  onClose,
  onRegistered,
}: RegisterDeploymentModalProps) {
  const [form] = Form.useForm<{ deployedAt: string }>()
  const mutation = useMutation({
    mutationFn: ({ deployedAt }: { deployedAt: string }) =>
      registerDeployment(
        applicationId,
        releaseId,
        new Date(deployedAt).getTime(),
      ),
    onSuccess: async () => {
      // React vs Vue: 写请求不会自动更新查询缓存；等父页面刷新版本详情后再关闭弹窗。
      await onRegistered()
      onClose()
    },
  })
  return (
    <Modal
      title="登记首次部署"
      open
      okText="登记"
      cancelText="取消"
      okButtonProps={{ 'aria-label': '提交首次部署登记' }}
      cancelButtonProps={{ disabled: mutation.isPending }}
      confirmLoading={mutation.isPending}
      closable={!mutation.isPending}
      keyboard={!mutation.isPending}
      mask={{ closable: !mutation.isPending }}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <p className="text-sm text-[#667085]">首次部署时间登记后不可修改。</p>
      {mutation.isError && (
        <Alert
          className="mb-4"
          type="error"
          showIcon
          title={apiErrorMessage(mutation.error)}
        />
      )}
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ deployedAt: localDateTime(Date.now()) }}
        onFinish={(values) => mutation.mutate(values)}
      >
        <Form.Item
          name="deployedAt"
          label="首次部署时间"
          rules={[
            { required: true, message: '请选择首次部署时间' },
            {
              validator: (_, value: string | undefined) => {
                const timestamp = new Date(value ?? '').getTime()
                return Number.isSafeInteger(timestamp) &&
                  timestamp >= finalizedAt &&
                  timestamp <= Date.now() + 60_000
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error('不能早于封存时间或超过当前时间一分钟'),
                    )
              },
            },
          ]}
        >
          <Input
            type="datetime-local"
            step="0.001"
            disabled={mutation.isPending}
            className="w-full min-w-0"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
