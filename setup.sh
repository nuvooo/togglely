#!/bin/bash

echo "🚀 Setting up Togglely..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose found"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please update the .env file with your configuration"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To start Togglely, run:"
echo "  docker-compose up -d"
echo ""
echo "The application will be available at:"
echo "  Frontend: http://localhost:3000"
echo "  Backend API: http://localhost:4000"
echo ""
echo "Demo credentials:"
echo "  Email: demo@togglely.io"
echo "  Password: demo1234"
