#!/bin/bash
# Post-renewal hook: copy updated certs to nginx ssl dir and reload nginx container
# The ssl dir is bind-mounted into banc-nginx, so updating host files is sufficient
CERT_DIR="/etc/letsencrypt/live/banc-of-el-trust-international.org"
SSL_DIR="/opt/banc-of-el/nginx/ssl"

cp "$CERT_DIR/fullchain.pem" "$SSL_DIR/fullchain.pem"
cp "$CERT_DIR/privkey.pem" "$SSL_DIR/privkey.pem"

# Reload nginx to pick up new certs
docker exec banc-nginx nginx -s reload

echo "$(date): Certs renewed and nginx reloaded" >> /var/log/certbot-renew.log
