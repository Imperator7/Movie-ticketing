# Demo environment. Phase 1 has no resources yet: it proves the S3 backend, the lock file and both providers work.
# Phase 2+ add modules here (network, database, app, edge, cicd).

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}
