import axios from 'axios'

export interface Application {
  id: number
  name: string
  appKey: string
  platform: string
  allowedOrigins: string[]
  retentionDays: number
  status: string
  createdAt: number
}

export interface Issue {
  id: number
  title: string
  errorType: string
  status: 'unresolved' | 'resolving' | 'resolved' | 'ignored'
  level: string
  firstSeenAt: number
  lastSeenAt: number
  eventCount: number
  affectedUserCount: number
}

export interface HttpEvent {
  id: number
  eventId: string
  occurredAt: number
  environment: string
  releaseName?: string
  pageUrl: string
  method: string
  url: string
  status?: number
  durationMs: number
  outcome: 'success' | 'failure'
}

export interface PagedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export async function listApplications() {
  return (await axios.get<{ items: Application[]; total: number }>('/api/v1/applications')).data.items
}

export async function listIssues(applicationId: number, status: string, page: number) {
  return (
    await axios.get<PagedResponse<Issue>>('/api/v1/issues', {
      params: { applicationId, status: status || undefined, page },
    })
  ).data
}

export async function listHttpEvents(applicationId: number, outcome: string, page: number) {
  return (
    await axios.get<PagedResponse<HttpEvent>>('/api/v1/http-events', {
      params: { applicationId, outcome: outcome || undefined, page },
    })
  ).data
}
