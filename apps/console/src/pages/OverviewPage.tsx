import { useQuery } from '@tanstack/react-query'
import { Alert, Card, Tag } from 'antd'
import axios from 'axios'

interface HealthResponse { status: string; service: string }

const metrics = [
  ['错误事件', '--'],
  ['受影响用户', '--'],
  ['页面访问', '--'],
  ['请求成功率', '--'],
]

export function OverviewPage() {
  const healthQuery = useQuery({
    queryKey: ['server-health'],
    queryFn: async () => (await axios.get<HealthResponse>('/api/v1/health')).data,
  })

  return (
    <>
      <div className="page-heading"><h1>总览</h1><p>真实指标将在 M1 数据上报闭环完成后接入。</p></div>
      <div className="metric-grid">
        {metrics.map(([label, value]) => (
          <Card key={label} size="small"><div className="metric-label">{label}</div><div className="metric-value">{value}</div></Card>
        ))}
      </div>
      <Card title="系统连接">
        {healthQuery.isPending && <Tag>检查中</Tag>}
        {healthQuery.isSuccess && <div className="status-row"><Tag color="success">正常</Tag><span>{healthQuery.data.service}</span></div>}
        {healthQuery.isError && (
          <Alert title="API 暂不可用" description="启动 Spring Boot 服务后，本页会显示健康状态。" type="warning" showIcon />
        )}
      </Card>
    </>
  )
}
