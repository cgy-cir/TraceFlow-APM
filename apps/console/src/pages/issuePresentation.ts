import type { IssueStatus } from '../api/client'

export const statusLabels: Record<IssueStatus, string> = {
  unresolved: '待处理',
  resolving: '处理中',
  resolved: '已解决',
  ignored: '已忽略',
  regressed: '已回归',
}

export function formatDateTime(value?: number) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value))
}
