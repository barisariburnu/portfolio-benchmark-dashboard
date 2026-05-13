#!/bin/bash
# Start script for Portfolio Benchmark Dashboard
# Uses next start for proper static file serving

# Ensure we are in the correct directory (use current directory if not specified)
cd "$(dirname "$0")"

# Ensure Prisma client is generated
npx prisma generate --no-hints 2>/dev/null

# Ensure .next build exists
if [ ! -d ".next" ]; then
  echo "[$(date)] Building production server..."
  NODE_OPTIONS="--max-old-space-size=512" npx next build
fi

echo "[$(date)] Starting Portfolio Benchmark Dashboard..."
echo "[$(date)] Data is cached for 24 hours. Use 'Zorla Güncelle' for fresh data."

# Start with next start (proper static file serving)
exec npx next start -p 7505 -H 0.0.0.0
