#!/usr/bin/env bash
# Wakes the demo: starts the database (if stopped), then 1 API task, and waits until the load balancer says the
# API is healthy. Also used the first time, after db-bootstrap, migrate and seed.
# Usage: AWS_PROFILE=movie-demo bash infra/scripts/wake.sh
set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-7}"
NAME="movie-ticketing-demo"

STATUS=$(aws rds describe-db-instances --region "$REGION" --db-instance-identifier "$NAME" \
  --query 'DBInstances[0].DBInstanceStatus' --output text | tr -d '\r')
if [ "$STATUS" = "stopped" ]; then
  echo "Starting the database"
  aws rds start-db-instance --region "$REGION" --db-instance-identifier "$NAME" >/dev/null
fi
echo "Waiting for the database (up to ~10 minutes when it was stopped)..."
aws rds wait db-instance-available --region "$REGION" --db-instance-identifier "$NAME"

echo "Starting the API (1 task)"
aws ecs update-service --region "$REGION" --cluster "$NAME" --service api --desired-count 1 >/dev/null
echo "Waiting for the API to be running and healthy (usually 2-4 minutes)..."
aws ecs wait services-stable --region "$REGION" --cluster "$NAME" --services api

TG=$(aws elbv2 describe-target-groups --region "$REGION" --names "$NAME-api" \
  --query 'TargetGroups[0].TargetGroupArn' --output text | tr -d '\r')
echo "Load balancer health check:"
aws elbv2 describe-target-health --region "$REGION" --target-group-arn "$TG" \
  --query 'TargetHealthDescriptions[].[Target.Id, TargetHealth.State, TargetHealth.Reason]' --output table
