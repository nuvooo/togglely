#!/bin/bash

# Integration Test Runner for Togglely SDK
# This script verifies the backend is running before executing tests

set -e

API_URL="http://localhost:4000"
MAX_RETRIES=30
RETRY_COUNT=0

echo "🔍 Checking if backend is running at $API_URL..."

# Check if backend is accessible
while ! curl -s "$API_URL/health" > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "❌ Backend is not accessible after $MAX_RETRIES attempts"
        echo ""
        echo "Please start the backend first:"
        echo "  cd /path/to/flagify"
        echo "  docker-compose up -d"
        exit 1
    fi
    echo "  Waiting for backend... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

echo "✅ Backend is running!"
echo ""

# Check health endpoint response
HEALTH_RESPONSE=$(curl -s "$API_URL/health")
echo "Health check response: $HEALTH_RESPONSE"
echo ""

# Run the integration tests
echo "🧪 Running integration tests..."
npx jest --config jest.integration.config.js "$@"
