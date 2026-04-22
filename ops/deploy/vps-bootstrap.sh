#!/usr/bin/env bash
# Run once on fresh Aliyun HK VPS (47.76.205.108) as root via Aliyun console.
set -euo pipefail

apt-get update && apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw

# deploy user
id deploy &>/dev/null || adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chown -R deploy:deploy /home/deploy/.ssh

# Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker deploy

# Firewall
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

# App dir
mkdir -p /opt/nextapi
chown deploy:deploy /opt/nextapi

echo "==> Bootstrap done. Next:"
echo "  - copy ssh public key into /home/deploy/.ssh/authorized_keys"
echo "  - as deploy: git clone repo into /opt/nextapi"
echo "  - fill /opt/nextapi/.env"
echo "  - run certbot to issue api.nextapi.top cert"
