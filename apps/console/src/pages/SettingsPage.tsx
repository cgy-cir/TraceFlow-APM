import { Descriptions, Tag } from 'antd'

export function SettingsPage() {
  const items = [
    { key: 'name', label: '应用名称', children: 'Demo Web' },
    { key: 'appKey', label: 'App Key', children: <code>tf_app_demo_web</code> },
    { key: 'schema', label: '协议版本', children: <Tag>v1</Tag> },
  ]

  return (
    <>
      <div className="page-heading"><h1>应用设置</h1><p>当前展示 M0 固定配置，M1 接入应用管理接口。</p></div>
      <Descriptions bordered column={1} items={items} size="small" />
    </>
  )
}
