#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

root=/opt/traceflow
candidate=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ $candidate =~ ^/opt/traceflow/demo/releases/[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid Demo candidate directory' >&2; exit 1; }
for command in jq curl flock sha256sum cmp; do command -v "$command" >/dev/null; done
exec 9>"$root/deploy.lock"
flock -w 5 9 || { echo 'Another deployment is active' >&2; exit 1; }
[[ ! -e $candidate/SUCCESS && ! -e $candidate/FAILED ]] || { echo 'Attempt already used' >&2; exit 1; }
cleanup() {
  local result=$?
  if (( result != 0 )); then
    touch "$candidate/FAILED"
    echo 'Demo publication failed; inspect current pointer before retrying.' >&2
  fi
}
trap cleanup EXIT
public=$candidate/public
[[ -f $public/index.html && -f $public/version.json && -d $public/assets && -f $candidate/checksums.sha256 ]] || exit 1
[[ -z $(find "$public" ! -type f ! -type d -print -quit) ]] || { echo 'Only regular files and directories allowed' >&2; exit 1; }
[[ -z $(find "$public" -type f \( -iname '*.map' -o -name 'traceflow-release.json' -o -name '.*' \) -print -quit) ]] || { echo 'Private files cannot be published' >&2; exit 1; }
while IFS= read -r line; do
  [[ $line =~ ^[a-f0-9]{64}\ \ [a-zA-Z0-9_./-]+$ ]] || { echo 'Invalid checksum manifest' >&2; exit 1; }
  relative=${line:66}
  [[ $relative != /* && $relative != *'..'* && $relative != *'/.'* && $relative != .* ]] || exit 1
done < "$candidate/checksums.sha256"
[[ -s $candidate/checksums.sha256 ]] || exit 1
(cd "$public" && sha256sum --check --strict "$candidate/checksums.sha256")
commit=$(jq -er '.commit' "$public/version.json")
release=$(jq -er '.release' "$public/version.json")
origin=$(jq -er '.origin' "$public/version.json")
[[ $commit =~ ^[a-f0-9]{40}$ && $(basename "$candidate") == "$commit"-* && $origin == https://demo.revengedog.online ]] || exit 1

# Retain old hash chunks inside the next tree so open tabs can load lazy assets after switching.
if [[ -e $root/demo/current || -L $root/demo/current ]]; then
  [[ -L $root/demo/current ]] || { echo 'Current Demo must be a release symlink' >&2; exit 1; }
  previous=$(readlink -f -- "$root/demo/current")
  [[ $previous =~ ^/opt/traceflow/demo/releases/[a-f0-9]{40}-[0-9]+-[0-9]+/public$ ]] || exit 1
  [[ -z $(find "$previous/assets" ! -type f ! -type d -print -quit) ]] || exit 1
  [[ -z $(find "$previous/assets" -type f \( -iname '*.map' -o -name '.*' \) -print -quit) ]] || exit 1
  while IFS= read -r -d '' file; do
    relative=${file#"$previous/assets/"}
    target=$public/assets/$relative
    if [[ -e $target ]]; then
      cmp --silent "$file" "$target" || { echo 'Immutable asset path collision' >&2; exit 1; }
    else
      mkdir -p -- "$(dirname -- "$target")"
      cp -- "$file" "$target"
    fi
  done < <(find "$previous/assets" -type f -print0)
fi
find "$candidate" -type d -exec chmod 755 {} +
find "$public" -type f -exec chmod 644 {} +
ln -s "releases/$(basename "$candidate")/public" "$candidate/current.next"
mv -Tf -- "$candidate/current.next" "$root/demo/current"
version=$(curl --fail --silent --show-error --retry 5 --retry-delay 3 --max-time 30 "$origin/version.json")
jq -e --arg commit "$commit" --arg release "$release" '.commit == $commit and .release == $release' <<< "$version" >/dev/null
while IFS= read -r line; do
  expected=${line:0:64}
  relative=${line:66}
  actual=$(curl --fail --silent --show-error --max-time 30 "$origin/$relative" | sha256sum)
  [[ ${actual:0:64} == "$expected" ]] || { echo 'Public artifact differs from uploaded build' >&2; exit 1; }
  if [[ $relative == *.js ]]; then
    code=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 30 "$origin/$relative.map")
    [[ $code == 404 ]] || { echo 'Source Map must not be public' >&2; exit 1; }
  fi
done < "$candidate/checksums.sha256"
code=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 30 "$origin/traceflow-release.json")
[[ $code == 404 ]] || exit 1
touch "$candidate/SUCCESS"
echo "Demo published: $release"
