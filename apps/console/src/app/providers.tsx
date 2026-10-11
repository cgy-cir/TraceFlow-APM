import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useEffect, useState, type PropsWithChildren } from 'react'
import { CURRENT_USER_KEY } from '../hooks/useCurrentUser'

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  )

  useEffect(() => {
    // React vs Vue: 返回监听清理函数，作用类似 onUnmounted，也能配合 StrictMode 的额外检查。
    const expire = () => {
      void queryClient.cancelQueries().then(() => {
        queryClient.clear()
        queryClient.setQueryData(CURRENT_USER_KEY, null)
      })
    }
    window.addEventListener('traceflow:unauthorized', expire)
    return () => window.removeEventListener('traceflow:unauthorized', expire)
  }, [queryClient])

  return (
    <ConfigProvider locale={zhCN} button={{ autoInsertSpace: false }} theme={{ token: { borderRadius: 6, colorPrimary: '#176b5b' } }}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConfigProvider>
  )
}
