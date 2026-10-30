# Phase 4, step 3: run the seed task every night, so there are always 31 days of showtimes ahead. The seed only
# ADDS what is missing; it never changes or deletes showtimes that may have bookings.
# EventBridge Scheduler is AWS's cron. It starts the task with its own small IAM role.

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${local.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

# Allowed: start the seed task (any revision), and hand it its two roles. Nothing else.
data "aws_iam_policy_document" "scheduler_run_seed" {
  statement {
    actions   = ["ecs:RunTask"]
    resources = ["arn:aws:ecs:${var.region}:${data.aws_caller_identity.current.account_id}:task-definition/${aws_ecs_task_definition.seed.family}:*"]
  }
  statement {
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.execution.arn, aws_iam_role.task.arn]
  }
}

resource "aws_iam_role_policy" "scheduler_run_seed" {
  name   = "run-seed-task"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_run_seed.json
}

resource "aws_scheduler_schedule" "seed" {
  name                         = "${local.name}-seed-daily"
  schedule_expression          = "cron(0 3 * * ? *)" # 03:00 every day
  schedule_expression_timezone = "Asia/Bangkok"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_ecs_cluster.main.arn
    role_arn = aws_iam_role.scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.seed.arn
      launch_type         = "FARGATE"

      network_configuration {
        subnets          = [aws_subnet.public.id]
        security_groups  = [aws_security_group.ops.id]
        assign_public_ip = true
      }
    }

    retry_policy {
      maximum_retry_attempts = 1
    }
  }
}
