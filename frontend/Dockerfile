# Build stage
FROM node:22-alpine AS builder

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
    '# DNS server for request-time backend lookups: the container resolver' \
    '# (127.0.0.11 on Docker networks) unless NGINX_RESOLVER overrides it' \
    'NGINX_RESOLVER=${NGINX_RESOLVER:-$(sed -n "s/^nameserver[[:space:]]*//p" /etc/resolv.conf | head -n 1)}' \
    'NGINX_RESOLVER=${NGINX_RESOLVER:-127.0.0.11}' \
    'sed -e "s/BACKEND_HOST/$BACKEND_HOST/g" -e "s/BACKEND_PORT/$BACKEND_PORT/g" -e "s/NGINX_RESOLVER/$NGINX_RESOLVER/g" /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf' \
    'nginx -g "daemon off;"' > /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
