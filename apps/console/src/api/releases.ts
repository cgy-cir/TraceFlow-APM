import { http } from './http'
import type { PagedResponse } from './client'

export interface ReleaseArtifact {
  artifactPath: string
  jsSha256: string
  mapSha256: string
}

export interface ReleaseSummary {
  id: number
  applicationId: number
  releaseName: string
  commitSha: string | null
  status: 'draft' | 'finalized'
  expectedArtifactCount: number
  artifactCount: number
  totalMapBytes: number
  createdBy: number
  createdAt: number
  finalizedAt: number | null
  deployedAt: number | null
}

export interface ReleaseDetail {
  release: ReleaseSummary
  artifacts: ReleaseArtifact[]
}

export interface ReleaseFilters {
  query?: string
  status?: ReleaseSummary['status']
  page: number
}

export interface CreateReleaseInput {
  applicationId: number
  releaseName: string
  commitSha?: string
  artifacts: ReleaseArtifact[]
}

export async function listReleases(
  applicationId: number,
  filters: ReleaseFilters,
) {
  return (
    await http.get<PagedResponse<ReleaseSummary>>('/api/v1/releases', {
      params: { applicationId, ...filters },
    })
  ).data
}

export async function getRelease(applicationId: number, releaseId: number) {
  return (
    await http.get<ReleaseDetail>(`/api/v1/releases/${releaseId}`, {
      params: { applicationId },
    })
  ).data
}

export async function createRelease(input: CreateReleaseInput) {
  return (await http.post<ReleaseDetail>('/api/v1/releases', input)).data
}

export async function registerDeployment(
  applicationId: number,
  releaseId: number,
  deployedAt: number,
) {
  return (
    await http.patch<ReleaseDetail>(
      `/api/v1/releases/${releaseId}/deployment`,
      { deployedAt },
      { params: { applicationId } },
    )
  ).data
}

export interface SourceMapSummary {
  id: number
  artifactPath: string
  jsSha256: string
  mapSha256: string
  jsBytes: number
  mapBytes: number
  sourceCount: number
  sourcesWithContent: number
  uploadedBy: number
  uploadedAt: number
}

export async function listSourceMaps(applicationId: number, releaseId: number) {
  return (
    await http.get<{ items: SourceMapSummary[] }>(
      `/api/v1/releases/${releaseId}/source-maps`,
      {
        params: { applicationId },
      },
    )
  ).data.items
}

export async function uploadSourceMap(
  applicationId: number,
  releaseId: number,
  artifactPath: string,
  javascript: File,
  sourceMap: File,
) {
  const data = new FormData()
  data.set('artifactPath', artifactPath)
  data.set('javascript', javascript)
  data.set('sourceMap', sourceMap)
  // 浏览器为 FormData 自动设置 boundary；不要手动把 Content-Type 写成 application/json。
  return (
    await http.post<SourceMapSummary>(
      `/api/v1/releases/${releaseId}/source-maps`,
      data,
      {
        params: { applicationId },
      },
    )
  ).data
}

export async function deleteSourceMap(
  applicationId: number,
  releaseId: number,
  mapId: number,
) {
  await http.delete(`/api/v1/releases/${releaseId}/source-maps/${mapId}`, {
    params: { applicationId },
  })
}

export async function finalizeRelease(
  applicationId: number,
  releaseId: number,
) {
  return (
    await http.post<ReleaseDetail>(
      `/api/v1/releases/${releaseId}/finalize`,
      undefined,
      {
        params: { applicationId },
      },
    )
  ).data
}
