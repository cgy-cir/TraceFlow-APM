import { Form, Input } from 'antd'

export function PasswordFields({ label = '新密码' }: { label?: string }) {
  return (
    <>
      <Form.Item
        name="password"
        label={label}
        rules={[
          { required: true, min: 8, message: '密码至少 8 个字符' },
          {
            validator: (_, value: string) =>
              !value || new TextEncoder().encode(value).length <= 72
                ? Promise.resolve()
                : Promise.reject(new Error('密码不能超过 72 个 UTF-8 字节')),
          },
        ]}
      >
        <Input.Password autoComplete="new-password" maxLength={72} />
      </Form.Item>
      <Form.Item
        name="confirmPassword"
        label="确认密码"
        dependencies={['password']}
        rules={[
          { required: true, message: '请再次输入密码' },
          ({ getFieldValue }) => ({
            validator: (_, value: string) =>
              !value || value === getFieldValue('password')
                ? Promise.resolve()
                : Promise.reject(new Error('两次输入的密码不一致')),
          }),
        ]}
      >
        <Input.Password autoComplete="new-password" maxLength={72} />
      </Form.Item>
    </>
  )
}
