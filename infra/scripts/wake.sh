#!/usr/bin/env bash
# Wakes the demo: starts the NAT instance and the database (if stopped), then 1 API task, and waits until the
# load balancer says the API is healthy. Also used the first time, after db-bootstrap, migrate and seed.
# Usage: AWS_PROFILE=<your-sso-profile> bash infra/scripts/wake.sh
set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-7}"
NAME="movie-ticketing-demo"

# The NAT first: without it a new API task can't pull its image or read its secrets.
NAT=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Name,Values=$NAME-nat" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[].Instances[].InstanceId' --output text | tr -d '\r')
if [ -z "$NAT" ]; then
  echo "No NAT instance found (tag Name=$NAME-nat). Run terraform apply first." >&2
  exit 1
fi
NAT_STATE=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$NAT" \
  --query 'Reservations[0].Instances[0].State.Name' --output text | tr -d '\r')
if [ "$NAT_STATE" = "stopping" ]; then
  aws ec2 wait instance-stopped --region "$REGION" --instance-ids "$NAT"
  NAT_STATE=stopped
fi
if [ "$NAT_STATE" = "stopped" ]; then
  echo "Starting the NAT instance ($NAT)"
  aws ec2 start-instances --region "$REGION" --instance-ids "$NAT" >/dev/null
fi
echo "Waiting for the NAT instance to pass its status checks (1-2 minutes)..."
aws ec2 wait instance-status-ok --region "$REGION" --instance-ids "$NAT"

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
