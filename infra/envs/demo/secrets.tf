# Phase 3: secrets. Terraform generates every password and key, and stores them in SSM Parameter Store as
# SecureString (encrypted, free tier). ECS reads them into the API container in Phase 4; nothing is in the code.
#
# Note: generated values are also kept in the Terraform state file. That file sits in the private, encrypted
# state bucket, so treat access to the bucket like access to the secrets.
#
# Stripe keys are typed in by hand later (Phase 7), so they are not here.

locals {
  ssm_prefix = "/movie/${var.env}"
  db_name    = "movie_ticketing"

  # Where the API image keeps the AWS RDS certificate bundle (apps/api/Dockerfile), so connections check they are
  # talking to the real database. The two tools spell this differently:
  #   the API and the seed (node-postgres): sslmode=verify-full + sslrootcert
  #   Prisma Migrate (its own engine):      sslmode=require + sslcert + sslaccept=strict
  rds_ca_path     = "/app/certs/rds-global-bundle.pem"
  db_options      = "schema=public&sslmode=verify-full&sslrootcert=${local.rds_ca_path}"
  migrate_options = "schema=public&sslmode=require&sslcert=${local.rds_ca_path}&sslaccept=strict"
  db_host         = "${aws_db_instance.main.address}:${aws_db_instance.main.port}"
}

# ---- Generated values --------------------------------------------------------------------------------------------
# Letters and digits only, so they can go inside a database URL without escaping.

resource "random_password" "db_master" {
  length  = 32
  special = false
}

resource "random_password" "db_migrator" {
  length  = 32
  special = false
}

resource "random_password" "db_app_user" {
  length  = 32
  special = false
}

# The API refuses secrets shorter than 32 bytes; 48 characters is well above that.
resource "random_password" "api" {
  for_each = toset(["jwt-secret", "refresh-token-pepper", "ticket-qr-secret"])
  length   = 48
  special  = false
}

# ---- SSM parameters ----------------------------------------------------------------------------------------------

# Read only by the db-bootstrap task.
resource "aws_ssm_parameter" "db_master_password" {
  name  = "${local.ssm_prefix}/db/master-password"
  type  = "SecureString"
  value = random_password.db_master.result
}

resource "aws_ssm_parameter" "db_migrator_password" {
  name  = "${local.ssm_prefix}/db/migrator-password"
  type  = "SecureString"
  value = random_password.db_migrator.result
}

resource "aws_ssm_parameter" "db_app_user_password" {
  name  = "${local.ssm_prefix}/db/app-user-password"
  type  = "SecureString"
  value = random_password.db_app_user.result
}

# The running API connects as app_user (read/write rows only).
resource "aws_ssm_parameter" "database_url" {
  name  = "${local.ssm_prefix}/api/database-url"
  type  = "SecureString"
  value = "postgresql://app_user:${random_password.db_app_user.result}@${local.db_host}/${local.db_name}?${local.db_options}"
}

# The migrate task connects as migrator (owns the tables, changes the schema).
resource "aws_ssm_parameter" "migration_database_url" {
  name  = "${local.ssm_prefix}/api/migration-database-url"
  type  = "SecureString"
  value = "postgresql://migrator:${random_password.db_migrator.result}@${local.db_host}/${local.db_name}?${local.migrate_options}"
}

# JWT_SECRET, REFRESH_TOKEN_PEPPER, TICKET_QR_SECRET.
resource "aws_ssm_parameter" "api_secret" {
  for_each = random_password.api
  name     = "${local.ssm_prefix}/api/${each.key}"
  type     = "SecureString"
  value    = each.value.result
}
