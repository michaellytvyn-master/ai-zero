#!/usr/bin/env bash
# Drives the router against local stub providers so the failover is visible
# without real API keys. Phase 1 scaffolding.
set -uo pipefail
cd "$(dirname "$0")/.."

ROUTER_PID=""
STUB_PID=""
cleanup() { [ -n "$ROUTER_PID" ] && kill "$ROUTER_PID" 2>/dev/null; [ -n "$STUB_PID" ] && kill "$STUB_PID" 2>/dev/null; }
trap cleanup EXIT

STUB_SPEC="$1" pnpm exec vite-node scripts/stub-provider.ts >/tmp/zca-stub.log 2>&1 &
STUB_PID=$!

MISTRAL_API_KEY=stub-key GROQ_API_KEY=stub-key CF_API_TOKEN= \
MISTRAL_BASE_URL=http://localhost:9001/v1 \
GROQ_BASE_URL=http://localhost:9002/v1 \
FIRST_TOKEN_TIMEOUT_MS="${TIMEOUT_MS:-8000}" \
pnpm exec vite-node scripts/dev-router.ts >/tmp/zca-router.log 2>&1 &
ROUTER_PID=$!

curl -fsS --retry 40 --retry-delay 1 --retry-connrefused \
  http://localhost:8787/health >/dev/null 2>&1

shift
"$@"
echo
echo "--- router log ---"
cat /tmp/zca-router.log | grep -v "^router listening" | grep -v "^providers with keys"
