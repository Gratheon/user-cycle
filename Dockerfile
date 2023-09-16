FROM node:20-alpine

WORKDIR /app
COPY . /app/

RUN npm install && npm run build

EXPOSE 4000

CMD ["node", "app/user-cycle.js"]
