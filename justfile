start:
	COMPOSE_PROJECT_NAME=gratheon docker compose -f docker-compose.dev.yml up --build
stop:
	COMPOSE_PROJECT_NAME=gratheon docker compose -f docker-compose.dev.yml down
build:
	mkdir -p tmp
	rm -rf ./app
	source $HOME/.nvm/nvm.sh && nvm install 25 && nvm use && pnpm i && pnpm run build
	COMPOSE_PROJECT_NAME=gratheon docker compose -f docker-compose.dev.yml up --build
run-local:
	source $HOME/.nvm/nvm.sh && nvm install 25 && nvm use && pnpm i && ENV_ID=dev pnpm run dev:ts
export-translations:
	mkdir -p translations
	COMPOSE_PROJECT_NAME=gratheon docker compose -f docker-compose.dev.yml exec -T user-cycle sh -lc "mkdir -p /app/scripts /app/translations"
	COMPOSE_PROJECT_NAME=gratheon docker compose -f docker-compose.dev.yml cp ./scripts/translation-sync.js user-cycle:/app/scripts/translation-sync.js
	COMPOSE_PROJECT_NAME=gratheon docker compose -f docker-compose.dev.yml exec -T user-cycle node /app/scripts/translation-sync.js export /app/translations/user-cycle-translations.json
import-translations:
	COMPOSE_PROJECT_NAME=gratheon docker compose -f docker-compose.dev.yml exec -T user-cycle sh -lc "mkdir -p /app/scripts /app/translations"
	COMPOSE_PROJECT_NAME=gratheon docker compose -f docker-compose.dev.yml cp ./scripts/translation-sync.js user-cycle:/app/scripts/translation-sync.js
	COMPOSE_PROJECT_NAME=gratheon docker compose -f docker-compose.dev.yml exec -T user-cycle node /app/scripts/translation-sync.js import /app/translations/user-cycle-translations.json
