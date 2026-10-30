# Phase 2: security groups (firewalls around each piece). Rules point at other groups, not at IP ranges,
# so "the API accepts traffic from the ALB" stays true however many tasks or IPs there are.
#
#   CloudFront ──80──► alb ──4000──► api ──5432──► db ◄──5432── ops (one-off tasks: migrate, seed, db-bootstrap)
#
# Security groups are stateful: replies to an allowed connection are always let back in, so we only write the
# direction that starts the connection.

# ---- Default group: lock it ---------------------------------------------------------------------------------------
# Every VPC comes with a "default" group that lets its members talk freely. We never use it; this empties it so
# nothing ends up in it by accident.

resource "aws_default_security_group" "default" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project}-${var.env}-default-unused" }
}

# ---- Groups ------------------------------------------------------------------------------------------------------
# Terraform removes AWS's default "allow all outbound" rule, so each group can only do what is written below.

resource "aws_security_group" "alb" {
  name        = "${var.project}-${var.env}-alb"
  description = "Internal ALB: in from CloudFront only, out to the API"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${var.project}-${var.env}-alb" }
}

resource "aws_security_group" "api" {
  name        = "${var.project}-${var.env}-api"
  description = "API task: in from the ALB only"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${var.project}-${var.env}-api" }
}

resource "aws_security_group" "ops" {
  name        = "${var.project}-${var.env}-ops"
  description = "One-off tasks (migrate, seed, db-bootstrap): no inbound"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${var.project}-${var.env}-ops" }
}

resource "aws_security_group" "db" {
  name        = "${var.project}-${var.env}-db"
  description = "RDS: in from the API and ops tasks only, no outbound"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${var.project}-${var.env}-db" }
}

# ---- ALB ---------------------------------------------------------------------------------------------------------
# Inbound from CloudFront is added in Phase 5: AWS creates the CloudFront VPC-origin security group only when the
# VPC origin itself is created. Until then the ALB accepts nothing.

resource "aws_vpc_security_group_egress_rule" "alb_to_api" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = 4000
  to_port                      = 4000
  description                  = "Forward requests to the API"
}

# ---- API ---------------------------------------------------------------------------------------------------------

resource "aws_vpc_security_group_ingress_rule" "api_from_alb" {
  security_group_id            = aws_security_group.api.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 4000
  to_port                      = 4000
  description                  = "Requests from the ALB"
}

# HTTPS out: pull the image (ECR), read secrets (SSM), write logs (CloudWatch), call Stripe.
resource "aws_vpc_security_group_egress_rule" "api_https" {
  security_group_id = aws_security_group.api.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "HTTPS to AWS services and Stripe"
}

resource "aws_vpc_security_group_egress_rule" "api_to_db" {
  security_group_id            = aws_security_group.api.id
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL"
}

# ---- Ops tasks (no inbound at all) --------------------------------------------------------------------------------

resource "aws_vpc_security_group_egress_rule" "ops_https" {
  security_group_id = aws_security_group.ops.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "HTTPS to AWS services (ECR, SSM, logs)"
}

resource "aws_vpc_security_group_egress_rule" "ops_to_db" {
  security_group_id            = aws_security_group.ops.id
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL"
}

# ---- Database (no outbound) --------------------------------------------------------------------------------------

resource "aws_vpc_security_group_ingress_rule" "db_from_api" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL from the API"
}

resource "aws_vpc_security_group_ingress_rule" "db_from_ops" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.ops.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL from migrate / seed / db-bootstrap"
}
