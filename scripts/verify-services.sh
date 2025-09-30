#!/usr/bin/env bash
set -euo pipefail
BASE="${OBS_BRIDGE_URL:-http://127.0.0.1:7171}"
HDR=()
if [[ -n "${BRIDGE_TOKEN:-}" ]]; then HDR=(-H "Authorization: Bearer ${BRIDGE_TOKEN}"); fi

echo "== Bridge self-status =="
curl -sS "${BASE}/api/self-status" "${HDR[@]}" | jq -r '.service,.caps,.observers'

echo "== OpenAPI =="
curl -sfI "${BASE}/openapi.yaml" "${HDR[@]}" | awk 'NR==1{print}'

echo "== Registry =="
curl -sS "${BASE}/api/discovery/registry" "${HDR[@]}" | jq -r '. | objects | .count? // length // .projects? // empty' || true

echo "== Services =="
curl -sS "${BASE}/api/discovery/services" "${HDR[@]}" | jq -r '.'

echo "Done"
