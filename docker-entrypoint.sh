#!/bin/sh
set -e

PRISMA="node node_modules/prisma/build/index.js"

echo "[vuln-portal] Waiting for DB and syncing schema..."
n=0
until $PRISMA db push --skip-generate; do
  n=$((n + 1))
  if [ "$n" -ge 30 ]; then
    echo "[vuln-portal] DB schema sync failed after 30 retries. Check DB connectivity and permissions."
    exit 1
  fi
  echo "[vuln-portal] DB not ready yet... ($n/30) retrying in 2s"
  sleep 2
done

echo "[vuln-portal] Starting application..."
exec node server.js
