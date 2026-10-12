#!/usr/bin/env bash
set -uo pipefail

section() { printf '\n== %s ==\n' "$1"; }

section 'Operating system'
if [[ -r /etc/os-release ]]; then
  cat /etc/os-release
fi
uname -m

section 'Memory'
if command -v free >/dev/null 2>&1; then
  free -h
else
  printf 'free is unavailable\n'
fi

section 'Root disk'
df -h /

section 'Docker'
if command -v docker >/dev/null 2>&1; then
  docker --version
  if ! docker compose version; then
    printf 'Docker Compose v2 is unavailable\n'
  fi
  if ! docker info --format 'Architecture={{.Architecture}} CPUs={{.NCPU}} MemoryBytes={{.MemTotal}}'; then
    printf 'Docker daemon is unavailable or this user lacks access\n'
  fi
else
  printf 'Docker is not installed\n'
fi

section 'Listening TCP ports (check 22, 80 and 443)'
if command -v ss >/dev/null 2>&1; then
  ss -ltn
else
  printf 'ss is unavailable\n'
fi

printf '\nRead-only check complete. No configuration or service was changed.\n'
