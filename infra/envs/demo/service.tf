# Phase 4, step 3: the API service. Like `restart: unless-stopped` in docker compose: ECS keeps 1 API task running
# all the time, replaces it if it crashes, and registers it with the ALB.

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  # Created with 0 tasks, so the API doesn't start before the database is set up. infra/scripts/wake.sh starts it
  # (and sleep.sh stops it); Terraform never changes the count afterwards (ignore_changes below).
  desired_count = 0

  # Spot: ~70% cheaper. If AWS takes the capacity back, ECS starts a new task (about a minute of downtime).
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  # Public subnet + public IP for OUTBOUND only (ECR, SSM, logs); the `api` security group lets in only the ALB.
  network_configuration {
    subnets          = [aws_subnet.public.id]
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }

  # Deploys: start the new task first (up to 200%), stop the old one only when the new one is healthy (100%).
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # If a new version never becomes healthy, stop trying and roll back to the last working one.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Give a new task a minute to start before ALB health checks can mark it bad.
  health_check_grace_period_seconds = 60

  # sleep.sh / wake.sh change the task count (0 or 1); Terraform must not undo that.
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener.http, aws_ecs_cluster_capacity_providers.main]
}
