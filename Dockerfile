FROM node:24-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod=false

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && ./node_modules/.bin/vp build

FROM base AS runtime
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN mkdir -p /data && chown -R node:node /data
VOLUME /data
ENV PORT=3000 \
    NODE_ENV=production \
    DATABASE_PATH=/data/thread-artifacts.db \
    EXCERPT_DB_PATH=/data/excerpts.db \
    QUOTA_DB_PATH=/data/provider-quota.db
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD curl -sf http://localhost:3000/api/health || exit 1
CMD ["node", "dist/server/server.js"]
