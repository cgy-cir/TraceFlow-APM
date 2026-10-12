ARG BASE_IMAGE=caddy:2-alpine
FROM ${BASE_IMAGE}
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY apps/console/dist/ /srv/console/
ARG RELEASE_SHA=local
RUN printf '{"commit":"%s"}\n' "$RELEASE_SHA" > /srv/console/version.json
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8081/health || exit 1
