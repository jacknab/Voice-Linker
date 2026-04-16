#!/bin/bash
set -e

APP_DIR="/opt/malebox"
SERVICE_NAME="malebox"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "==> Stopping and removing PM2 instance (if running)..."
pm2 stop $SERVICE_NAME 2>/dev/null || true
pm2 delete $SERVICE_NAME 2>/dev/null || true
pm2 save 2>/dev/null || true

echo "==> Writing systemd service file to ${SERVICE_FILE}..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Male Box IVR
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node ${APP_DIR}/node_modules/.bin/tsx server/index.ts
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "==> Reloading systemd daemon..."
systemctl daemon-reload

echo "==> Enabling ${SERVICE_NAME} to start on boot..."
systemctl enable $SERVICE_NAME

echo "==> Starting ${SERVICE_NAME}..."
systemctl start $SERVICE_NAME

echo ""
echo "==> Done. Current status:"
systemctl status $SERVICE_NAME --no-pager

echo ""
echo "Useful commands:"
echo "  sudo systemctl restart ${SERVICE_NAME}   — restart after changes"
echo "  sudo systemctl stop ${SERVICE_NAME}      — stop the service"
echo "  journalctl -u ${SERVICE_NAME} -f         — live logs"
echo "  journalctl -u ${SERVICE_NAME} -n 100     — last 100 lines"
