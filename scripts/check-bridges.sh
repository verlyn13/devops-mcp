#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   OBS_BRIDGE_URL=${OBS_BRIDGE_URL:-http://127.0.0.1:7171} ./scripts/check-bridges.sh
# Optional headers:
#   export BRIDGE_TOKEN=...

BRIDGE_URL=${OBS_BRIDGE_URL:-${BRIDGE_URL:-${1:-http://127.0.0.1:7171}}}
AUTH=()
if [[ -n "${BRIDGE_TOKEN:-}" ]]; then AUTH=(-H "Authorization: Bearer ${BRIDGE_TOKEN}"); fi

echo "Checking bridge at ${BRIDGE_URL}"

set +e
curl -sSf "${BRIDGE_URL}/api/discovery/services" "${AUTH[@]}" | jq '.ts, .ds_token_present' >/dev/null && echo "✓ discovery/services"
curl -sSf "${BRIDGE_URL}/api/discovery/schemas"  "${AUTH[@]}" | jq '.names, .ids' >/dev/null && echo "✓ discovery/schemas"
curl -sSf "${BRIDGE_URL}/api/obs/discovery/schemas"  "${AUTH[@]}" | jq '.names, .ids' >/dev/null && echo "✓ obs/discovery/schemas (alias)"
curl -sSf "${BRIDGE_URL}/api/obs/discovery/services"  "${AUTH[@]}" | jq '.ts' >/dev/null && echo "✓ obs/discovery/services (alias)"
if [[ -n "${DS_BASE_URL:-}" ]]; then
  echo "Checking DS self-status at ${DS_BASE_URL}/api/self-status"
  DS_AUTH=()
  if [[ -n "${DS_TOKEN:-}" ]]; then DS_AUTH=(-H "Authorization: Bearer ${DS_TOKEN}"); fi
  curl -sSf "${DS_BASE_URL}/api/self-status" "${DS_AUTH[@]}" | jq '.schema_version, .nowMs, .ok' >/dev/null && echo "✓ DS /api/self-status"
fi
curl -sSf "${BRIDGE_URL}/.well-known/obs-bridge.json" "${AUTH[@]}" | jq '.version, .endpoints.openapi' >/dev/null && echo "✓ well-known"
curl -sSfI "${BRIDGE_URL}/openapi.yaml" "${AUTH[@]}" | awk 'NR==1{print}' && echo "✓ openapi"
curl -sSfI "${BRIDGE_URL}/api/obs/discovery/openapi" "${AUTH[@]}" | awk 'NR==1{print}' && echo "✓ obs/discovery/openapi (alias)"
set -e

echo "Done."
