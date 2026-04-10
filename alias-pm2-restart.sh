#!/bin/bash

# Create pm2 alias that always includes --update-env
echo "Creating pm2 alias with --update-env..."

# Add to current shell session
alias pm2='pm2'
alias pm2-restart='pm2 restart --update-env'

echo "✅ Aliases created for this session:"
echo "  pm2-restart malebox  (includes --update-env automatically)"
echo ""
echo "To make permanent, add to ~/.bashrc or ~/.zshrc:"
echo "  alias pm2-restart='pm2 restart --update-env'"
