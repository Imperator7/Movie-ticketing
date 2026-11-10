#!/usr/bin/env bash
# Phase 9: checks that the NAT instance can do its job. Read-only: it changes nothing.
# Usage: AWS_PROFILE=<your-sso-profile> bash infra/scripts/check-nat.sh
#
# What each line proves:
#   running            the instance is on
#   status checks      AWS can reach it and its operating system answers
#   source/dest check  off, so it may forward other machines' traffic (a NAT's whole job)
#   public IP          it has an address on the internet side
#   route              the private `app` subnets send outside traffic to THIS instance, and the route is `active`
#                      (`blackhole` = the route points at a stopped or deleted instance)
# The final proof is a task that needs the internet: bash infra/scripts/run-task.sh migrate
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash: don't rewrite arguments that start with a slash

REGION="${AWS_REGION:-ap-southeast-7}"
NAME="movie-ticketing-demo"
FAILED=0

check() { # check "<label>" "<actual>" "<expected>"
  if [ "$2" = "$3" ]; then
    echo "OK    $1: $2"
  else
    echo "FAIL  $1: $2 (expected $3)"
    FAILED=1
  fi
}

ID=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Name,Values=$NAME-nat" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[].Instances[].InstanceId' --output text | tr -d '\r')
if [ -z "$ID" ]; then
  echo "FAIL  no NAT instance with tag Name=$NAME-nat. Run terraform apply first."
  exit 1
fi
echo "NAT instance: $ID"

read -r STATE SRC_DST PUBLIC_IP ENI < <(aws ec2 describe-instances --region "$REGION" --instance-ids "$ID" \
  --query 'Reservations[0].Instances[0].[State.Name, SourceDestCheck, PublicIpAddress, NetworkInterfaces[0].NetworkInterfaceId]' \
  --output text | tr -d '\r')
check "state" "$STATE" "running"
check "source/dest check" "$SRC_DST" "False"
if [ "$PUBLIC_IP" = "None" ] || [ -z "$PUBLIC_IP" ]; then
  echo "FAIL  public IP: none"
  FAILED=1
else
  echo "OK    public IP: $PUBLIC_IP"
fi

if [ "$STATE" = "running" ]; then
  read -r SYS INST < <(aws ec2 describe-instance-status --region "$REGION" --instance-ids "$ID" \
    --query 'InstanceStatuses[0].[SystemStatus.Status, InstanceStatus.Status]' --output text | tr -d '\r')
  check "status check (AWS side)" "$SYS" "ok"
  check "status check (instance side)" "$INST" "ok"
fi

read -r ROUTE_ENI ROUTE_STATE < <(aws ec2 describe-route-tables --region "$REGION" \
  --filters "Name=tag:Name,Values=$NAME-app" \
  --query "RouteTables[0].Routes[?DestinationCidrBlock=='0.0.0.0/0'] | [0].[NetworkInterfaceId, State]" \
  --output text | tr -d '\r')
check "app route 0.0.0.0/0 goes to the NAT" "${ROUTE_ENI:-none}" "$ENI"
check "app route state" "${ROUTE_STATE:-none}" "active"

if [ "$FAILED" = "0" ]; then
  echo "NAT looks healthy. Final proof: bash infra/scripts/run-task.sh migrate (it must pull its image and exit 0)."
else
  echo "NAT is NOT ready. Asleep? Run infra/scripts/wake.sh."
  exit 1
fi
