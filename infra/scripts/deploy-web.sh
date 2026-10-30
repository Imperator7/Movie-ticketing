#!/usr/bin/env bash
# Phase 5: builds the website (static export) and uploads it to the S3 bucket behind CloudFront.
#   _next/static/*  hashed file names, never change → cached for a year
#   everything else  (HTML, ...) → "no-cache": browsers and CloudFront check for a new version every time
# Then tells CloudFront to drop what it cached, so the new version shows right away.
# Needs `npm ci` done once in the repo. Usage: AWS_PROFILE=movie-demo bash infra/scripts/deploy-web.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash: don't turn "/*" into a Windows path

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
# Locally from Terraform; in GitHub Actions from the environment (WEB_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, SITE_URL).
out() { (cd "$ROOT/infra/envs/demo" && terraform output -raw "$1"); }
BUCKET="${WEB_BUCKET:-$(out web_bucket)}"
DIST="${CLOUDFRONT_DISTRIBUTION_ID:-$(out cloudfront_distribution_id)}"
URL="${SITE_URL:-$(out site_url)}"

echo "Building the website"
# Same origin as the page: CloudFront sends /api/* to the API.
NEXT_PUBLIC_API_BASE_URL=/api/v1 npm run build -w web

OUT="apps/web/out"
echo "Uploading to s3://$BUCKET"
aws s3 sync "$OUT/_next/static" "s3://$BUCKET/_next/static" \
  --cache-control "public, max-age=31536000, immutable" --only-show-errors
# --delete removes pages that no longer exist; old _next/static files stay, for visitors still on the old version.
aws s3 sync "$OUT" "s3://$BUCKET" --exclude "_next/static/*" \
  --cache-control "no-cache" --delete --only-show-errors

echo "Clearing the CloudFront cache"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" \
  --query 'Invalidation.Id' --output text

echo "Done: $URL (give CloudFront a minute)"
