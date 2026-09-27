import { useState } from 'react'
import { init } from '@traceflow/web-sdk'
import './App.css'

const traceFlow = init({
  appKey: 'tf_app_demo_web',
  endpoint: 'http://localhost:8080/api/v1/events/batch',
  environment: 'development',
  release: 'demo-web@0.1.0',
})

function App() {
  const [batchId, setBatchId] = useState('尚未创建')

  function prepareBatch() {
    // React vs Vue: useState 返回当前值和 setter；直接给 batchId 赋值不会触发 React 重新渲染。
    setBatchId(traceFlow.createEmptyBatch().batchId)
  }

  return (
    <main className="demo-shell">
      <header><span className="eyebrow">TraceFlow Demo</span><h1>监控事件实验台</h1><p>M1 会在这里加入可重复触发的错误、Promise 和网络请求场景。</p></header>
      <section className="demo-panel">
        <div><span className="label">协议版本</span><strong>v{traceFlow.schemaVersion}</strong></div>
        <div><span className="label">最近批次 ID</span><code>{batchId}</code></div>
        <button type="button" onClick={prepareBatch}>创建测试批次</button>
      </section>
    </main>
  )
}

export default App
