import { Empty } from 'antd'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import type { EChartsType } from 'echarts/core'
import type { TrendSeries } from '../api/client'

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const colors = ['#176b5b', '#d97706', '#2563eb', '#b42318', '#7c3aed']

export function PerformanceTrendChart({ series }: { series: TrendSeries[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | null>(null)
  const hasData = series.some((item) => item.points.some((point) => point.sampleCount > 0))

  useEffect(() => {
    if (!containerRef.current) return
    chartRef.current = echarts.init(containerRef.current)
    const observer = new ResizeObserver(() => chartRef.current?.resize())
    observer.observe(containerRef.current)

    // React vs Vue: ECharts 实例放在 ref 中；effect cleanup 相当于 onUnmounted，避免路由切换后残留监听和 Canvas。
    return () => {
      observer.disconnect()
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!chartRef.current) return
    const detectedUnits = [...new Set(series.map((item) => item.unit))]
    const units = detectedUnits.length > 0 ? detectedUnits : ['ms']
    chartRef.current.setOption({
      animationDuration: 240,
      color: colors,
      grid: { left: 52, right: 22, top: 38, bottom: 42 },
      legend: { top: 0, left: 0, itemWidth: 18, itemHeight: 3 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: unknown) => value == null ? '无数据' : String(value),
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: '#d0d5dd' } },
        axisLabel: { color: '#667085', hideOverlap: true },
      },
      yAxis: units.map((unit, index) => ({
        type: 'value',
        name: unit,
        position: index === 0 ? 'left' : 'right',
        axisLabel: { color: '#667085' },
        splitLine: { show: index === 0, lineStyle: { color: '#eaecf0' } },
      })),
      series: series.map((item) => ({
        name: `${item.metric} P75`,
        type: 'line',
        yAxisIndex: Math.max(0, units.indexOf(item.unit)),
        showSymbol: item.points.filter((point) => point.p75 !== null).length <= 48,
        symbolSize: 6,
        connectNulls: false,
        lineStyle: { width: 2 },
        data: item.points.map((point) => [point.timestamp, point.p75]),
      })),
    }, { notMerge: true })
  }, [series])

  return (
    <div className="trend-chart-wrap">
      <div ref={containerRef} className="trend-chart" aria-label="性能指标趋势图" />
      {!hasData && <div className="chart-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前范围暂无性能样本" /></div>}
    </div>
  )
}
