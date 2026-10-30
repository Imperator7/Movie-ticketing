# syntax=docker/dockerfile:1.7
# API image (OPS-2): multi-stage, production dependencies only, runs as the non-root `node` user.
# Build from the repo root:  docker build -f apps/api/Dockerfile -t movie-api .
# Pin by digest for releases: docker buildx imagetools inspect node:24.11-alpine3.22
ARG NODE_IMAGE=node:24.11-alpine3.22

FROM ${NODE_IMAGE} AS base
# openssl: Prisma detects it to pick its engines (generate / migrate).
RUN apk add --no-cache openssl
# AWS RDS root certificates, so connections to RDS verify the server (sslmode=verify-full). The checksum pins the
# file: if AWS publishes a new bundle the build fails here, and we update the hash on purpose.
ADD --checksum=sha256:90a6f1a7978a1b1b096dca6c57511ca48d3b8cf052f8e704baf358f34ea2f21b --chmod=644 \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-global-bundle.pem
WORKDIR /repo
ENV HUSKY=0 NEXT_TELEMETRY_DISABLED=1
# Patient downloads: emulated ARM64 builds (on an x86 PC) are slow, and npm's defaults gave up on one package.
ENV NPM_CONFIG_FETCH_RETRIES=5 NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
  NPM_CONFIG_FETCH_TIMEOUT=600000
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages packages

# Everything needed to build (and to run the seed, which uses tsx).
FROM base AS build
RUN --mount=type=cache,target=/root/.npm npm ci --workspace api --include-workspace-root --ignore-scripts
COPY apps/api apps/api
RUN npm run db:generate -w api && npm run build -w api

# Runtime dependencies only. npm nests some of them (the Prisma CLI among them) in apps/api/node_modules when the
# root needs another version, so the runtime keeps the monorepo layout instead of flattening it.
FROM base AS prod-deps
RUN --mount=type=cache,target=/root/.npm npm ci --workspace api --omit=dev --ignore-scripts
# Download Prisma's schema engine now, so `prisma migrate deploy` never needs the internet at run time.
COPY apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
RUN cd apps/api && ./node_modules/.bin/prisma version

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
# openssl: Prisma's schema engine (used by the one-off `prisma migrate deploy`).
RUN apk add --no-cache openssl
WORKDIR /repo/apps/api
COPY --from=base /app/certs /app/certs
# Prisma Migrate reads only the FIRST certificate of a file, and the bundle starts with another region's CA. Give it
# a file with just the CA our RDS instance uses (database.tf: default rds-ca-rsa2048-g1, Bangkok).
ARG RDS_PRISMA_CA="Amazon RDS ap-southeast-7 Root CA RSA2048 G1"
RUN cd /app/certs \
  && awk '/BEGIN CERT/{n++} {print > ("part" n ".pem")}' rds-global-bundle.pem \
  && for f in part*.pem; do \
       if openssl x509 -in "$f" -noout -subject | grep -q "CN = $RDS_PRISMA_CA,"; then mv "$f" rds-prisma-ca.pem; fi; \
     done \
  && rm -f part*.pem && test -s rds-prisma-ca.pem
COPY --from=prod-deps --chown=node:node /repo/node_modules /repo/node_modules
COPY --from=prod-deps --chown=node:node /repo/apps/api/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --chown=node:node apps/api/package.json apps/api/prisma.config.ts ./
COPY --chown=node:node apps/api/prisma ./prisma
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health/live >/dev/null || exit 1
# Migrations: same image, command `./node_modules/.bin/prisma migrate deploy` (as migrator). Never `npx prisma`:
# if the binary is not found npx silently downloads the latest Prisma instead.
CMD ["node", "dist/main.js"]
