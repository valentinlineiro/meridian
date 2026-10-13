#!/usr/bin/env bash
set -euo pipefail

url="${1:?URL required}"
output="${2:?output path required}"
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  code=$(curl --silent --show-error --max-time 180 -o "$output" -w '%{http_code}' "$url" || printf '000')
  if [ "$code" = "200" ]; then
    cat "$output"
    exit 0
  fi
  if [ "$code" = "000" ] || grep -q 'error code: 1042' "$output"; then
    sleep 2
    continue
  fi
  cat "$output" >&2 || true
  echo "Temporary Worker request failed with HTTP $code" >&2
  exit 1
done
cat "$output" >&2 || true
echo "Temporary Worker route did not stabilize after 10 attempts" >&2
exit 1
