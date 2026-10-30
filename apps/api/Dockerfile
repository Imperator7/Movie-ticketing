# syntax=docker/dockerfile:1.7
# API image (OPS-2): multi-stage, production dependencies only, runs as the non-root `node` user.
# Build from the repo root:  docker build -f apps/api/Dockerfile -t movie-api .
# Pin by digest for releases: docker buildx imagetools inspect node:24.11-alpine3.22
ARG NODE_IMAGE=node:24.11-alpine3.22

FROM ${NODE_IMAGE} AS base
# openssl: Prisma detects it to pick its engines (generate / migrate).
RUN apk add --no-cache openssl
WORKDIR /repo
ENV HUSKY=0 NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages packages

# Everything needed to build (and to run the seed, which uses tsx).
FROM base AS build
RUN --mount=type=cache,target=/root/.npm npm ci --workspace api --include-workspace-root --ignore-scripts
COPY apps/api apps/api
RUN npm run db:generate -w api && npm run build -w api

# Runtime dependencies only.
FROM base AS prod-deps
RUN --mount=type=cache,target=/root/.npm npm ci --workspace api --omit=dev --ignore-scripts

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
# openssl: Prisma's schema engine (used by the one-off `prisma migrate deploy`).
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=prod-deps --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --chown=node:node apps/api/package.json apps/api/prisma.config.ts ./
COPY --chown=node:node apps/api/prisma ./prisma
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health/live >/dev/null || exit 1
# Migrations run as a separate one-off (same image): npx prisma migrate deploy (as migrator).
CMD ["node", "dist/main.js"]
