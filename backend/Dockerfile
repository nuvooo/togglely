# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL 3.x (standard for Debian Bookworm)
RUN apt-get update && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --legacy-peer-deps

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

CMD ["node", "dist/main"]
