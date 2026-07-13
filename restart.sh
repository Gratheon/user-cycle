#!/bin/sh
set -eu

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-user-cycle}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
LEGACY_PROJECT_NAME="${LEGACY_PROJECT_NAME:-gratheon}"
SERVICE_NAME="${SERVICE_NAME:-user-cycle}"

cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

stop_legacy_gratheon_service_container() {
  docker ps -aq \
    --filter "label=com.docker.compose.project=${LEGACY_PROJECT_NAME}" \
    --filter "label=com.docker.compose.service=${SERVICE_NAME}" \
    | while IFS= read -r container_id; do
        [ -n "$container_id" ] || continue
        docker rm -f "$container_id" >/dev/null 2>&1 || true
      done
}

stop_legacy_gratheon_service_container
COMPOSE_PROJECT_NAME="$PROJECT_NAME" docker-compose -f "$COMPOSE_FILE" down
rm -rf ./app
COMPOSE_PROJECT_NAME="$PROJECT_NAME" docker-compose -f "$COMPOSE_FILE" up --build -d

TRANSLATIONS_FILE="./translations/user-cycle-translations.json"
if [ -f "$TRANSLATIONS_FILE" ]; then
  COMPOSE_PROJECT_NAME="$PROJECT_NAME" docker-compose -f "$COMPOSE_FILE" exec -T user-cycle \
    node /app/scripts/translation-sync.js import /app/translations/user-cycle-translations.json
fi
