import axios from 'axios'

export const http = axios.create({ withCredentials: true, timeout: 15_000 })

http.interceptors.request.use(async (config) => {
  if (['post', 'put', 'patch', 'delete'].includes(config.method ?? 'get')) {
    // Fetch a fresh token because login/logout rotate the session's CSRF token.
    const { data } = await http.get<{ headerName: string; token: string }>(
      '/api/v1/auth/csrf',
    )
    config.headers.set(data.headerName, data.token)
  }
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      !error.config?.url?.endsWith('/auth/login')
    ) {
      window.dispatchEvent(new Event('traceflow:unauthorized'))
    }
    return Promise.reject(error)
  },
)

export function apiErrorMessage(
  error: unknown,
  fallback = '操作失败，请稍后重试',
) {
  if (axios.isAxiosError<{ message?: string }>(error))
    return error.response?.data?.message || fallback
  return fallback
}
