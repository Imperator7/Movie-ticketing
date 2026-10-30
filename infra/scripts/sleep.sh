#!/usr/bin/env bash
# Puts the demo to sleep to save money: API tasks to 0, database stopped.
# Still billed while asleep: the load balancer (~USD 0.6/day), database storage, ECR images. `terraform destroy`
# removes everything.
# Usage: AWS_PROFILE=movie-demo bash infra/scripts/sleep.sh
set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-7}"
NAME="movie-ticketing-demo"

echo "Stopping the API (0 tasks)"
aws ecs update-service --region "$REGION" --cluster "$NAME" --service api --desired-count 0 >/dev/null

STATUS=$(aws rds describe-db-instances --region "$REGION" --db-instance-identifier "$NAME" \
  --query 'DBInstances[0].DBInstanceStatus' --output text | tr -d '\r')
if [ "$STATUS" = "available" ]; then
  echo "Stopping the database"
  aws rds stop-db-instance --region "$REGION" --db-instance-identifier "$NAME" >/dev/null
else
  echo "Database is '$STATUS', not stopping it"
fi

echo "Asleep. Note: AWS starts a stopped database again by itself after 7 days; run this again then."
echo "The 03:00 seed task still runs and fails while the database is stopped (costs nothing noticeable)."
