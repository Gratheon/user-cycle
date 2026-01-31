FROM node:22-alpine

WORKDIR /app

COPY . /app/

RUN npm install --legacy-peer-deps
RUN npm run build

EXPOSE 4000

# CMD ["node", "/app/app/user-cycle.js"]
