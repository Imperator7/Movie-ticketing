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
