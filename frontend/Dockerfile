# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy config files first
COPY package*.json tailwind.config.cjs postcss.config.cjs ./
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build
RUN npm run build

# Production stage
FROM nginx:alpine

# Install envsubst for template substitution
RUN apk add --no-cache gettext

COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration template
COPY nginx.conf /etc/nginx/conf.d/default.conf.template
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf

# Create startup script - use sed instead of envsubst for better control
RUN printf '%s\n' '#!/bin/sh' \
    'BACKEND_HOST=${BACKEND_HOST:-backend}' \
    'BACKEND_PORT=${BACKEND_PORT:-4000}' \
    'sed -e "s/BACKEND_HOST/$BACKEND_HOST/g" -e "s/BACKEND_PORT/$BACKEND_PORT/g" /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf' \
    'nginx -g "daemon off;"' > /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
