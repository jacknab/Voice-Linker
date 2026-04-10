#!/bin/bash

echo "🔄 Restarting malebox application..."

# Stop the app
pm2 stop malebox

# Start the app (will automatically read updated .env)
pm2 start ecosystem.config.cjs

echo "✅ Application restarted successfully!"
echo ""
echo "📊 Current status:"
pm2 status malebox

echo ""
echo "🔧 Environment variables:"
pm2 env $(pm2 jlist | jq -r '.[] | select(.name=="malebox") | .pm_id') | grep ELEVENLABS
