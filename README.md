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

## Start MySQL and the API

```bash
docker compose -f deploy/docker-compose.yml up -d mysql
cd server
./mvnw spring-boot:run
```

On Windows use `mvnw.cmd spring-boot:run`. The health endpoint is `http://localhost:8080/api/v1/health`.

## Verify

```bash
npm run build
npm test
cd server
./mvnw test
```

See [项目设计](docs/项目设计.md), [事件协议 v1](docs/事件协议-v1.md), and [数据库迁移 v1](docs/数据库迁移-v1.md) for the current design baseline.
