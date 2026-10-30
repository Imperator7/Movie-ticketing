# Phase 3: the database. One small PostgreSQL 17 server (RDS), private, in zone a next to the API task.
# Only the API and the one-off ops tasks can reach it (security-groups.tf). Passwords: secrets.tf.

# RDS must be given subnets in 2 zones (AWS rule), even for a single server. We pin the server to zone a below.
resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-${var.env}"
  subnet_ids = aws_subnet.db[*].id
  tags       = { Name = "${var.project}-${var.env}" }
}

# Database settings we change from AWS's defaults.
resource "aws_db_parameter_group" "main" {
  name   = "${var.project}-${var.env}-pg17"
  family = "postgres17"

  # Refuse any connection that is not encrypted (TLS). A "static" setting: AWS applies it on restart, and the
  # database already started with it. Without apply_method, every plan would try to change it back.
  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }

  # Log every query slower than 500 ms, so slow spots show up in the logs.
  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "main" {
  identifier = "${var.project}-${var.env}"

  engine                     = "postgres"
  engine_version             = "17" # AWS picks the newest 17.x and applies minor updates itself
  auto_minor_version_upgrade = true
  instance_class             = "db.t4g.micro" # smallest ARM size: 2 vCPU (burst), 1 GB RAM
  parameter_group_name       = aws_db_parameter_group.main.name

  # Admin login. Only the one-off db-bootstrap task uses it, to create the migrator / app_user roles and the
  # movie_ticketing database (so no database is created here).
  username = "movie_admin"
  password = random_password.db_master.result

  # Disk: 20 GB gp3 (the minimum), encrypted with the free AWS-managed key.
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  # Network: private db subnets, zone a only, never reachable from the internet.
  db_subnet_group_name   = aws_db_subnet_group.main.name
  availability_zone      = local.azs[0]
  multi_az               = false
  publicly_accessible    = false
  vpc_security_group_ids = [aws_security_group.db.id]

  # Backups: 1 day of automatic backups. On `terraform destroy` a final snapshot is kept.
  backup_retention_period   = 1
  copy_tags_to_snapshot     = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project}-${var.env}-final"

  # Protects against deleting it by accident: turn this off first if you really want to destroy the database.
  deletion_protection = true

  # Paid extras kept off for the demo.
  performance_insights_enabled = false
  monitoring_interval          = 0

  # Demo: apply setting changes now instead of waiting for the weekly maintenance window.
  apply_immediately = true

  tags = { Name = "${var.project}-${var.env}" }
}
