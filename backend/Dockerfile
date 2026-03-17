# Stage 2: Runtime
FROM node:20-slim AS runner

WORKDIR /app

# Install OpenSSL 3.x (standard for Debian Bookworm)
RUN apt-get update && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
RUN npm install --include=dev

# Install nest CLI globally for build
RUN npm install -g @nestjs/cli

# Copy prisma schema
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source
COPY . .

# Build
RUN npm run build

EXPOSE 4000

CMD ["npm", "run", "start:prod"]
