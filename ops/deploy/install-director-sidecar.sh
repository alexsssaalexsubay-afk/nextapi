#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/nextapi}"
SERVICE_USER="${SERVICE_USER:-deploy}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

cd "$ROOT_DIR"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "python runtime not found: $PYTHON_BIN" >&2
  exit 1
fi

"$PYTHON_BIN" -m venv "$ROOT_DIR/.venv-director"
"$ROOT_DIR/.venv-director/bin/pip" install --upgrade pip
"$ROOT_DIR/.venv-director/bin/pip" install -r "$ROOT_DIR/services/director_sidecar/requirements.txt"

sudo install -o root -g root -m 0644 \
  "$ROOT_DIR/ops/systemd/nextapi-director-sidecar.service" \
  /etc/systemd/system/nextapi-director-sidecar.service

sudo systemctl daemon-reload
sudo systemctl enable --now nextapi-director-sidecar.service
sudo systemctl status nextapi-director-sidecar.service --no-pager

echo "Director sidecar installed. Ensure .env contains DIRECTOR_RUNTIME_TOKEN, DIRECTOR_SIDECAR_TOKEN, and VIMAX_RUNTIME_URL."
