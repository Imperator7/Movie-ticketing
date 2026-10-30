# syntax=docker/dockerfile:1.7
# Web image: Next.js static export served by nginx, with /api forwarded to the API and security headers
# (WEB-2, WEB-3). Build from the repo root:  docker build -f apps/web/Dockerfile -t movie-web .
ARG NODE_IMAGE=node:24.11-alpine3.22
ARG NGINX_IMAGE=nginx:1.29-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
ENV HUSKY=0 NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages packages
RUN --mount=type=cache,target=/root/.npm npm ci --workspace web --include-workspace-root --ignore-scripts
COPY apps/web apps/web
# Same origin as the page: nginx forwards /api to the API, so no CORS and the refresh cookie stays first-party.
ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
RUN npm run build -w web

FROM ${NGINX_IMAGE} AS runtime
# API_UPSTREAM is substituted into the template at start (nginx official image envsubst).
ENV API_UPSTREAM=http://api:4000
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/out /usr/share/nginx/html
EXPOSE 8080
