# ───────────────────────────────────────────────────────────
#  Mwaila Graduation Invitation — Production Dockerfile
#  Next.js 16 (standalone) + PostgreSQL migrations
#  Target: PrimeCloud Docker container
# ───────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ─────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ── Stage 2: Build the Next.js app ────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build produces .next/standalone thanks to output: "standalone"
RUN npm run build

# ── Stage 3: Production image ─────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Don't run as root
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy the standalone server (includes node_modules it needs)
COPY --from=builder /app/.next/standalone ./

# Copy static assets the standalone build doesn't include
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public          ./public

# Copy database migrations + migration runner (for entrypoint)
COPY --from=builder /app/database ./database

# Copy the entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# Fix ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
