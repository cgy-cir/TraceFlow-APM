#!/usr/bin/env bash
set -Eeuo pipefail
image=${1:-traceflow-web-check:local}
node_image=${TRACEFLOW_CHECK_NODE_IMAGE:-node:20-alpine}
suffix="${RANDOM}-$$"
network="traceflow-web-check-$suffix"
web="traceflow-web-check-$suffix"
api="traceflow-api-check-$suffix"
cleanup() {
  docker rm -f "$web" "$api" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create "$network" >/dev/null
docker run -d --name "$api" --network "$network" --network-alias server "$node_image" \
  node -e 'require("node:http").createServer((req,res)=>{res.setHeader("Content-Type","application/json");res.end(JSON.stringify({status:"UP",path:req.url}));}).listen(18080,"0.0.0.0")' >/dev/null
docker run -d --name "$web" --network "$network" \
  -e APM_HOST=http://localhost -e DEMO_HOST=http://demo.localhost -e ACME_EMAIL=check@example.com "$image" >/dev/null
docker exec "$web" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
for _ in {1..30}; do
  if docker exec "$web" wget -q -O /dev/null http://127.0.0.1:8081/health; then break; fi
  sleep 1
done
docker exec "$web" wget -q -O - http://localhost/login | grep -q 'id="root"'
docker exec "$web" wget -q -O - http://localhost/apps/1/overview | grep -q 'id="root"'
docker exec "$web" wget -q -O - http://localhost/api/v1/health | grep -q '"path":"/api/v1/health"'
for url in /assets/missing.js /assets/missing.js.map '/assets/missing.js.map?test=1' /traceflow-release.json /.env /%2eenv /actuator/health; do
  output=$(docker exec "$web" wget -S -O /dev/null "http://localhost$url" 2>&1 || true)
  grep -q '404' <<< "$output" || { printf 'Expected 404: %s\n%s\n' "$url" "$output" >&2; exit 1; }
done
echo 'Web check passed: SPA routes, unchanged API prefix, private-file and missing-asset 404s.'
