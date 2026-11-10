#!/usr/bin/env bash
# Adds random API secrets to the root .env (used by the full Docker Compose stack). Never overwrites existing ones.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env
# A hand-edited .env may not end with a newline; without one the first key below is glued onto the last line.
[ -z "$(tail -c1 .env)" ] || echo >> .env
for key in JWT_SECRET REFRESH_TOKEN_PEPPER TICKET_QR_SECRET; do
  if ! grep -q "^${key}=" .env; then
    echo "${key}=$(openssl rand -base64 48 | tr -d '\n')" >> .env
    echo "added ${key}"
  fi
done
