#!/bin/bash

# Restart script for malebox app with environment update
echo "Restarting malebox with environment update..."
pm2 restart malebox --update-env

echo "Checking status..."
pm2 status malebox
