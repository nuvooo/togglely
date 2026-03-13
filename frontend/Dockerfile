# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy config files first
COPY package.json tailwind.config.cjs postcss.config.cjs ./
RUN npm install

# Copy source code
COPY . .

# Build
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
