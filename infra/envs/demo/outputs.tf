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

output "public_subnet_id" {
  value = aws_subnet.public.id
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
