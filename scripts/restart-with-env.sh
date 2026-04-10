#!/bin/bash

# Restart malebox app with environment update
cd /apps/chatline
echo "Restarting malebox with environment update..."
pm2 restart malebox --update-env
echo "Done!"
