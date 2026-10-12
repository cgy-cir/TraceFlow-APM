import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Form, Input, Modal } from "antd";
import { createApplication, type Application } from "../api/client";
import { apiErrorMessage } from "../api/http";

interface Props {
  onClose: () => void;
  onCreated: (application: Application) => void;
}

function parseOrigins(value: string) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length || lines.length > 20)
    throw new Error("请输入 1 到 20 个 Origin，每行一个");
  return [
    ...new Set(
      lines.map((line) => {
        let url: URL;
        try {
          url = new URL(line);
        } catch {
          throw new Error("Origin 格式不正确");
        }
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          url.pathname !== "/" ||
          line.length > 2048
        ) {
          throw new Error(
            "Origin 只能包含 http(s) 协议、域名和端口，不能包含路径或参数",
          );
        }
        return url.origin;
      }),
    ),
  ];
}

export function CreateApplicationModal({ onClose, onCreated }: Props) {
  const [form] = Form.useForm<{ name: string; origins: string }>();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: { name: string; origins: string }) =>
      createApplication({
        name: values.name.trim(),
        allowedOrigins: parseOrigins(values.origins),
      }),
    onSuccess: async (application) => {
      // React vs Vue: mutation 不会自动更新查询缓存；先失效应用列表，再导航到服务端返回的真实 ID。
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
      onCreated(application);
    },
  });

  return (
    <Modal
      title="创建应用"
      open
      okText="创建"
      cancelText="取消"
      okButtonProps={{ "aria-label": "提交创建应用" }}
      cancelButtonProps={{ disabled: mutation.isPending }}
      confirmLoading={mutation.isPending}
      closable={!mutation.isPending}
      mask={{ closable: !mutation.isPending }}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      {mutation.isError && (
        <Alert
          className="mb-4"
          type="error"
          showIcon
          title={apiErrorMessage(mutation.error)}
        />
      )}
      <Form
        name="application-create"
        form={form}
        layout="vertical"
        requiredMark={false}
        disabled={mutation.isPending}
        onFinish={(values) => mutation.mutate(values)}
      >
        <Form.Item
          name="name"
          label="应用名称"
          rules={[
            { required: true, whitespace: true, message: "请输入应用名称" },
            { max: 100, message: "应用名称不能超过 100 个字符" },
          ]}
        >
          <Input maxLength={100} placeholder="Demo Web" />
        </Form.Item>
        <Form.Item
          name="origins"
          label="允许的 Origin"
          rules={[
            {
              validator: (_, value: string | undefined) => {
                try {
                  parseOrigins(value ?? "");
                  return Promise.resolve();
                } catch (error) {
                  return Promise.reject(error);
                }
              },
            },
          ]}
        >
          <Input.TextArea
            rows={3}
            placeholder="https://demo.revengedog.online"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
