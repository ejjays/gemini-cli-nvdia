#!/usr/bin/env bash
# Dev launcher — builds with esbuild (no tsc needed) then runs the CLI.
# Usage: bash dev.sh [gemini args...]
#        bash dev.sh --build-only

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
ESBUILD="$ROOT/node_modules/.bin/esbuild"

build() {
  echo "Building packages/core..."
  find "$ROOT/packages/core/src" -name "*.ts" | grep -v '\.test\.' | grep -v '\.spec\.' | \
    xargs "$ESBUILD" --platform=node --format=esm \
      --outbase="$ROOT/packages/core/src" --outdir="$ROOT/packages/core/dist/src" --target=node20 --log-level=warning
  "$ESBUILD" "$ROOT/packages/core/index.ts" --platform=node --format=esm \
    --outfile="$ROOT/packages/core/dist/index.js" --target=node20 --log-level=warning
  
  # Copy policy files
  mkdir -p "$ROOT/packages/core/dist/src/policy/policies"
  cp "$ROOT/packages/core/src/policy/policies"/*.toml "$ROOT/packages/core/dist/src/policy/policies/" 2>/dev/null || true

  echo "Building packages/cli..."
  find "$ROOT/packages/cli/src" \( -name "*.ts" -o -name "*.tsx" \) | grep -v '\.test\.' | grep -v '\.spec\.' | \
    xargs "$ESBUILD" --platform=node --format=esm \
      --outbase="$ROOT/packages/cli/src" --outdir="$ROOT/packages/cli/dist/src" --target=node20 --log-level=warning
  "$ESBUILD" "$ROOT/packages/cli/index.ts" --platform=node --format=esm \
    --outfile="$ROOT/packages/cli/dist/index.js" --target=node20 --log-level=warning

  echo "Build done."
}

build

[[ "${1:-}" == "--build-only" ]] && exit 0

# Set Termux environment
export TERMUX_VERSION="${TERMUX_VERSION:-0.118}"
export GEMINI_CLI_NO_RELAUNCH=1

# Hardcode NVIDIA API key and disable Google OAuth
export NVIDIA_API_KEY="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"
export GOOGLE_GENAI_USE_GCA=false

exec node "$ROOT/packages/cli/dist/index.js" "$@"
