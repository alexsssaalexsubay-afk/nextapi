#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

if [ ! -f .last-prev-tag ]; then
  echo "No previous tag recorded, cannot rollback." >&2
  exit 1
fi
PREV="$(cat .last-prev-tag)"
echo "==> Rolling back to $PREV"
export IMAGE_TAG="$PREV"
docker compose -f docker-compose.prod.yml pull backend worker
docker compose -f docker-compose.prod.yml up -d --remove-orphans
echo "$PREV" > .last-tag
