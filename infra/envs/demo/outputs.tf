output "account_id" {
  value = data.aws_caller_identity.current.account_id
}

output "availability_zones" {
  value = data.aws_availability_zones.available.names
}

output "db_endpoint" {
  description = "Private address of the database (only reachable from inside the VPC)."
  value       = aws_db_instance.main.address
}

output "db_availability_zone" {
  value = aws_db_instance.main.availability_zone
}

output "ecr_repositories" {
  description = "Where push-images.sh pushes the images."
  value       = { for k, r in aws_ecr_repository.repo : k => r.repository_url }
}

# Read by infra/scripts/run-task.sh.
output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "task_subnet_id" {
  description = "Private subnet (zone a) where the API and the one-off tasks run."
  value       = aws_subnet.app[0].id
}

output "nat_instance_id" {
  description = "The fck-nat instance (infra/scripts/check-nat.sh, sleep.sh and wake.sh find it by its Name tag)."
  value       = aws_instance.nat.id
}

output "ops_security_group_id" {
  value = aws_security_group.ops.id
}

# Phase 5 connects CloudFront to this load balancer.
output "alb_arn" {
  value = aws_lb.api.arn
}

output "alb_dns_name" {
  description = "Private address, only reachable inside the VPC (CloudFront reaches it from Phase 5)."
  value       = aws_lb.api.dns_name
}

# ---- Phase 5 ----

output "site_url" {
  description = "The demo. Open this."
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "web_bucket" {
  value = aws_s3_bucket.web.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.main.id
}



output "sns_topic_arn" {
  description = "SNS topic for ECS alerts"
  value       = aws_sns_topic.ecs_alerts.arn
}

output "cpu_alarm_name" {
  description = "CloudWatch CPU alarm name"
  value       = aws_cloudwatch_metric_alarm.ecs_cpu.alarm_name
}
