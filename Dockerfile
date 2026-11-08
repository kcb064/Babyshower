# syntax=docker/dockerfile:1

# ---- deps: install with pnpm (better-sqlite3 needs a native build/prebuild for musl) ----
FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++ libc6-compat \
 && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build: Next.js standalone output ----
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- run: minimal image; the entrypoint fixes /data ownership and drops to the node user ----
FROM node:22-alpine AS run
RUN apk add --no-cache su-exec
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    DATABASE_PATH=/data/registry.db

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Migrations are applied automatically at startup (also traced into standalone; copied to be explicit).
COPY --from=build --chown=node:node /app/drizzle ./drizzle
# Manual backups: `docker exec babyshower node scripts/backup.mjs` (better-sqlite3 is in standalone node_modules).
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /data/uploads /data/backups /data/imgcache && chown -R node:node /data \
 && chmod +x /usr/local/bin/docker-entrypoint.sh
# No USER here: the entrypoint runs as root just long enough to chown the mounted /data, then
# switches to `node` with su-exec. Set `user:` in compose to skip that and run as that user directly.
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
