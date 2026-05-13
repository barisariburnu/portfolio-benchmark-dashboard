#!/bin/sh
set -e

# Fix permissions for the data directory (needed if volume is mounted)
chown -R nextjs:nodejs /app/data

# Run database migrations/push if needed as nextjs user
echo "Running database initialization..."
su-exec nextjs prisma db push --schema=./prisma/schema.prisma --accept-data-loss --url "$DATABASE_URL"

# Start the application as nextjs user
echo "Starting application..."
exec su-exec nextjs node server.js
