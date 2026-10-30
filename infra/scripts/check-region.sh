#!/usr/bin/env bash
# Phase 0: checks that the region supports what plan-infra.md uses. Read-only API calls, creates nothing, free.
# Usage: AWS_PROFILE=movie-demo bash infra/scripts/check-region.sh [region]
set -uo pipefail

REGION="${1:-ap-southeast-7}"
FAILED=0
ok() { printf 'OK    %s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; FAILED=1; }
aws_r() { aws --region "$REGION" --output text "$@" 2>/dev/null; }

echo "Region: $REGION"

ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) \
  && ok "signed in (account $ACCOUNT)" || { bad "not signed in: run aws sso login"; exit 1; }

AZS=$(aws_r ec2 describe-availability-zones --query 'AvailabilityZones[?State==`available`].ZoneName')
[ "$(wc -w <<<"$AZS")" -ge 2 ] && ok "availability zones: $AZS" \
  || bad "fewer than 2 AZs (is the region enabled?): $AZS"

PG=$(aws_r rds describe-db-engine-versions --engine postgres \
  --query 'DBEngineVersions[?starts_with(EngineVersion, `17.`)].EngineVersion' | tr '\t' '\n' | sort -V | tail -1)
[ -n "$PG" ] && ok "RDS PostgreSQL 17 (latest minor: $PG)" || bad "RDS PostgreSQL 17 not offered"

if [ -n "$PG" ]; then
  MICRO=$(aws_r rds describe-orderable-db-instance-options --engine postgres --engine-version "$PG" \
    --db-instance-class db.t4g.micro --query 'length(OrderableDBInstanceOptions)')
  [ "${MICRO:-0}" -gt 0 ] && ok "RDS db.t4g.micro for $PG" || bad "db.t4g.micro not offered for $PG"
fi

NANO=$(aws_r ec2 describe-instance-type-offerings --filters Name=instance-type,Values=t4g.nano \
  --query 'length(InstanceTypeOfferings)')
[ "${NANO:-0}" -gt 0 ] && ok "EC2 t4g.nano (fck-nat, Phase 9)" || bad "t4g.nano not offered"

SPOT=$(aws_r ecs describe-capacity-providers --capacity-providers FARGATE_SPOT \
  --query 'capacityProviders[0].name')
[ "$SPOT" = "FARGATE_SPOT" ] && ok "ECS FARGATE_SPOT capacity provider" || bad "FARGATE_SPOT not available"

aws_r elbv2 describe-load-balancers --page-size 1 >/dev/null && ok "Elastic Load Balancing reachable" \
  || bad "elbv2 API failed"

aws_r ssm describe-parameters --max-results 1 >/dev/null && ok "SSM Parameter Store reachable" \
  || bad "SSM API failed"

aws_r ecr describe-repositories --max-items 1 >/dev/null && ok "ECR reachable" || bad "ECR API failed"

aws --region us-east-1 wafv2 list-web-acls --scope CLOUDFRONT --output text >/dev/null 2>&1 \
  && ok "WAF (CLOUDFRONT scope, us-east-1)" || bad "WAF CLOUDFRONT scope failed"

aws cloudfront list-vpc-origins --output text >/dev/null 2>&1 && ok "CloudFront VPC origins API" \
  || bad "CloudFront VPC origins API failed (update the AWS CLI?)"

echo
[ "$FAILED" -eq 0 ] && echo "All checks passed." || echo "Some checks failed: send this output to the lead."
exit "$FAILED"
