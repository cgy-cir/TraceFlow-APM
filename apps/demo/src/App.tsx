import { useEffect, useState } from 'react'
import { init } from '@traceflow/web-sdk'
import './App.css'

const endpoint = import.meta.env.VITE_TRACEFLOW_ENDPOINT ?? 'http://localhost:18080/api/v1/events/batch'
const apiOrigin = new URL(endpoint).origin

const traceFlow = init({
  appKey: 'tf_app_demo_web',
  endpoint,
  environment: 'development',
  release: 'demo-web@0.1.0',
  resourceSampleRate: 1,
})

interface Activity {
  id: number
  label: string
  detail: string
}

let performanceWarmupStarted = false

function App() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [showShiftBanner, setShowShiftBanner] = useState(false)

  useEffect(() => {
    // React vs Vue: effect 对应 onMounted；开发模式 StrictMode 会额外执行一次 setup/cleanup，因此显式守卫副作用。
    if (performanceWarmupStarted) return
    performanceWarmupStarted = true
    void Promise.allSettled([
      fetch(`${apiOrigin}/api/v1/health?source=performance-demo`),
      fetch(`${apiOrigin}/api/v1/applications?source=performance-demo`),
    ])
  }, [])

  function record(label: string, detail: string) {
    // React vs Vue: 数组状态需要创建新引用；不能像 Vue 的响应式数组那样直接 push 后期待界面更新。
    setActivities((current) => [{ id: Date.now(), label, detail }, ...current].slice(0, 6))
  }

  function captureManualError() {
    const orderId = Math.floor(10_000 + Math.random() * 90_000)
    traceFlow.addBreadcrumb({
      category: 'custom',
      level: 'info',
      message: 'Checkout submitted',
      data: { orderId },
    })
    const eventId = traceFlow.captureException(new Error(`Demo checkout ${orderId} failed`))
    record('手动错误', eventId)
  }

  function triggerJavaScriptError() {
    record('JS Error', '已交给 window.onerror 捕获')
    window.setTimeout(() => {
      throw new TypeError('Demo product is undefined')
    }, 0)
  }

  function triggerPromiseError() {
    record('Promise Error', '已交给 unhandledrejection 捕获')
    void Promise.reject(new Error('Demo async payment rejected'))
  }

  async function runFetch(path: string, label: string) {
    try {
      const response = await fetch(`${apiOrigin}${path}`)
      record(label, `${response.status} ${response.statusText}`)
    } catch (error) {
      record(label, error instanceof Error ? error.message : 'network error')
    }
  }

  function runXhr(path: string, label: string) {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', `${apiOrigin}${path}`)
    xhr.addEventListener('loadend', () => record(label, `${xhr.status || 'network error'}`))
    xhr.send()
  }

  async function flush() {
    await traceFlow.flush()
    record('立即上报', '队列刷新完成')
  }

  function blockMainThread() {
    const startedAt = performance.now()
    while (performance.now() - startedAt < 240) {
      Math.sqrt(Math.random() * 10_000)
    }
    record('慢交互', `${Math.round(performance.now() - startedAt)} ms 主线程任务`)
  }

  function triggerLayoutShift() {
    record('布局偏移', '延迟插入横幅')
    window.setTimeout(() => setShowShiftBanner(true), 700)
    window.setTimeout(() => setShowShiftBanner(false), 3_200)
  }

  return (
    <main className="demo-shell">
      {showShiftBanner && <div className="shift-banner" data-traceflow-name="delayed-offer">结算服务临时维护通知</div>}
      <header>
        <div><span className="eyebrow">TraceFlow Demo</span><h1>监控事件实验台</h1></div>
        <div className="connection"><span className="connection-dot" />SDK v{traceFlow.schemaVersion} 已启用</div>
      </header>

      <section className="scenario-section">
        <div className="section-heading"><h2>错误场景</h2><p>生成不同捕获机制的错误事件。</p></div>
        <div className="action-grid">
          <button type="button" onClick={captureManualError}><strong>手动错误</strong><span>captureException</span></button>
          <button type="button" onClick={triggerJavaScriptError}><strong>JS Error</strong><span>window.onerror</span></button>
          <button type="button" onClick={triggerPromiseError}><strong>Promise Error</strong><span>unhandledrejection</span></button>
        </div>
      </section>

      <section className="scenario-section">
        <div className="section-heading"><h2>网络场景</h2><p>验证 Fetch 与 XMLHttpRequest 自动插桩。</p></div>
        <div className="action-grid network-actions">
          <button type="button" onClick={() => void runFetch('/api/v1/health', 'Fetch 成功')}><strong>Fetch 200</strong><span>健康检查</span></button>
          <button type="button" onClick={() => void runFetch('/api/v1/missing', 'Fetch 失败')}><strong>Fetch 404</strong><span>失败响应</span></button>
          <button type="button" onClick={() => runXhr('/api/v1/health', 'XHR 成功')}><strong>XHR 200</strong><span>健康检查</span></button>
          <button type="button" onClick={() => runXhr('/api/v1/missing', 'XHR 失败')}><strong>XHR 404</strong><span>失败响应</span></button>
        </div>
      </section>

      <section className="scenario-section">
        <div className="section-heading"><h2>性能场景</h2><p>触发浏览器可观测的交互延迟与布局变化。</p></div>
        <div className="action-grid performance-actions">
          <button type="button" data-traceflow-name="slow-interaction" onClick={blockMainThread}><strong>慢交互</strong><span>240 ms 主线程任务</span></button>
          <button type="button" data-traceflow-name="layout-shift" onClick={triggerLayoutShift}><strong>布局偏移</strong><span>延迟插入内容</span></button>
          <button type="button" onClick={() => window.location.reload()}><strong>重新采集</strong><span>Navigation 与初始资源</span></button>
        </div>
      </section>

      <section className="activity-section">
        <div className="section-heading"><h2>最近操作</h2><button className="flush-button" type="button" onClick={() => void flush()}>立即上报</button></div>
        {activities.length === 0 ? <p className="empty-state">等待触发测试场景</p> : (
          <ul>{activities.map((activity) => <li key={activity.id}><strong>{activity.label}</strong><code>{activity.detail}</code></li>)}</ul>
        )}
      </section>
    </main>
  )
}

export default App
