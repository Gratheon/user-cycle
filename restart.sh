cd /www/user-cycle/
COMPOSE_PROJECT_NAME=gratheon docker-compose -f docker-compose.prod.yml down
docker rm -f gratheon_user-cycle_1 2>/dev/null || true
rm -rf ./app
COMPOSE_PROJECT_NAME=gratheon docker-compose -f docker-compose.prod.yml up --build -d