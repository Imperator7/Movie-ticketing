# Phase 4, step 3: the load balancer (ALB). The API task's IP changes on every restart; the ALB gives it one fixed
# address, sends traffic only to a healthy task, and lets a deploy start the new task before stopping the old one.
#
# INTERNAL: no public address at all. Phase 5 connects CloudFront to it privately (a "VPC origin"), so CloudFront
# is the only way in. Until then nothing can reach it (its security group has no inbound rule yet).

resource "aws_lb" "api" {
  name               = "${local.name}-api"
  internal           = true
  load_balancer_type = "application"
  subnets            = aws_subnet.app[*].id # zones a and b: AWS requires two
  security_groups    = [aws_security_group.alb.id]

  # Reject requests with malformed headers instead of passing them to the API.
  drop_invalid_header_fields = true

  tags = { Name = "${local.name}-api" }
}

# The group of API tasks the ALB sends traffic to. ECS adds and removes tasks here by their IP.
resource "aws_lb_target_group" "api" {
  name        = "${local.name}-api"
  vpc_id      = aws_vpc.main.id
  target_type = "ip" # Fargate tasks are registered by IP
  protocol    = "HTTP"
  port        = 4000

  # "Ready" checks the database too: a task that can't reach the database gets no traffic.
  health_check {
    path                = "/api/v1/health/ready"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  # When a task stops, give in-flight requests time to finish (the API drains for 5 s itself).
  deregistration_delay = 15

  tags = { Name = "${local.name}-api" }
}

# Plain HTTP inside the VPC. Visitors get HTTPS from CloudFront (Phase 5); the hop CloudFront → ALB stays inside AWS.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
