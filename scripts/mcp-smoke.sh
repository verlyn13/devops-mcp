#!/usr/bin/env bash
set -euo pipefail

# Simple MCP parity smoke test
# Usage: OBS_BRIDGE_URL=http://127.0.0.1:7171 ./scripts/mcp-smoke.sh

BRIDGE_URL=${OBS_BRIDGE_URL:-${BRIDGE_URL:-${1:-http://127.0.0.1:7171}}}
AUTH=()
if [[ -n "${BRIDGE_TOKEN:-}" ]]; then AUTH=(-H "Authorization: Bearer ${BRIDGE_TOKEN}"); fi

echo "[mcp-smoke] Bridge: ${BRIDGE_URL}"

echo "[mcp-smoke] Self-status"
curl -sSf "${BRIDGE_URL}/api/self-status" "${AUTH[@]}" | jq '.schemaVersion, .schema_version, .nowMs' >/dev/null

echo "[mcp-smoke] Discovery services (alias)"
svc=$(curl -sSf "${BRIDGE_URL}/api/obs/discovery/services" "${AUTH[@]}")
echo "$svc" | jq '.ts' >/dev/null
echo "$svc" | jq '.mcp.openapi, .mcp.self_status' >/dev/null

echo "[mcp-smoke] Discovery openapi (alias)"
curl -sSfI "${BRIDGE_URL}/api/obs/discovery/openapi" "${AUTH[@]}" | awk 'NR==1{print}'

echo "[mcp-smoke] Discovery schemas (base and alias)"
curl -sSf "${BRIDGE_URL}/api/discovery/schemas" "${AUTH[@]}" | jq '.names, .ids' >/dev/null
curl -sSf "${BRIDGE_URL}/api/obs/discovery/schemas" "${AUTH[@]}" | jq '.names, .ids' >/dev/null

echo "[mcp-smoke] Well-known"
curl -sSf "${BRIDGE_URL}/.well-known/obs-bridge.json" "${AUTH[@]}" | jq '.endpoints.openapi' >/dev/null
curl -sSfI "${BRIDGE_URL}/api/obs/well-known" "${AUTH[@]}" | awk 'NR==1{print}'

echo "[mcp-smoke] OK"
