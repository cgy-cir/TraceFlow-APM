import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Form, Input, Modal, Tooltip } from 'antd'
import { apiErrorMessage } from '../api/http'
import {
  createRelease,
  type CreateReleaseInput,
  type ReleaseDetail,
} from '../api/releases'

interface CreateReleaseModalProps {
  applicationId: number
  onClose: () => void
  onCreated: (detail: ReleaseDetail) => Promise<void>
}

export function CreateReleaseModal({
  applicationId,
  onClose,
  onCreated,
}: CreateReleaseModalProps) {
  const [form] = Form.useForm<Omit<CreateReleaseInput, 'applicationId'>>()
  const mutation = useMutation({
    mutationFn: (values: Omit<CreateReleaseInput, 'applicationId'>) =>
      createRelease({
        ...values,
        applicationId,
        commitSha: values.commitSha || undefined,
      }),
    onSuccess: onCreated,
  })

  return (
    <Modal
      title="创建版本"
      open
      width={720}
      okText="创建"
      okButtonProps={{ 'aria-label': '提交创建版本' }}
      cancelText="取消"
      cancelButtonProps={{ disabled: mutation.isPending }}
      confirmLoading={mutation.isPending}
      closable={!mutation.isPending}
      mask={{ closable: !mutation.isPending }}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      {mutation.isError && (
        <Alert
          className="mb-4"
          type="error"
          showIcon
          title={apiErrorMessage(mutation.error)}
        />
      )}
      <Form
        name="release-create"
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ artifacts: [{}] }}
        onFinish={(values) => mutation.mutate(values)}
      >
        <Form.Item
          name="releaseName"
          label="版本名称"
          rules={[
            { required: true, whitespace: true, message: '请输入版本名称' },
            { max: 100, message: '版本名称不能超过 100 个字符' },
            {
              validator: (_, value: string | undefined) =>
                !value ||
                (value === value.trim() &&
                  !Array.from(value).some((character) => {
                    const code = character.charCodeAt(0)
                    return code < 32 || code === 127
                  }))
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error('版本名称不能包含首尾空白或控制字符'),
                    ),
            },
          ]}
        >
          <Input maxLength={100} placeholder="demo-web@0.2.0+commit-buildId" />
        </Form.Item>
        <Form.Item
          name="commitSha"
          label="Commit SHA"
          rules={[
            {
              pattern: /^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/,
              message: '请输入完整的 40 或 64 位 commit SHA',
            },
          ]}
        >
          <Input maxLength={64} placeholder="可选" />
        </Form.Item>
        <Form.List
          name="artifacts"
          rules={[
            {
              validator: (_, values: unknown[]) =>
                values?.length >= 1 && values.length <= 100
                  ? Promise.resolve()
                  : Promise.reject(new Error('产物清单须包含 1 到 100 个文件')),
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <>
              {fields.map((field, index) => (
                <section
                  key={field.key}
                  className="mb-4 border-t border-[#e4e7ec] pt-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="m-0 text-sm font-medium">
                      产物 {index + 1}
                    </h3>
                    <Tooltip title="移除产物">
                      <Button
                        type="text"
                        size="small"
                        aria-label={`移除产物 ${index + 1}`}
                        icon={<DeleteOutlined />}
                        disabled={fields.length === 1 || mutation.isPending}
                        onClick={() => remove(field.name)}
                      />
                    </Tooltip>
                  </div>
                  <Form.Item
                    name={[field.name, 'artifactPath']}
                    label="JS 资源路径"
                    rules={[
                      { required: true, message: '请输入完整 JS 资源路径' },
                      { max: 1024, message: '资源路径不能超过 1024 个字符' },
                      {
                        pattern: /^\/[^?#\\\s]*\.js$/,
                        message: '请输入以 / 开头、不含查询参数的 JS 路径',
                      },
                    ]}
                  >
                    <Input placeholder="/assets/index-AbCd.js" />
                  </Form.Item>
                  <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    {(['jsSha256', 'mapSha256'] as const).map((name) => (
                      <Form.Item
                        key={name}
                        name={[field.name, name]}
                        label={
                          name === 'jsSha256' ? 'JS SHA-256' : 'Map SHA-256'
                        }
                        rules={[
                          { required: true, message: '请输入文件摘要' },
                          {
                            pattern: /^[a-f0-9]{64}$/,
                            message: '请输入 64 位小写十六进制摘要',
                          },
                        ]}
                      >
                        <Input maxLength={64} />
                      </Form.Item>
                    ))}
                  </div>
                </section>
              ))}
              <Button
                icon={<PlusOutlined />}
                disabled={fields.length >= 100 || mutation.isPending}
                onClick={() => add({})}
              >
                添加产物
              </Button>
              <Form.ErrorList errors={errors} />
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  )
}
