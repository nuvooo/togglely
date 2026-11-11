# Multi-stage Dockerfile for Coolify
# This builds both frontend and backend in one image for simple deployments

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app

# Install Nginx for serving frontend
RUN apk add --no-cache nginx su-exec

# Copy backend
# Owned by the unprivileged node user: the API never runs as root
COPY --from=backend-builder --chown=node:node /app/backend/dist ./backend/dist
COPY --from=backend-builder --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder --chown=node:node /app/backend/package*.json ./backend/
COPY --from=backend-builder --chown=node:node /app/backend/prisma ./backend/prisma

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create startup script. nginx keeps its root master (port 80) with
# unprivileged workers; the backend is dropped to the node user via su-exec.
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'cd /app/backend && su-exec node sh -c "npx prisma generate && npx prisma db push && exec node dist/main" & nginx -g "daemon off;"' >> /app/start.sh && \
    chmod +x /app/start.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:4000/api/health || exit 1

EXPOSE 80

CMD ["/app/start.sh"]
