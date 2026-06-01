#!/usr/bin/env bash
# Test script for NVIDIA API integration
# Usage: bash test-nvidia.sh YOUR_NVIDIA_API_KEY

set -e

if [ -z "$1" ]; then
  echo "Usage: bash test-nvidia.sh YOUR_NVIDIA_API_KEY"
  echo ""
  echo "Get your NVIDIA API key from: https://build.nvidia.com/"
  exit 1
fi

export NVIDIA_API_KEY="$1"
export TERMUX_VERSION="${TERMUX_VERSION:-0.118}"
export GEMINI_CLI_NO_RELAUNCH=1

echo "Testing NVIDIA API integration..."
echo "Using model: nvidia/llama-3.1-nemotron-70b-instruct"
echo ""

bash dev.sh --build-only

node packages/cli/dist/index.js \
  --model "nvidia/llama-3.1-nemotron-70b-instruct" \
  -p "Say 'Hello from NVIDIA API' and nothing else"
