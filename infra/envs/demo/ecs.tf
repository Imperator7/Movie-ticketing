# Phase 4, step 2: ECS, the AWS version of `docker compose up`. Fargate runs our containers without servers to
# manage. This file defines WHAT can run (task definitions = the compose `services:`); step 3 adds the always-on
# API service and the load balancer.
#
#   db-bootstrap  once: create the migrator / app_user roles and the movie_ticketing database (as the RDS admin)
#   migrate       per release: `prisma migrate deploy` (as migrator)
#   seed          once now, daily later: movies, cinemas, showtimes (as app_user)
#   api           the API itself (step 3 runs it as a service)
#
# One-off tasks are started with infra/scripts/run-task.sh. They run in the public subnet with the `ops` security
# group (no inbound) and a public IP for outbound only (pulling images, SSM, logs), like the API.

locals {
  name = "${var.project}-${var.env}"

  # The newest pushed image of each repo, pinned by digest (an exact build, not a moving tag).
  # Deploying a new build = push-images.sh, then terraform apply.
  api_image  = "${aws_ecr_repository.repo["api"].repository_url}@${data.aws_ecr_image.api.image_digest}"
  seed_image = "${aws_ecr_repository.repo["seed"].repository_url}@${data.aws_ecr_image.seed.image_digest}"

  # Official Postgres image from AWS's public mirror of Docker Hub (no Docker Hub rate limits). Only psql is used.
  postgres_image = "public.ecr.aws/docker/library/postgres:17-alpine"

  ssm_arn = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}"
}

data "aws_ecr_image" "api" {
  repository_name = aws_ecr_repository.repo["api"].name
  most_recent     = true
}

data "aws_ecr_image" "seed" {
  repository_name = aws_ecr_repository.repo["seed"].name
  most_recent     = true
}

# ---- Cluster -----------------------------------------------------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = local.name

  # Container Insights costs extra; the demo uses plain logs.
  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

# FARGATE_SPOT = spare AWS capacity, about 70% cheaper; AWS can take it back with a 2-minute warning.
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
}

# ---- Logs (kept 7 days) ------------------------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}/api"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "ops" {
  name              = "/ecs/${local.name}/ops"
  retention_in_days = 7
}

# ---- IAM roles ---------------------------------------------------------------------------------------------------
# Execution role: used by ECS itself BEFORE the container starts (pull the image, read secrets, write logs).
# Task role: what the app's own code may do in AWS. Our API calls no AWS services, so it gets nothing.

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
    # Only tasks from this account may use the roles.
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

# AWS's standard policy: pull from ECR, write to CloudWatch Logs.
resource "aws_iam_role_policy_attachment" "execution_standard" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Read our secrets, and only ours (/movie/demo/*). The default aws/ssm key needs no extra KMS permission.
data "aws_iam_policy_document" "execution_secrets" {
  statement {
    actions   = ["ssm:GetParameters"]
    resources = ["${local.ssm_arn}/*"]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "read-movie-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

resource "aws_iam_role" "task" {
  name               = "${local.name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

# ---- Task definitions --------------------------------------------------------------------------------------------

locals {
  # Shared by every task definition below.
  task_common = {
    requires_compatibilities = ["FARGATE"]
    network_mode             = "awsvpc"
    execution_role_arn       = aws_iam_role.execution.arn
    task_role_arn            = aws_iam_role.task.arn
  }

  log_options = {
    for k, g in { api = aws_cloudwatch_log_group.api, ops = aws_cloudwatch_log_group.ops } : k => {
      logDriver       = "awslogs"
      options = {
        awslogs-group         = g.name
        awslogs-region        = var.region
        awslogs-stream-prefix = k
      }
    }
  }

  ssm = {
    database_url           = aws_ssm_parameter.database_url.arn
    migration_database_url = aws_ssm_parameter.migration_database_url.arn
    master_password        = aws_ssm_parameter.db_master_password.arn
    migrator_password      = aws_ssm_parameter.db_migrator_password.arn
    app_user_password      = aws_ssm_parameter.db_app_user_password.arn
  }
}

resource "aws_ecs_task_definition" "db_bootstrap" {
  family                   = "${local.name}-db-bootstrap"
  requires_compatibilities = local.task_common.requires_compatibilities
  network_mode             = local.task_common.network_mode
  execution_role_arn       = local.task_common.execution_role_arn
  task_role_arn            = local.task_common.task_role_arn
  cpu                      = 256
  memory                   = 512

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "db-bootstrap"
    image     = local.postgres_image
    essential = true
    # The script is sent as the container's command, so no image of our own is needed.
    # replace(): strip Windows line endings in case git checked the script out with CRLF.
    command = ["sh", "-c", replace(file("${path.module}/../../scripts/db-bootstrap.sh"), "\r", "")]
    environment = [
      { name = "PGHOST", value = aws_db_instance.main.address },
      { name = "PGUSER", value = aws_db_instance.main.username },
      { name = "APP_DB", value = local.db_name },
    ]
    secrets = [
      { name = "PGPASSWORD", valueFrom = local.ssm.master_password },
      { name = "MIGRATOR_PASSWORD", valueFrom = local.ssm.migrator_password },
      { name = "APP_USER_PASSWORD", valueFrom = local.ssm.app_user_password },
    ]
    logConfiguration = local.log_options.ops
  }])
}

resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name}-migrate"
  requires_compatibilities = local.task_common.requires_compatibilities
  network_mode             = local.task_common.network_mode
  execution_role_arn       = local.task_common.execution_role_arn
  task_role_arn            = local.task_common.task_role_arn
  cpu                      = 256
  memory                   = 512

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "migrate"
    image     = local.api_image
    essential = true
    # Never `npx prisma`: if the binary were missing, npx would silently download another Prisma version.
    command          = ["./node_modules/.bin/prisma", "migrate", "deploy"]
    secrets          = [{ name = "MIGRATION_DATABASE_URL", valueFrom = local.ssm.migration_database_url }]
    logConfiguration = local.log_options.ops
  }])
}

resource "aws_ecs_task_definition" "seed" {
  family                   = "${local.name}-seed"
  requires_compatibilities = local.task_common.requires_compatibilities
  network_mode             = local.task_common.network_mode
  execution_role_arn       = local.task_common.execution_role_arn
  task_role_arn            = local.task_common.task_role_arn
  cpu                      = 256
  memory                   = 1024 # tsx compiles the seed at start; 512 MB is tight

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "seed"
    image     = local.seed_image
    essential = true
    command   = ["npm", "run", "seed", "-w", "api"]
    # production = no demo user (the seed refuses SEED_DEMO_PASSWORD in production).
    environment      = [{ name = "NODE_ENV", value = "production" }]
    secrets          = [{ name = "DATABASE_URL", valueFrom = local.ssm.database_url }]
    logConfiguration = local.log_options.ops
  }])
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = local.task_common.requires_compatibilities
  network_mode             = local.task_common.network_mode
  execution_role_arn       = local.task_common.execution_role_arn
  task_role_arn            = local.task_common.task_role_arn
  cpu                      = 256 # 0.25 vCPU
  memory                   = 512 # 0.5 GB

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name         = "api"
    image        = local.api_image
    essential    = true
    portMappings = [{ containerPort = 4000, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "4000" },
      { name = "LOG_LEVEL", value = "info" },
      { name = "DB_POOL_MAX", value = "5" },
      # CloudFront + the ALB in front = 2 proxies, so the real client IP is found for rate limits.
      { name = "TRUST_PROXY_HOPS", value = "2" },
      { name = "PAYMENTS_PROVIDER", value = var.payments_provider },
      # WEB_ORIGINS (the CloudFront address) is added in Phase 5.
    ]
    secrets = concat(
      [{ name = "DATABASE_URL", valueFrom = local.ssm.database_url }],
      [for k, p in aws_ssm_parameter.api_secret : {
        name      = upper(replace(k, "-", "_")) # jwt-secret -> JWT_SECRET
        valueFrom = p.arn
      }],
    )
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:4000/api/v1/health/live >/dev/null || exit 1"]
      interval    = 10
      timeout     = 3
      retries     = 3
      startPeriod = 30
    }
    # On stop, the API first drains for SHUTDOWN_DRAIN_MS (5 s); give it time before ECS kills it.
    stopTimeout      = 30
    logConfiguration = local.log_options.api
  }])
}
