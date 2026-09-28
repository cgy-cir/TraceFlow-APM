import { useState } from 'react'
import { init } from '@traceflow/web-sdk'
import './App.css'

const endpoint = import.meta.env.VITE_TRACEFLOW_ENDPOINT ?? 'http://localhost:8080/api/v1/events/batch'
const apiOrigin = new URL(endpoint).origin

const traceFlow = init({
  appKey: 'tf_app_demo_web',
  endpoint,
  environment: 'development',
  release: 'demo-web@0.1.0',
})

interface Activity {
  id: number
  label: string
  detail: string
}

function App() {
  const [activities, setActivities] = useState<Activity[]>([])

  function record(label: string, detail: string) {
    // React vs Vue: 数组状态需要创建新引用；不能像 Vue 的响应式数组那样直接 push 后期待界面更新。
    setActivities((current) => [{ id: Date.now(), label, detail }, ...current].slice(0, 6))
  }

  function captureManualError() {
    const eventId = traceFlow.captureException(new Error('Demo manual checkout failure'))
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

  return (
    <main className="demo-shell">
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
