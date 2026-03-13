#!/bin/bash

# Cypress Test Runner with Coverage Check

echo "🧪 Starting Cypress Tests with Coverage..."

# Start the application in test mode
echo "🚀 Starting application..."
npm run dev &
APP_PID=$!

# Wait for app to be ready
echo "⏳ Waiting for app to be ready..."
npx wait-on http://localhost:3000 --timeout 60000

# Run Cypress tests
echo "🧪 Running Cypress tests..."
npx cypress run

# Capture exit code
EXIT_CODE=$?

# Kill the app
kill $APP_PID 2>/dev/null

# Check coverage threshold
echo "📊 Checking code coverage..."
if [ -f "coverage/coverage-summary.json" ]; then
  LINES=$(cat coverage/coverage-summary.json | grep -o '"lines":{[^}]*}' | grep -o '"pct":[0-9.]*' | cut -d':' -f2)
  
  echo "📈 Line Coverage: ${LINES}%"
  
  # Check if coverage meets 80% threshold
  if (( $(echo "$LINES >= 80" | bc -l) )); then
    echo "✅ Coverage threshold met (80%)"
  else
    echo "❌ Coverage threshold NOT met (80%)"
    echo "Current coverage: ${LINES}%"
    EXIT_CODE=1
  fi
else
  echo "⚠️  Coverage report not found"
fi

exit $EXIT_CODE
