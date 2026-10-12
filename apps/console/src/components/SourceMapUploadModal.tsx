import { useMutation } from '@tanstack/react-query'
import { Alert, Form, Modal } from 'antd'
import { useState } from 'react'
import { apiErrorMessage } from '../api/http'
import { uploadSourceMap, type ReleaseArtifact } from '../api/releases'

interface SourceMapUploadModalProps {
  applicationId: number
  releaseId: number
  artifact: ReleaseArtifact
  onClose: () => void
  onUploaded: () => Promise<void>
}

export function SourceMapUploadModal({
  applicationId,
  releaseId,
  artifact,
  onClose,
  onUploaded,
}: SourceMapUploadModalProps) {
  // React vs Vue: 文件选择通过 setter 保存；直接赋值普通变量不会更新按钮或表单。
  const [javascript, setJavascript] = useState<File | null>(null)
  const [sourceMap, setSourceMap] = useState<File | null>(null)
  const tooLarge =
    (javascript?.size ?? 0) > 5 * 1024 * 1024 ||
    (sourceMap?.size ?? 0) > 5 * 1024 * 1024
  const mutation = useMutation({
    mutationFn: () => {
      if (!javascript || !sourceMap) throw new Error('请选择两个文件')
      return uploadSourceMap(
        applicationId,
        releaseId,
        artifact.artifactPath,
        javascript,
        sourceMap,
      )
    },
    onSuccess: async () => {
      await onUploaded()
      onClose()
    },
  })
  return (
    <Modal
      title="上传构建产物"
      open
      okText="上传"
      cancelText="取消"
      okButtonProps={{
        disabled: !javascript || !sourceMap || tooLarge,
        'aria-label': '提交上传产物',
      }}
      cancelButtonProps={{ disabled: mutation.isPending }}
      confirmLoading={mutation.isPending}
      closable={!mutation.isPending}
      mask={{ closable: !mutation.isPending }}
      onCancel={onClose}
      onOk={() => mutation.mutate()}
    >
      <p className="mb-5 break-all font-mono text-xs text-[#667085]">
        {artifact.artifactPath}
      </p>
      {tooLarge && (
        <Alert
          className="mb-4"
          type="error"
          showIcon
          title="单个文件不能超过 5 MiB"
        />
      )}
      {mutation.isError && (
        <Alert
          className="mb-4"
          type="error"
          showIcon
          title={apiErrorMessage(mutation.error)}
        />
      )}
      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="JavaScript 文件" htmlFor="source-map-js">
          <input
            id="source-map-js"
            className="block w-full min-w-0 text-sm"
            type="file"
            accept=".js"
            disabled={mutation.isPending}
            onChange={(event) => setJavascript(event.target.files?.[0] ?? null)}
          />
        </Form.Item>
        <Form.Item label="Source Map 文件" htmlFor="source-map-map">
          <input
            id="source-map-map"
            className="block w-full min-w-0 text-sm"
            type="file"
            accept=".map,application/json"
            disabled={mutation.isPending}
            onChange={(event) => setSourceMap(event.target.files?.[0] ?? null)}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
