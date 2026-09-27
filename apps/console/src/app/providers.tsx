import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import { useState, type PropsWithChildren } from 'react'

export function AppProviders({ children }: PropsWithChildren) {
  // React vs Vue: 组件函数会重复执行；useState 的惰性初始化保证 QueryClient 只为本次应用挂载创建一次。
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

  return (
    <ConfigProvider theme={{ token: { borderRadius: 6, colorPrimary: '#176b5b' } }}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConfigProvider>
  )
}
