#!/usr/bin/env bash
# Phase 6 (used by the Deploy workflow): registers a new version of a task definition that is a copy of the current
# one with a different image. Prints the new task definition ARN.
# Usage: bash infra/scripts/register-image.sh <family> <image>
#   e.g. register-image.sh movie-ticketing-demo-api 7037….dkr.ecr.ap-southeast-7.amazonaws.com/movie-api:abc123
# Terraform still owns the task definitions: on the next `terraform apply` it registers its own version with the
# newest image, which is the same build.
set -euo pipefail

FAMILY="${1:?family}"
IMAGE="${2:?image}"
REGION="${AWS_REGION:-ap-southeast-7}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Drop the fields AWS adds itself; register-task-definition refuses them.
aws ecs describe-task-definition --region "$REGION" --task-definition "$FAMILY" --query taskDefinition \
  --output json |
  jq --arg image "$IMAGE" '
    .containerDefinitions[0].image = $image
    | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
          .registeredAt, .registeredBy, .deregisteredAt)' >"$TMP"

aws ecs register-task-definition --region "$REGION" --cli-input-json "file://$TMP" \
  --query taskDefinition.taskDefinitionArn --output text
