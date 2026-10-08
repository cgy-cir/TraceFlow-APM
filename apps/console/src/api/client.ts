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
  status: IssueStatus
  level: string
  firstSeenAt: number
  lastSeenAt: number
  eventCount: number
  affectedUserCount: number
  regressionCount: number
}

export type IssueStatus = 'unresolved' | 'resolving' | 'resolved' | 'ignored' | 'regressed'

export interface StatusHistory {
  id: number
  fromStatus?: IssueStatus
  toStatus: IssueStatus
  changeType: 'created' | 'manual' | 'regression' | 'migration'
  reason?: string
  changedBy?: number
  changedAt: number
}

export interface Breadcrumb {
  timestamp: number
  category: 'navigation' | 'ui.click' | 'http' | 'console' | 'custom'
  level: 'debug' | 'info' | 'warning' | 'error'
  message?: string
  data?: Record<string, string | number | boolean | null>
}

export interface ErrorEventSummary {
  id: number
  eventId: string
  occurredAt: number
  environment: string
  releaseName?: string
  pageUrl: string
  pagePath: string
  userId?: string
  anonymousId?: string
  sessionId: string
}

export interface EventDetail extends ErrorEventSummary {
  issueId: number
  receivedAt: number
  traceId?: string
  errorName: string
  errorMessage: string
  payload: Record<string, unknown>
  context: Record<string, unknown>
  breadcrumbs?: Breadcrumb[]
}

export interface IssueDetail extends Issue {
  fingerprint: string
  fingerprintVersion: number
  statusChangedAt: number
  resolvedAt?: number
  lastRegressedAt?: number
  latestEvent?: EventDetail
  statusHistory: StatusHistory[]
}

export interface IssueFilters {
  status?: string
  environment?: string
  release?: string
  userId?: string
  query?: string
  sort?: 'lastSeen' | 'firstSeen' | 'events'
  from?: number
  to?: number
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

export interface PerformanceFilters {
  from: number
  to: number
  environment?: string
  release?: string
  pagePath?: string
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown'
}

export interface RatingCounts {
  good: number
  needsImprovement: number
  poor: number
}

export interface MetricSummary {
  metric: string
  unit: 'ms' | 'score' | 'bytes'
  sampleCount: number
  p75: number | null
  p95: number | null
  average: number | null
  ratings: RatingCounts
  percentileMethod: 'fixed_histogram_v1'
}

export interface PerformanceSummary {
  from: number
  to: number
  metrics: MetricSummary[]
  percentileMethod: 'fixed_histogram_v1'
}

export interface TrendPoint {
  timestamp: number
  sampleCount: number
  p75: number | null
  p95: number | null
  average: number | null
}

export interface TrendSeries {
  metric: string
  unit: string
  points: TrendPoint[]
}

export interface PerformanceTrends {
  from: number
  to: number
  interval: 'hour' | 'day'
  series: TrendSeries[]
  percentileMethod: 'fixed_histogram_v1'
}

export interface PagePerformance {
  pagePath: string
  sampleCount: number
  lcpP75: number | null
  inpP75: number | null
  clsP75: number | null
  poorRate: number
  lowSample: boolean
}

export interface PerformancePages {
  from: number
  to: number
  items: PagePerformance[]
  lowSampleThreshold: number
  percentileMethod: 'fixed_histogram_v1'
}

export interface ResourceDetail {
  id: number
  eventId: string
  occurredAt: number
  environment: string
  release?: string
  pageUrl: string
  pagePath: string
  url: string
  resourceType: string
  durationMs: number
  transferSize: number | null
  encodedBodySize: number | null
  decodedBodySize: number | null
  nextHopProtocol?: string
  renderBlockingStatus?: string
}

export interface ResourcesResponse {
  from: number
  to: number
  items: ResourceDetail[]
}

export interface OverviewResponse {
  from: number
  to: number
  coreWebVitals: MetricSummary[]
  performanceSampleCount: number
  errorEventCount: number
  httpEventCount: number
  failedHttpEventCount: number
  worstPages: PagePerformance[]
  percentileMethod: 'fixed_histogram_v1'
}

export async function listApplications() {
  return (await axios.get<{ items: Application[]; total: number }>('/api/v1/applications')).data.items
}

export async function listIssues(applicationId: number, filters: IssueFilters, page: number) {
  return (
    await axios.get<PagedResponse<Issue>>('/api/v1/issues', {
      params: { applicationId, ...filters, page },
    })
  ).data
}

export async function getIssue(applicationId: number, issueId: number) {
  return (await axios.get<IssueDetail>(`/api/v1/issues/${issueId}`, { params: { applicationId } })).data
}

export async function listIssueEvents(applicationId: number, issueId: number, page = 1) {
  return (
    await axios.get<PagedResponse<ErrorEventSummary>>(`/api/v1/issues/${issueId}/events`, {
      params: { applicationId, page },
    })
  ).data
}

export async function getEvent(applicationId: number, eventId: number) {
  return (await axios.get<EventDetail>(`/api/v1/events/${eventId}`, { params: { applicationId } })).data
}

export async function updateIssueStatus(
  applicationId: number,
  issueId: number,
  status: IssueStatus,
  reason?: string,
) {
  return (
    await axios.patch<Issue>(`/api/v1/issues/${issueId}/status`, { applicationId, status, reason })
  ).data
}

export async function listHttpEvents(applicationId: number, outcome: string, page: number) {
  return (
    await axios.get<PagedResponse<HttpEvent>>('/api/v1/http-events', {
      params: { applicationId, outcome: outcome || undefined, page },
    })
  ).data
}

function performanceParams(applicationId: number, filters: PerformanceFilters) {
  return { applicationId, ...filters }
}

export async function getPerformanceSummary(
  applicationId: number,
  filters: PerformanceFilters,
  metrics?: string[],
) {
  return (await axios.get<PerformanceSummary>('/api/v1/performance/summary', {
    params: { ...performanceParams(applicationId, filters), metrics: metrics?.join(',') },
  })).data
}

export async function getPerformanceTrends(
  applicationId: number,
  filters: PerformanceFilters,
  metrics: string[],
  interval: 'hour' | 'day',
) {
  return (await axios.get<PerformanceTrends>('/api/v1/performance/trends', {
    params: { ...performanceParams(applicationId, filters), metrics: metrics.join(','), interval },
  })).data
}

export async function getPerformancePages(applicationId: number, filters: PerformanceFilters, limit = 20) {
  return (await axios.get<PerformancePages>('/api/v1/performance/pages', {
    params: { ...performanceParams(applicationId, filters), limit },
  })).data
}

export async function getResources(applicationId: number, filters: PerformanceFilters, limit = 100) {
  return (await axios.get<ResourcesResponse>('/api/v1/resources', {
    params: { ...performanceParams(applicationId, filters), limit },
  })).data
}

export async function getOverview(applicationId: number, filters: PerformanceFilters) {
  return (await axios.get<OverviewResponse>('/api/v1/overview', {
    params: performanceParams(applicationId, filters),
  })).data
}
