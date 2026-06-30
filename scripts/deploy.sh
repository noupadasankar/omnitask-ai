#!/bin/bash

set -e

echo "🚀 Deploying OmniTask AI to Production..."

# Load environment variables
if [ -f .env.production ]; then
  export $(cat .env.production | xargs)
fi

# Build Docker images
echo "📦 Building Docker images..."
docker-compose -f docker-compose.prod.yml build --no-cache

# Stop old containers
echo "🛑 Stopping old containers..."
docker-compose -f docker-compose.prod.yml down

# Start new containers
echo "✅ Starting new containers..."
docker-compose -f docker-compose.prod.yml up -d

# Run database migrations (if needed)
echo "🗄️  Running database migrations..."
docker-compose -f docker-compose.prod.yml exec backend npm run migrate

# Health check
echo "🏥 Waiting for health checks..."
sleep 10

if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "✅ Deployment successful!"
else
  echo "❌ Deployment failed - health check failed"
  docker-compose -f docker-compose.prod.yml logs
  exit 1
fi

echo "🎉 OmniTask AI is live!"