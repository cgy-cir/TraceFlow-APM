import { ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Collapse,
  Empty,
  Segmented,
  Skeleton,
  Tag,
  Tooltip,
} from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { EventDetail } from '../api/client'
import { apiErrorMessage } from '../api/http'
import { getStacktrace, type StacktraceFrame } from '../api/stacktraces'

const labels = {
  resolved: '已还原',
  partial: '部分还原',
  unresolved: '未还原',
  not_applicable: '不适用',
}

export function EventStacktrace({
  applicationId,
  event,
}: {
  applicationId: number
  event: EventDetail
}) {
  const [view, setView] = useState<'source' | 'raw'>('source')
  const query = useQuery({
    queryKey: ['event-stacktrace', applicationId, event.id],
    queryFn: () => getStacktrace(applicationId, event.id),
  })
  const raw = typeof event.payload.stack === 'string' ? event.payload.stack : ''
  const reasonMessage = (code: string | null) =>
    query.data?.diagnostics.find((item) => item.code === code)?.message ?? code
  const position = (frame: StacktraceFrame) => {
    const location = frame.original ?? frame.generated
    return `${location.filename ?? frame.raw ?? '未知帧'}${location.line === null ? '' : `:${location.line}`}${location.column === null ? '' : `:${location.column}`}`
  }
  return (
    <section className="detail-section min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="!m-0">调用栈</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            aria-label="堆栈视图"
            value={view}
            options={[
              { label: '源码堆栈', value: 'source' },
              { label: '原始堆栈', value: 'raw' },
            ]}
            onChange={(value) => setView(value as 'source' | 'raw')}
          />
          <Tooltip title="重新定位源码">
            <Button
              aria-label="重新定位源码"
              size="small"
              icon={<ReloadOutlined spin={query.isFetching} />}
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            />
          </Tooltip>
        </div>
      </div>
      {view === 'raw' ? (
        raw ? (
          <pre className="stack-trace">{raw}</pre>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="该事件没有调用栈"
          />
        )
      ) : (
        <>
          {query.isPending ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : query.isError ? (
            <Alert
              type="warning"
              showIcon
              title="源码定位暂不可用"
              description={apiErrorMessage(query.error)}
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <Tag
                  color={
                    query.data.status === 'resolved'
                      ? 'success'
                      : query.data.status === 'partial'
                        ? 'warning'
                        : 'default'
                  }
                >
                  {labels[query.data.status]}
                </Tag>
                {query.data.releaseId ? (
                  <Link
                    className="break-all"
                    to={`/apps/${applicationId}/releases/${query.data.releaseId}`}
                  >
                    {query.data.releaseName}
                  </Link>
                ) : (
                  <span className="break-all text-[#667085]">
                    {query.data.releaseName || '无版本'}
                  </span>
                )}
              </div>
              {query.data.diagnostics.length > 0 && (
                <Alert
                  className="mb-4"
                  type="info"
                  showIcon
                  title={query.data.diagnostics
                    .map((item) => item.message)
                    .join('；')}
                />
              )}
              {query.data.frames.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    query.data.status === 'not_applicable'
                      ? '该事件不适用源码定位'
                      : '没有可定位的堆栈帧'
                  }
                />
              ) : (
                <Collapse
                  ghost
                  defaultActiveKey={[
                    String(
                      query.data.frames.find((frame) => frame.original)
                        ?.index ?? 0,
                    ),
                  ]}
                  items={query.data.frames.map((frame) => ({
                    key: String(frame.index),
                    label: (
                      <div data-testid="stack-frame" className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                          <strong className="break-all">
                            {frame.original?.functionName ||
                              frame.generated.functionName ||
                              `帧 ${frame.index + 1}`}
                          </strong>
                          <Tag
                            color={
                              frame.status === 'resolved'
                                ? 'success'
                                : 'default'
                            }
                          >
                            {frame.status === 'resolved' ? '已还原' : '未还原'}
                          </Tag>
                        </div>
                        <code className="block break-all text-xs">
                          {position(frame)}
                        </code>
                      </div>
                    ),
                    children: (
                      <div className="min-w-0">
                        <div className="mb-3 break-all font-mono text-xs text-[#667085]">
                          {frame.raw}
                        </div>
                        {frame.reason && (
                          <p className="text-xs text-[#667085]">
                            {reasonMessage(frame.reason)}
                          </p>
                        )}
                        {frame.original &&
                          (frame.original.context.length > 0 ? (
                            <pre
                              data-testid="source-context"
                              className="source-context"
                            >
                              {/* React vs Vue: 源码作为 JSX 文本节点自动转义；不要用 dangerouslySetInnerHTML（类似 v-html）显示上传内容。 */}
                              {frame.original.context.map((line) => (
                                <span
                                  key={line.line}
                                  className={`source-context-line ${line.isErrorLine ? 'source-context-error' : ''}`}
                                  data-error-line={line.isErrorLine}
                                >
                                  <span
                                    className="source-context-number"
                                    aria-hidden="true"
                                  >
                                    {line.line}
                                  </span>
                                  <span>{line.content || ' '}</span>
                                </span>
                              ))}
                            </pre>
                          ) : (
                            <p className="text-xs text-[#667085]">
                              {reasonMessage(frame.original.contextReason)}
                            </p>
                          ))}
                      </div>
                    ),
                  }))}
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
