# M6 生产 Demo 发布

## 1. 前置状态

平台已经部署到 https://apm.revengedog.online，真实 HTTPS 登录成功。生产数据库不会自动创建开发应用；Console 现已补上管理员创建应用入口。没有应用与接口失败分别展示，设置页显示真实应用 ID 和 App Key。

无需新的数据库迁移。Demo 使用现有应用、事件和 V7 版本 / Source Map 表。

## 2. GitHub 配置

在仓库 Settings → Environments → production 增加：

| Secret | 内容 |
| --- | --- |
| TRACEFLOW_UPLOAD_EMAIL | 生产平台管理员邮箱 |
| TRACEFLOW_UPLOAD_PASSWORD | 对应生产平台密码 |

这不是已删除的 bootstrap 环境变量，也不是 MySQL 密码。删除服务器 bootstrap 两行后，管理员仍保存在数据库，可以用其当前密码登录。服务器和 GitHub 的五项 SSH Secrets 沿用平台发布配置。

首轮使用现有管理员；后续建议创建独立的发布管理员并按计划轮换密码。目前尚未实现权限更细的 CI 上传令牌。

密码只进入需要认证的 API 步骤，不进入 Vite 构建环境、不传到服务器文件、不上传为 Actions artifact。App Key 是浏览器端公开的 SDK 应用标识，不能当作保密凭据。

## 3. 一次发布

1. 将选定 commit 推到 main，等待该 commit 最新 push CI 全部成功。
2. 首轮先运行 Deploy platform，发布包含创建应用入口的 Console。
3. 运行 Actions → Deploy Demo → Run workflow，选择 main，填完整 40 位小写 commit SHA。
4. application_id 可留空：流程查找唯一的 Demo Web 应用；不存在则通过 API 创建，allowedOrigins 为 https://demo.revengedog.online。若已经手动创建别名应用，填其真实 ID；不存在、歧义、开发 App Key 或 Origin 不匹配时停止，不擅自修改应用。
5. 使用真实生产 App Key 和 HTTPS 上报地址构建一次，environment 固定 production。版本名为 demo-web@<短 SHA>-<run ID>-<attempt>，每次尝试独立，避免同名版本绑定不同文件。
6. 先通过 Session / Cookie + CSRF 上传 JS / Map 并封存版本，然后从同一份 dist-private 生成公共文件。
7. 通过固定 host key 的 SSH 只上传公共目录、文件摘要和部署脚本，服务器验证 SHA-256 后原子切换 current。
8. 公网 HTTPS version.json 和每个本轮公共文件必须匹配，Map 与私有构建清单必须返回 404。
9. 登记当前毫秒时间戳 deployedAt；再用真实 Playwright 浏览器打开 Demo，触发手动错误、刷新 SDK 队列，核对后端入库以及 Source Map 还原到 src/App.tsx。

平台与 Demo 工作流共享 production-release 串行锁，服务器共享 /opt/traceflow/deploy.lock。当前均为手动 workflow_dispatch，不会 push 直接上线。

## 4. 服务器目录

```text
/opt/traceflow/
  .env.production
  deploy.lock
  releases/                         # 平台镜像发布
  demo/
    current -> releases/<attempt>/public
    releases/
      <sha>-<run>-<attempt>/
        deploy-demo.sh
        checksums.sha256
        public/
          index.html
          version.json
          assets/
        SUCCESS 或 FAILED
```

整个 demo 目录已经被 Caddy 只读挂载到 /srv/demo，因此切换相对路径的 current 符号链接不需要重启 Java、MySQL 或 Caddy。Source Map 只存后端数据库和构建 runner 的私有目录，公共目录没有 .map / traceflow-release.json。

发布前将旧 assets 的 hash 文件并入候选目录，同一路径但不同字节会拒绝发布。这样已打开的旧页面仍可加载旧 chunk。当前不做自动清理，目录会增长；后续需制定保留窗口、资源去重和磁盘告警，不能直接清空所有旧资源。

## 5. 验收与失败处理

- 打开 https://demo.revengedog.online，触发 JS Error 或手动错误，再点立即上报。
- Console 选择 Demo Web，在错误页找到 production / 本次 release 的事件，源码堆栈应还原到 src/App.tsx。
- Demo 的 /version.json 给出实际 commit / release / applicationId / releaseId，便于核对，不含密码和 Map。
- Actions 的 demo-publication-evidence 只保存公开版本信息、摘要和桌面 / 手机截图，不保存 Cookie、私钥或 dist-private。

如果上传或封存失败，不切换公共文件；如果公共文件验收失败，current 可能已经切换，FAILED 不代表旧页面仍在运行。登记时间或浏览器 smoke 失败也不会自动撤回已经上线的 Demo。检查失败步骤和服务器 current，再决定修复或人工切回兼容的旧版本，不把镜像回退等同数据库恢复。

一次异常应用创建结果不要盲目重试 POST。重新运行会先查应用列表；遇到多个同名应用时须显式指定 ID。新发布尝试使用新版本名，可能留下已封存但未部署的版本，这是如实保留的发布记录，不自动删除。

M6 仍需完成备份恢复、回退演练及 2GB 主机资源观察；Demo 发布成功不代表整个 M6 已关闭。
