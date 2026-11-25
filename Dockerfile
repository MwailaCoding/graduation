# ── Mwaila Graduation Invitation — Production Dockerfile ──
FROM node:22-bookworm-slim AS base
WORKDIR /app

# Step 1: Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Step 2: Build Next.js application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Step 3: Production runner
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/database ./database

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "node database/migrate.mjs up && npx next start -p ${PORT:-3000}"]
