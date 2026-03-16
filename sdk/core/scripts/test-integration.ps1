# Integration Test Runner for Togglely SDK (PowerShell)
# This script verifies the backend is running before executing tests

$API_URL = "http://localhost:4000"
$MAX_RETRIES = 30
$RETRY_COUNT = 0

Write-Host "Checking if backend is running at $API_URL..."

# Check if backend is accessible
$backendReady = $false
while ($RETRY_COUNT -lt $MAX_RETRIES -and -not $backendReady) {
    try {
        $response = Invoke-WebRequest -Uri "$API_URL/health" -Method GET -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $backendReady = $true
        }
    } catch {
        $RETRY_COUNT++
        Write-Host "  Waiting for backend... ($RETRY_COUNT/$MAX_RETRIES)"
        Start-Sleep -Seconds 2
    }
}

if (-not $backendReady) {
    Write-Host "ERROR: Backend is not accessible after $MAX_RETRIES attempts"
    Write-Host ""
    Write-Host "Please start the backend first:"
    Write-Host "  cd C:\Users\nuVo\Desktop\flagify"
    Write-Host "  docker-compose up -d"
    exit 1
}

Write-Host "SUCCESS: Backend is running!"
Write-Host ""

# Check health endpoint response
try {
    $HEALTH_RESPONSE = Invoke-WebRequest -Uri "$API_URL/health" -Method GET | Select-Object -ExpandProperty Content
    Write-Host "Health check response: $HEALTH_RESPONSE"
} catch {
    Write-Host "WARNING: Could not get health response"
}
Write-Host ""

# Run the integration tests
Write-Host "Running integration tests..."
& npx jest --config jest.integration.config.js @args
