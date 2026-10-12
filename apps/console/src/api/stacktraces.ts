import { http } from './http'

export interface StacktraceFrame {
  index: number
  raw: string
  status: 'resolved' | 'unresolved'
  reason: string | null
  generated: {
    functionName: string | null
    filename: string | null
    line: number | null
    column: number | null
  }
  original: {
    functionName: string | null
    filename: string
    line: number
    column: number
    context: { line: number; content: string; isErrorLine: boolean }[]
    contextReason: string | null
  } | null
}

export interface StacktraceResult {
  eventId: number
  releaseName: string | null
  releaseId: number | null
  status: 'resolved' | 'partial' | 'unresolved' | 'not_applicable'
  parserVersion: number
  frames: StacktraceFrame[]
  diagnostics: { code: string; message: string }[]
  truncated: boolean
}

export async function getStacktrace(applicationId: number, eventId: number) {
  return (
    await http.get<StacktraceResult>(`/api/v1/events/${eventId}/stacktrace`, {
      params: { applicationId },
    })
  ).data
}
