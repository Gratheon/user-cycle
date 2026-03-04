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
