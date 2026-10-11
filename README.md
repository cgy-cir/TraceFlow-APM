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
