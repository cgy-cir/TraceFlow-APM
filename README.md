# TraceFlow APM

**一个包含自研浏览器 SDK、React 管理台和 Java 服务端的 Web 前端监控平台。**

TraceFlow APM 用于采集网站运行中的错误、网络请求和性能数据，将分散的浏览器事件整理为可查询、可聚合、可定位的问题。项目覆盖从真实网站采集、服务端入库、管理台展示，到生产构建源码定位的完整链路，而不只是一个监控数据看板。

项目包含四部分：与业务框架无关的 Web SDK、React Console、用于主动触发监控场景的 Demo，以及 Spring Boot 服务端。监控数据来自 SDK 的实际采集，不是页面里写死的模拟数据。

## 在线体验

- [Demo：监控事件实验台](https://demo.revengedog.online)
- [Console：监控管理台](https://apm.revengedog.online)

Demo 可以公开访问，Console 需要有效账号登录；本地开发账号不适用于生产环境。

一次典型演示：在 Demo 点击“手动错误”或“JS Error”，再点击“立即上报”；登录 Console，选择对应应用，在错误详情中查看事件、操作面包屑和还原后的源码位置。

## 项目解决什么问题

| 问题 | 当前实现 |
| --- | --- |
| 用户遇到错误，但开发者难以复现 | 采集错误堆栈、页面、版本、环境和错误前的操作面包屑 |
| 同类错误反复出现，原始事件难以整理 | 按指纹聚合为 Issue，统计次数、影响用户数和发生时间 |
| 问题标记解决后再次出现 | 新事件触发回归状态，并保留状态变更历史 |
| 生产 JS 被压缩，堆栈无法直接对应源码 | 匹配私有 Source Map，还原文件、行列号及代码上下文 |
| 页面变慢，不清楚是交互、加载还是资源问题 | 展示 Web Vitals、导航加载阶段、资源耗时和页面性能排行 |
| 本地跑通，但发布结果缺少验证 | 通过 CI、容器检查和发布后的真实浏览器验收验证核心链路 |

## 主要亮点

### 1. 框架无关的浏览器采集 SDK

- 使用 TypeScript 实现，SDK 本身不依赖 React 或 Vue，业务网站通过 `init()` 配置应用标识和上报地址接入。
- 捕获运行时 JS 错误、未处理的 Promise 拒绝、资源加载错误，支持手动 `captureException()`。
- 包装 Fetch / XMLHttpRequest，记录方法、地址、状态码、耗时和结果；排除采集器自身请求，避免自我监控。
- 采集页面访问和 SPA 导航，记录导航、点击、请求及自定义面包屑。
- 使用有界队列、批量发送、有限重试和页面退出时的 `sendBeacon`；队列拥塞时优先保留高优先级事件。
- 提供采样、采集开关和 `destroy()` 清理能力，对部分敏感 URL 参数进行脱敏。

### 2. 从原始错误到可处理的问题

服务端根据错误类型、归一化消息和堆栈位置计算指纹，将同类事件聚合为 Issue。归一化规则会处理部分动态数字、UUID 和十六进制标识，降低动态内容造成的错误列表噪声。

问题支持未解决、处理中、已解决、已忽略和回归状态；已解决问题出现符合条件的新事件时自动回归。详情保留原始事件、堆栈、面包屑及状态历史，支持切换不同事件进行诊断。

事件以应用和事件 ID 建立唯一约束，重复上报不会重复计数；批次逐条校验、逐条事务写入，并返回接受 / 拒绝结果。

### 3. 与生产构建绑定的私有源码定位

- 版本绑定完整 JS 资源路径、JS / Map 的 SHA-256 摘要和可选 Commit SHA。
- 支持成对上传 JS / Map、删除草稿产物和封存版本；相同清单可幂等提交，不同产物不能覆盖同名版本。
- 构建一次，先上传并封存私有 Map，再从同一构建生成公共文件，避免线上 JS 与 Map 不一致。
- 根据应用、版本和资源路径还原压缩堆栈，展示源码文件、行列号和有限代码上下文；无法还原的帧保留原始信息和诊断原因。
- 还原结果使用有容量、内存和过期限制的缓存，并限制解析并发。
- Map 保存在服务端，不随公共资源发布；源码还原不修改原始事件及既有问题指纹。

### 4. 有统计口径的性能监控

SDK 基于 `web-vitals` 采集 LCP、INP、CLS、FCP、TTFB，并结合 Navigation Timing 和 Resource Timing 记录加载阶段和资源耗时。

服务端按小时、指标和维度聚合数据，通过事务内的检查点更新与聚合写入避免重复累加。Console 支持指标概览、趋势、页面排行、导航阶段和资源明细，以及时间、环境、版本、页面和设备类型筛选。

P75 / P95 使用固定直方图计算近似值，界面标注统计方法及低样本提示，不将近似结果包装为精确分位数。事件发生时间、接收时间和版本时间均使用 Unix 毫秒时间戳，由界面转换显示。

### 5. 可重复的工程验证与发布

- 使用 npm Workspaces 管理 Console、Demo、SDK 和共享事件协议，前后端在同一仓库协作。
- GitHub Actions 在 push / pull request 时执行 lint、构建、单元测试、MySQL 集成检查、Playwright 回归和生产容器检查。
- 平台发布要求选定 main 上已通过 CI 的完整 Commit SHA，镜像在 GitHub runner 构建，通过 GHCR 分发，服务器按 digest 拉取。
- Demo 发布核对应用、上传 Map、封存版本、验证公共文件摘要并登记首次部署时间；通过目录指针切换资源，保留旧 hash 文件供旧页面使用。
- 发布后用真实浏览器制造错误，校验 SDK 上报、事件入库及 `App.tsx` 源码还原，而不只检查健康接口。

**当前发布工作流需要手动触发，push 不会直接上线。** 平台和 Demo 发布都有串行锁，生产入口由 Caddy 提供 HTTPS。

## 已实现的功能与效果

| 模块 | 可以实现的效果 |
| --- | --- |
| 总览 | 查看核心性能指标、错误事件数、请求及失败请求数、性能趋势和较差页面 |
| 错误 | 聚合列表、筛选、排序分页、状态流转、自动回归、事件切换和面包屑诊断 |
| 请求 | 查询 Fetch / XHR 事件，查看地址、方法、状态码、耗时和结果 |
| 性能 | Web Vitals、P75 / P95、趋势、页面排行、导航加载阶段和资源明细 |
| 版本 | 创建版本、上传及删除草稿 Map、封存产物、查看清单和登记首次部署时间 |
| 源码定位 | 切换原始 / 源码堆栈，查看还原位置和代码上下文 |
| 应用 | 管理员创建应用、配置允许的 Origin、切换应用并查看真实应用 ID / App Key |
| 用户 | 登录、退出、修改密码；管理员创建和编辑用户、禁用账号、重置密码；成员只读访问受支持页面 |
| Demo | 主动触发手动错误、JS / Promise 错误、Fetch / XHR 200 / 404、慢交互和布局偏移 |

认证采用 **Session + Cookie**。管理接口有角色权限校验，写操作使用 CSRF 校验；生产 Cookie 配置 Secure / HttpOnly。SDK 上报按应用标识和请求 Origin 校验，不需要把 Console 管理账号提供给业务网站。

## 技术栈

| 层次 | 主要技术 | 用途 |
| --- | --- | --- |
| Console | React 19、TypeScript 5.8、React Router 7 | 函数组件、类型约束和路由 |
| 服务端状态 | TanStack Query 5、Axios | 请求、查询缓存、条件查询、mutation 和缓存失效 |
| 界面与图表 | Ant Design 6、Tailwind CSS 4、ECharts 6 | 管理控件、布局样式和监控图表 |
| SDK | TypeScript、web-vitals 6、浏览器原生 API | 错误、请求、导航、性能与资源采集 |
| 前端工程 | Vite 6、npm Workspaces、ESLint | 构建、工作区管理和代码检查 |
| 服务端 | Spring Boot 4.1、Spring Web MVC、Java | 采集、查询、业务状态和源码定位 |
| 数据与迁移 | MySQL 8.4、MyBatis-Plus 3.5、JdbcTemplate、Flyway | 持久化、聚合查询和版本化数据库迁移 |
| 认证 | Spring Security、BCrypt、Session / Cookie、CSRF | 登录、角色权限、密码存储和请求校验 |
| Source Map | Google Closure Compiler 的 Source Map 解析能力、SHA-256 | 位置还原和产物一致性校验 |
| 测试 | Vitest、JUnit / Mockito、Playwright | 单元测试、端到端回归和发布验收 |
| 部署 | Docker / Compose、Caddy、GitHub Actions、GHCR、SSH | 容器化运行、HTTPS、CI 与发布 |

Java 编译目标为 17；CI 和生产运行镜像使用 Java 21。技术栈表按实际业务代码使用情况列出。

## 核心链路

```text
业务网站 / Demo
  -> Web SDK 采集、组装事件、加入队列
  -> 批量上报 /api/v1/events/batch
  -> 校验应用、Origin 和事件协议
  -> MySQL 入库、错误聚合、性能定时聚合
  -> Console 查询和展示

生产错误堆栈
  -> 按应用与 release 找到已封存版本
  -> 按 JS 路径匹配私有 Source Map
  -> 还原源码位置和上下文
```

## 项目结构

```text
apps/console/        React 监控管理台
apps/demo/           监控场景实验台
packages/web-sdk/    框架无关的浏览器 SDK
packages/shared/     TypeScript 事件协议与类型
server/              Spring Boot 服务端与 Flyway 迁移
scripts/             构建、Map 上传、公共产物准备与发布验收
e2e/                 Playwright 端到端测试
deploy/              Compose、Dockerfile、Caddy 与部署检查
.github/workflows/   CI、平台发布与 Demo 发布
docs/                协议、功能、数据库及部署文档
```

## 本地运行与验证

需要 Node.js 20+、npm 10+、JDK 21，以及 Docker / Compose。依赖在仓库根目录安装；Maven Wrapper 在 `server` 目录中。

```powershell
# 根目录：安装依赖、构建共享协议和 SDK、启动 MySQL
npm install
npm run build -w @traceflow/shared
npm run build -w @traceflow/web-sdk
docker compose -f .\deploy\docker-compose.yml up -d mysql

# 单独终端：启动服务端
cd server
.\mvnw.cmd spring-boot:run

# 另外两个终端分别在根目录执行
npm run dev:console
npm run dev:demo
```

Linux / macOS 在 `server` 中使用 `./mvnw spring-boot:run`。

默认地址：Console 为 http://localhost:5173，Demo 为 http://localhost:5174，API 为 http://localhost:18080，本地 MySQL 端口为 3307。

开发环境首次初始化管理员：`local@traceflow.dev` / `TraceFlow@2026`。仅用于本地开发；已修改的密码不会因重启自动重置。生产环境使用独立凭据，不初始化开发账号和开发 Demo 应用。

根目录执行 `npm run lint`、`npm test` 和 `npm run build` 进行检查；MySQL 启动后安装 Playwright Chromium，再执行 `npm run test:e2e`。后端在 `server` 中执行 `.\mvnw.cmd test`，Linux / macOS 使用 `./mvnw test`。部分 MySQL 集成测试需设置 `TRACEFLOW_RUN_DB_TESTS=true`，CI 已单独启用相关检查。

## 设计与操作文档

- [项目设计](docs/项目设计.md) / [事件协议](docs/事件协议-v1.md)
- [错误诊断](docs/M2错误诊断设计.md) / [性能监控](docs/M3性能监控设计.md)
- [用户登录与管理](docs/用户登录与管理.md)
- [版本与源码定位](docs/M4版本与源码定位设计.md) / [源码定位与诊断](docs/M4源码定位与诊断.md)
- [构建产物上传与发布](docs/M4构建产物上传与发布.md) / [验收与演示](docs/M4验收与演示.md)
- [首次上线与手动发布](docs/M6首次上线与手动发布.md) / [生产 Demo 发布](docs/M6生产Demo发布.md)

## 当前边界

- 当前是基于 MySQL 的模块化单体，未接入 Redis、消息队列或分布式追踪系统；没有经过大规模流量压测，不承诺高并发或零丢失上报。
- 性能结果受浏览器能力、采样、跨域资源 Timing 限制和样本量影响；定时聚合存在延迟。
- 尚未实现会话回放、告警通知、组织级租户隔离或完整用户访问漏斗。
- `retentionDays` 目前用于记录和展示配置，尚无按该配置自动清理事件的任务。
- SDK 不采集完整 DOM、输入框内容或请求 / 响应正文；已有脱敏规则不等于对任意业务数据的完整隐私保护。
- Source Map 还原依赖版本、路径和产物匹配，未匹配时提供降级诊断，不保证任意浏览器堆栈都能还原。
- 平台更新允许短暂维护窗口；发布前数据库备份已实现，但恢复、回退演练、异机备份和旧静态资源清理策略仍需完善。

本文描述以当前仓库实现为准，不将设计文档中的后续规划视为已完成功能。
