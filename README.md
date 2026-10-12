# TraceFlow APM

TraceFlow is a full-stack Web APM project consisting of a browser monitoring SDK, a React operations console, a controllable demo site, and a Spring Boot ingestion service.

## Workspace

```text
apps/console       React management console
apps/demo          Demo site used to generate observable events
packages/web-sdk   Framework-independent browser monitoring SDK
packages/shared    Protocol types shared by TypeScript packages
server             Spring Boot ingestion and query service
deploy             Local infrastructure and deployment assets
docs               Product, protocol, and database design
```

## Requirements

- Node.js 20+ and npm 10+
- JDK 17+
- Docker Desktop or a local MySQL 8 instance

## Start the TypeScript workspace

```bash
npm install
npm run dev:console
npm run dev:demo
```

Console runs on `http://localhost:5173`; Demo runs on `http://localhost:5174`.

## Console styling

The Console uses Ant Design for controls and Tailwind CSS v4 for layout, spacing, and typography.
Tailwind is integrated through `@tailwindcss/vite`; its CSS entry is `apps/console/src/index.css`.
The full Preflight reset is omitted to preserve Ant Design styles. Use complete, static utility class names
in `className` so Tailwind can discover them. After changing Vite plugins, restart the Console dev server.

## Start MySQL and the API

```bash
docker compose -f deploy/docker-compose.yml up -d mysql
cd server
./mvnw spring-boot:run
```

On Windows use `mvnw.cmd spring-boot:run`. The health endpoint is `http://localhost:18080/api/v1/health`.

## Console login

The development administrator is `local@traceflow.dev` with initial password `TraceFlow@2026`.
Restart the API to apply the user migration and authentication configuration. Change the password from
the account menu after signing in. Administrators can manage accounts at `/users`.
See [用户登录与管理](docs/用户登录与管理.md) for roles, Session/CSRF behavior, and production bootstrap settings.

## Release management and source resolution (M4)

The application navigation now includes Releases at `/apps/:appId/releases`. Administrators can create
an immutable release manifest with full JS paths and JS/Map SHA-256 checksums; members can read lists and
details. Identical creates return the existing release; changed manifests return a conflict. Names are
case-sensitive within an application. Restart the API to load the new endpoints; Flyway applies V7.

Release details support paired JS/Map uploads, draft artifact deletion, and immutable finalization.
Use `npm run build:demo:release`, `npm run upload:source-maps`, and `npm run prepare:public` for the same-build
upload and private-map publishing workflow. Error details now resolve matching sealed releases to original
source positions and limited code context, while preserving raw stacks. After publishing the public assets,
administrators can register the immutable first deployment time separately from finalization. All API times
are Unix milliseconds. See [验收与演示](docs/M4验收与演示.md), [源码定位与诊断](docs/M4源码定位与诊断.md), [构建产物上传与发布](docs/M4构建产物上传与发布.md),
[M4 版本与源码定位设计](docs/M4版本与源码定位设计.md), and [数据库迁移 v7](docs/数据库迁移-v7.md).
The MySQL integration tests are opt-in with `TRACEFLOW_RUN_DB_TESTS=true`; CI runs them against MySQL 8.4.

## Production deployment (M6.1)

The initial target is a Hong Kong Ubuntu 22.04 amd64 host with 2 cores and 2 GiB RAM.
Production runs MySQL, a non-root Java container, and a Caddy HTTPS/static gateway. The new
`Deploy platform` workflow is manual and requires an exact main commit with successful CI;
images are built on GitHub runners and deployed by digest over verified SSH. Push alone never deploys.
Production credentials stay in the server environment file and GitHub Environment secrets.
See [首次上线与手动发布](docs/M6首次上线与手动发布.md) and [部署与发布设计](docs/M6部署与发布设计.md).

Production Demo publishing: [生产 Demo 发布](docs/M6生产Demo发布.md). The manual Deploy Demo workflow configures the real application, uploads private Source Maps, atomically publishes public files and verifies real browser reporting.
The first release is Console/API only; create the production application before publishing Demo.
Remote deployment, certificate issuance, backup restore, and rollback still require real acceptance.

## Verify

```bash
npm run build
npm test
npx playwright install chromium
npm run test:e2e
cd server
./mvnw test
```

The Playwright test starts the API, Console, and Demo automatically. MySQL must be running first. On Windows,
an installed Chrome can be reused with `$env:PLAYWRIGHT_CHANNEL='chrome'` before `npm run test:e2e`.

See [项目设计](docs/项目设计.md), [事件协议 v1](docs/事件协议-v1.md), and [数据库迁移 v1](docs/数据库迁移-v1.md) for the current design baseline.
