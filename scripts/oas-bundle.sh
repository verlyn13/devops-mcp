#!/usr/bin/env bash
set -euo pipefail

mkdir -p build
echo "Bundling OpenAPI (dereferenced) → build/openapi.bundled.yaml"
npx --yes @redocly/cli bundle docs/openapi.yaml --dereferenced -o build/openapi.bundled.yaml
echo "Done."

