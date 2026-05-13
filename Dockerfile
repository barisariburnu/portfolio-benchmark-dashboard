FROM node:22-alpine AS base

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json bun.lock* package-lock.json* ./
RUN if command -v bun > /dev/null 2>&1; then \
      bun install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN DATABASE_URL=file:./dummy.db npx prisma generate

# Build Next.js (uses standalone output defined in next.config.ts)
RUN DATABASE_URL=file:./dummy.db npm run build

# ── Production ────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=7505
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install prisma globally to use in entrypoint (matching project version)
RUN npm install -g prisma@7.8.0

# Copy standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# Dependencies for runner
RUN apk add --no-cache su-exec

# Create and setup entrypoint
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 7505

# Run as root to fix permissions in entrypoint, then su-exec to nextjs
ENTRYPOINT ["./entrypoint.sh"]
