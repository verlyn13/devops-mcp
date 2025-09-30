#!/usr/bin/env bash
set -euo pipefail

docker compose up -d prometheus loki otel-collector
sleep 5

export DEVOPS_MCP_CONFIG="${DEVOPS_MCP_CONFIG:-$HOME/.config/devops-mcp/config.toml}"
node dist/index.js &

export TELEMETRY_PROM_URL="${TELEMETRY_PROM_URL:-http://localhost:9090}"
export TELEMETRY_LOKI_URL="${TELEMETRY_LOKI_URL:-http://localhost:3100}"
export TELEMETRY_LOG_FILE="${TELEMETRY_LOG_FILE:-$HOME/Library/Application Support/devops.mcp/logs/server.ndjson}"
echo "Stack started. Prom: $TELEMETRY_PROM_URL, Loki: $TELEMETRY_LOKI_URL"

