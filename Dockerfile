FROM platformatic/node-caged:25-slim AS base

WORKDIR /app

RUN npm install -g pnpm@10.29.2

FROM base AS prod-deps

COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile --prod \
  && pnpm store prune \
  && rm -rf /root/.npm /root/.local/share/pnpm/store

FROM base AS build

COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile \
  && pnpm store prune \
  && rm -rf /root/.npm /root/.local/share/pnpm/store

COPY . .

RUN pnpm run build

FROM platformatic/node-caged:25-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/app ./app
COPY --from=build /app/emails ./emails
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/schema.graphql ./schema.graphql
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/translations ./translations

EXPOSE 4000

CMD ["node", "/app/app/user-cycle.js"]
