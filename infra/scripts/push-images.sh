#!/usr/bin/env bash
# Phase 4: builds the API images for ARM64 (the Fargate task runs on Graviton) and pushes them to ECR.
#   movie-api:<commit>       runtime image (API + `prisma migrate deploy`)
#   movie-api-seed:<commit>  build image (the seed needs tsx)
# The tag is the current git commit, so commit first: the script refuses uncommitted changes, because a tag can
# never be overwritten and must always mean the same code.
# Needs Docker Desktop running. On an x86 PC the ARM64 build is emulated and slow (5-15 minutes the first time).
# Usage: AWS_PROFILE=movie-demo bash infra/scripts/push-images.sh
set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-7}"
cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes. Commit (or stash) them first, so the image tag matches the code." >&2
  exit 1
fi

TAG=$(git rev-parse --short=12 HEAD)
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

echo "Signing Docker in to $REGISTRY"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

push() { # <repo> <dockerfile target>
  local image="$REGISTRY/$1:$TAG"
  if aws ecr describe-images --region "$REGION" --repository-name "$1" --image-ids imageTag="$TAG" \
    >/dev/null 2>&1; then
    echo "$image already exists, skipping"
    return
  fi
  echo "Building and pushing $image"
  # One plain image per tag (no provenance/SBOM side entries), so the ECR "keep 5" rule counts real images.
  docker buildx build --platform linux/arm64 --target "$2" --provenance=false --sbom=false \
    -f apps/api/Dockerfile -t "$image" --push .
}

push movie-api runtime
push movie-api-seed build

echo "Done. Images tagged $TAG"
