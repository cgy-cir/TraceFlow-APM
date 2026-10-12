#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

root=/opt/traceflow
candidate=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ $candidate =~ ^/opt/traceflow/releases/[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid release directory' >&2; exit 1; }
[[ $# == 3 ]] || { echo 'Expected registry username and two image digests' >&2; exit 1; }
registry_user=$1
server_image=$2
web_image=$3
export SERVER_IMAGE=$server_image WEB_IMAGE=$web_image
for image in "$server_image" "$web_image"; do
  [[ $image =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]] || { echo 'Images must use GHCR digests' >&2; exit 1; }
done
[[ $registry_user =~ ^[a-zA-Z0-9_-]+$ ]] || exit 1
[[ -f $root/.env.production && ! -L $root/.env.production ]] || { echo 'Missing production environment file' >&2; exit 1; }
[[ $(stat -c '%a' "$root/.env.production") == 600 ]] || { echo 'Production environment must have mode 600' >&2; exit 1; }
for command in docker jq curl flock gzip; do command -v "$command" >/dev/null; done

# One lock covers backup, migration/startup, and external readiness checks.
exec 9>"$root/deploy.lock"
flock -w 5 9 || { echo 'Another deployment is active' >&2; exit 1; }
[[ ! -f $candidate/SUCCESS && ! -f $candidate/FAILED ]] || { echo 'Release attempt already used' >&2; exit 1; }
printf 'SERVER_IMAGE=%s\nWEB_IMAGE=%s\n' "$server_image" "$web_image" > "$candidate/images.env"
compose=(docker compose --project-name traceflow-prod --env-file "$root/.env.production" --env-file "$candidate/images.env" -f "$candidate/compose.production.yml")
config=$("${compose[@]}" config --format json)
apm_host=$(jq -er '.services.web.environment.APM_HOST' <<< "$config")
demo_host=$(jq -er '.services.web.environment.DEMO_HOST' <<< "$config")
for host in "$apm_host" "$demo_host"; do
  [[ $host =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ && $host == *.* && $host != *..* ]] || { echo 'Invalid public hostname' >&2; exit 1; }
done
[[ $apm_host != "$demo_host" ]] || { echo 'Console and Demo need different hostnames' >&2; exit 1; }
for key in MYSQL_PASSWORD MYSQL_ROOT_PASSWORD; do
  password=$(jq -er --arg key "$key" '.services.mysql.environment[$key]' <<< "$config")
  [[ $password =~ ^[a-f0-9]{48,128}$ ]] || { echo 'Database passwords must be 48+ random hex characters' >&2; exit 1; }
done
if ! jq -e '.services.mysql.environment.MYSQL_PASSWORD != .services.mysql.environment.MYSQL_ROOT_PASSWORD' <<< "$config" >/dev/null; then
  echo 'Database application and root passwords must differ' >&2; exit 1
fi
[[ $(jq -r '.services.web.environment.ACME_EMAIL' <<< "$config") != *CHANGE_ME* ]] || { echo 'Set a real certificate email' >&2; exit 1; }
mysql_id=$(docker ps -aq --filter label=com.docker.compose.project=traceflow-prod --filter label=com.docker.compose.service=mysql)
active_admins=0
if [[ -n $mysql_id ]]; then
  [[ $mysql_id != *$'\n'* ]] || { echo 'Unexpected multiple production databases' >&2; exit 1; }
  active_admins=$(docker exec "$mysql_id" sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysql -N -B -uroot traceflow -e "SELECT COUNT(*) FROM users WHERE role = '\''admin'\'' AND status = '\''active'\''"')
  [[ $active_admins =~ ^[0-9]+$ ]] || { echo 'Cannot verify existing administrator state' >&2; exit 1; }
fi
if [[ $active_admins == 0 ]]; then
  email=$(jq -r '.services.server.environment.TRACEFLOW_BOOTSTRAP_ADMIN_EMAIL' <<< "$config")
  password=$(jq -r '.services.server.environment.TRACEFLOW_BOOTSTRAP_ADMIN_PASSWORD' <<< "$config")
  [[ $email == *@* && $email != *CHANGE_ME* && ${#password} -ge 16 && $password != *CHANGE_ME* ]] || { echo 'First deployment needs a production bootstrap administrator' >&2; exit 1; }
fi
unset config password

registry_config=$(mktemp -d "$root/.registry.XXXXXX")
export DOCKER_CONFIG=$registry_config
cleanup() {
  local result=$?
  rm -f -- "$registry_config/config.json"
  rmdir -- "$registry_config" 2>/dev/null || true
  if (( result != 0 )); then
    touch "$candidate/FAILED"
    echo 'Deployment failed. Candidate containers may be running; inspect them before retrying. No database rollback was attempted.' >&2
  fi
}
trap cleanup EXIT
# Token arrives through SSH stdin, not an argument or persisted production secret.
docker login ghcr.io --username "$registry_user" --password-stdin
"${compose[@]}" pull
expected_commit=$(basename "$candidate")
expected_commit=${expected_commit%%-*}
for image in "$server_image" "$web_image"; do
  revision=$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
  [[ $revision == "$expected_commit" ]] || { echo 'Image revision does not match the selected commit' >&2; exit 1; }
done
mkdir -p "$root/demo" "$root/backups"
chmod 700 "$root/backups"
if [[ -n $mysql_id ]]; then
  [[ $mysql_id != *$'\n'* ]] || { echo 'Unexpected multiple production databases' >&2; exit 1; }
  backup="$root/backups/$(basename "$candidate").sql.gz"
  # Do not place credentials on the mysqldump command line or in logs.
  docker exec "$mysql_id" sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysqldump -uroot --single-transaction --routines --triggers --events --hex-blob --no-tablespaces --set-gtid-purged=OFF traceflow' | gzip > "$backup.partial"
  mv -- "$backup.partial" "$backup"
fi
"${compose[@]}" up -d --wait --wait-timeout 240
ready=false
for _ in {1..36}; do
  if curl --fail --silent --show-error --connect-timeout 5 --max-time 10 "https://$apm_host/api/v1/health" | jq -e '.status == "UP"' >/dev/null; then
    if curl --fail --silent --show-error --connect-timeout 5 --max-time 10 "https://$apm_host/version.json" | jq -e --arg commit "$expected_commit" '.commit == $commit' >/dev/null; then
      if curl --fail --silent --show-error --connect-timeout 5 --max-time 10 "https://$apm_host/login" >/dev/null; then ready=true; break; fi
    fi
  fi
  sleep 5
done
[[ $ready == true ]] || { echo 'Public HTTPS readiness failed' >&2; exit 1; }
ln -s "$(basename "$candidate")" "$root/releases/.current-next"
mv -Tf "$root/releases/.current-next" "$root/releases/current"
touch "$candidate/SUCCESS"
echo 'Platform deployment ready. Demo is published separately after creating its production application.'
