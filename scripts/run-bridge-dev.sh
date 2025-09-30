#!/usr/bin/env bash
set -euo pipefail

# Dev runner: enables permissive CORS for local dashboard work
# Usage: ./scripts/run-bridge-dev.sh

export BRIDGE_CORS=1
echo "[bridge-dev] BRIDGE_CORS=1 (permissive); ensure dashboard_bridge.enabled=true in config"
pnpm dev

