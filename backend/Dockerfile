# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL 3.x (standard for Debian Bookworm)
RUN apt-get update && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# --include=dev: Coolify passes NODE_ENV=production as build arg, which
# would otherwise skip devDependencies (@nestjs/cli) and break `nest build`
RUN npm ci --include=dev --legacy-peer-deps

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .
RUN npm run build && npm prune --omit=dev --legacy-peer-deps

# Stage 2: Runtime (no dev dependencies, non-root user)
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /app/uploads && chown node:node /app/uploads

COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma

USER node

EXPOSE 4000

# Prisma CLI: no update checks / telemetry calls on start
ENV CHECKPOINT_DISABLE=1

# Sync the schema (collections and indexes, e.g. changed unique indexes)
# before starting. No --accept-data-loss: a push that would lose data fails,
# and so does the deploy, visibly. SKIP_DB_PUSH=true skips the sync.
# Inline instead of a script file, so Windows checkouts (CRLF) cannot break it.
CMD ["sh", "-c", "if [ \"$SKIP_DB_PUSH\" = \"true\" ]; then echo 'SKIP_DB_PUSH=true: skipping prisma db push'; else npx prisma db push --skip-generate || { echo 'prisma db push failed: database schema is not in sync, refusing to start' >&2; exit 1; }; fi; exec node dist/main"]
