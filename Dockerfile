FROM platformatic/node-caged:25-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml* /app/

RUN npm install -g pnpm@10.29.2
RUN pnpm install --frozen-lockfile

COPY . /app/

RUN pnpm run build

EXPOSE 4000

# CMD ["node", "/app/app/user-cycle.js"]
