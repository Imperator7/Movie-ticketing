#!/usr/bin/env bash
# Phase 4: runs a one-off ECS task, waits for it to finish, prints its logs and exits with its exit code.
# Usage: AWS_PROFILE=movie-demo bash infra/scripts/run-task.sh <db-bootstrap|migrate|seed>
# First time, in this order: db-bootstrap, migrate, seed.
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash: don't turn /ecs/... into a Windows path

TASK="${1:?usage: run-task.sh <db-bootstrap|migrate|seed>}"
REGION="${AWS_REGION:-ap-southeast-7}"

# Locally the ids come from Terraform; in GitHub Actions from the environment (ECS_CLUSTER, ECS_SUBNET,
# ECS_SECURITY_GROUP), so the workflow needs no access to the Terraform state.
out() { (cd "$(git rev-parse --show-toplevel)/infra/envs/demo" && terraform output -raw "$1"); }
CLUSTER="${ECS_CLUSTER:-$(out ecs_cluster)}"
SUBNET="${ECS_SUBNET:-$(out public_subnet_id)}"
SG="${ECS_SECURITY_GROUP:-$(out ops_security_group_id)}"
FAMILY="$CLUSTER-$TASK"

echo "Starting $FAMILY"
# On-demand FARGATE (not Spot) for one-off tasks: a few cents, and never interrupted halfway through a migration.
ARN=$(aws ecs run-task --region "$REGION" --cluster "$CLUSTER" --task-definition "$FAMILY" \
  --launch-type FARGATE --count 1 \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SG],assignPublicIp=ENABLED}" \
  --query 'tasks[0].taskArn' --output text)
echo "Task $ARN"
echo "Waiting for it to finish (usually 1-3 minutes)..."
aws ecs wait tasks-stopped --region "$REGION" --cluster "$CLUSTER" --tasks "$ARN"

read -r EXIT REASON < <(aws ecs describe-tasks --region "$REGION" --cluster "$CLUSTER" --tasks "$ARN" \
  --query 'tasks[0].[containers[0].exitCode, stoppedReason]' --output text | tr -d '\r')

echo "---- logs ----"
aws logs tail "/ecs/$CLUSTER/ops" --region "$REGION" --since 15m \
  --log-stream-names "ops/$TASK/${ARN##*/}" --format short || true
echo "--------------"
echo "Exit code: $EXIT ($REASON)"
[ "$EXIT" = "0" ]
