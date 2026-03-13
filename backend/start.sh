#!/bin/sh

# Wait for MongoDB to be ready
echo "Waiting for MongoDB..."
sleep 5

# Push Prisma schema to MongoDB (creates collections)
echo "Pushing Prisma schema to MongoDB..."
npx prisma db push --accept-data-loss || true

# Seed database
echo "Seeding database..."
npx prisma db seed || true

# Start the application
echo "Starting application..."
node dist/index.js
