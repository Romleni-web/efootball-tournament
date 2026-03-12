#!/bin/bash

echo "🚀 Deploying eFootball Tournament API..."

# Pull latest code
git pull origin main

# Install dependencies
npm install

# Run tests
npm test

# Build Docker image
docker build -t efootball-api .

# Stop old container
docker stop efootball-api || true
docker rm efootball-api || true

# Start new container
docker run -d \
  --name efootball-api \
  -p 5000:5000 \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/.env:/app/.env:ro \
  --restart unless-stopped \
  efootball-api

echo "✅ Deployment complete!"