import { Skeleton } from 'antd'
import { lazy, Suspense } from 'react'
import type { TrendSeries } from '../api/client'

const TrendChart = lazy(() => import('./PerformanceTrendChart').then((module) => ({
  default: module.PerformanceTrendChart,
})))

export function LazyPerformanceTrendChart({ series }: { series: TrendSeries[] }) {
  return (
    <Suspense fallback={<div className="trend-chart-loading"><Skeleton active paragraph={{ rows: 6 }} /></div>}>
      <TrendChart series={series} />
    </Suspense>
  )
}
