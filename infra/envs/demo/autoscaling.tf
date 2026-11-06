
# What can be scaled, and between which limits.
resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = 1
  max_capacity       = 2
}

# How to scale: aim for 60% average CPU across the api tasks.
resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.name}-api-cpu-60"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    # Add a task quickly (wait 1 minute between scale-outs), remove one slowly (5 minutes), so a short dip
    # doesn't stop a task that is needed again a moment later.
    scale_out_cooldown = 60
    scale_in_cooldown  = 300
  }
}
