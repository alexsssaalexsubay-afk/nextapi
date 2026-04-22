#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

TAG="${IMAGE_TAG:-main}"
echo "==> Deploying IMAGE_TAG=$TAG"

# Save previous tag for rollback.
if [ -f .last-tag ]; then
  cp .last-tag .last-prev-tag
fi
echo "$TAG" > .last-tag

export IMAGE_TAG="$TAG"
docker compose -f docker-compose.prod.yml pull backend worker
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# Run migrations inside the fresh image.
docker compose -f docker-compose.prod.yml run --rm \
  -e DATABASE_URL \
  backend /app/server --migrate || true

echo "==> Waiting for /health..."
for i in {1..30}; do
  if curl -fsS http://localhost:8080/health >/dev/null; then
    echo "==> Healthy."
    exit 0
  fi
  sleep 2
done

echo "!! Health check failed, rolling back."
"$(dirname "$0")/rollback.sh"
exit 1
