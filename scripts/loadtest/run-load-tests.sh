#!/bin/bash
set -euo pipefail

echo "============================================"
echo "  OmniTask-AI Load Test Suite"
echo "============================================"
echo ""

BASE_URL="${BASE_URL:-http://localhost:4000}"
WS_URL="${WS_URL:-ws://localhost:4000}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
K6_BIN="${K6_BIN:-k6}"

if ! command -v "$K6_BIN" &> /dev/null; then
    echo "ERROR: k6 not found. Install from https://k6.io/docs/get-started/installation/"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "ERROR: node not found"
    exit 1
fi

echo "Target: $BASE_URL"
echo ""

run_k6_test() {
    local name=$1
    local script=$2
    local extra_args="${3:-}"

    echo "--- [$name] ---"
    echo "Running: $K6_BIN run $extra_args -e BASE_URL=$BASE_URL -e WS_URL=$WS_URL $script"
    echo ""

    if $K6_BIN run $extra_args -e "BASE_URL=$BASE_URL" -e "WS_URL=$WS_URL" "$script"; then
        echo "  PASS: $name"
    else
        echo "  FAIL: $name"
    fi
    echo ""
}

run_k6_test "API Load Test (1000 concurrent users)" "api-load.k6.js"

run_k6_test "WebSocket Load Test (10000 connections)" "websocket-load.k6.js"

echo "--- [Database Performance Benchmark] ---"
node db-benchmark.js
echo ""

echo "--- [Redis & Queue Performance Benchmark] ---"
node redis-queue-benchmark.js
echo ""

echo "--- [Browser Concurrent Sessions] ---"
if command -v python3 &> /dev/null; then
    python3 browser-concurrent.py
elif command -v python &> /dev/null; then
    python browser-concurrent.py
else
    echo "SKIP: Python not found"
fi
echo ""

echo "============================================"
echo "  Load Test Suite Complete"
echo "============================================"

echo ""
echo "Quick Start:"
echo "  1. Start the backend: cd apps/backend && npm run start:dev"
echo "  2. Ensure Postgres + Redis are running"
echo "  3. Run: bash scripts/loadtest/run-load-tests.sh"
echo ""
echo "Environment variables:"
echo "  BASE_URL  - Backend URL (default: http://localhost:4000)"
echo "  WS_URL    - WebSocket URL (default: ws://localhost:4000)"
echo "  REDIS_URL - Redis connection (default: redis://localhost:6379)"
echo "  K6_BIN    - k6 binary path (default: k6)"
