start:
	mkdir -p tmp
	source $(HOME)/.nvm/nvm.sh && nvm use && npm i && npm run build
	COMPOSE_PROJECT_NAME=gratheon docker compose -f docker-compose.dev.yml up --build
stop:
	COMPOSE_PROJECT_NAME=gratheon docker compose -f docker-compose.dev.yml down
run:
	ENV_ID=dev npm run dev

deploy-clean:
	ssh root@gratheon.com 'rm -rf /www/user-cycle.gratheon.com/app/*;'

deploy-copy:
	scp -r Dockerfile docker-compose.yml restart.sh root@gratheon.com:/www/user-cycle.gratheon.com/
	rsync -av -e ssh --exclude='node_modules' --exclude='.git'  --exclude='.idea' ./ root@gratheon.com:/www/user-cycle.gratheon.com/

deploy-run:
	ssh root@gratheon.com 'chmod +x /www/user-cycle.gratheon.com/restart.sh'
	ssh root@gratheon.com 'bash /www/user-cycle.gratheon.com/restart.sh'

deploy:
	make deploy-clean
	make deploy-copy
	make deploy-run

.PHONY: deploy
