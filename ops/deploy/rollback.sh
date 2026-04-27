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
COMPOSE_ARGS=(-f docker-compose.prod.yml)
if [[ -f docker-compose.override.yml ]]; then
  COMPOSE_ARGS+=(-f docker-compose.override.yml)
fi

docker compose "${COMPOSE_ARGS[@]}" pull backend worker
docker compose "${COMPOSE_ARGS[@]}" up -d --remove-orphans
echo "$PREV" > .last-tag
