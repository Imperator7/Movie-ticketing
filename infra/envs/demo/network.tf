# Phase 2: the VPC. Demo = everything RUNS in one zone (zone a).
#   public  : zone a only. Route to the internet (IGW). The API task runs here (no NAT until Phase 9).
#   app     : private, no internet route. The internal load balancer (ALB) lives here.
#   db      : private, no internet route. RDS lives here (single instance in zone a).
# AWS rule: an ALB and an RDS subnet group each need subnets in 2 zones, so app and db get an extra,
# empty subnet in zone b. Subnets are free.

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  public_cidr = "10.20.0.0/24"
  app_cidrs   = ["10.20.10.0/24", "10.20.11.0/24"]
  db_cidrs    = ["10.20.20.0/24", "10.20.21.0/24"]
}

resource "aws_vpc" "main" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true # RDS and the ALB are reached by DNS name

  tags = { Name = "${var.project}-${var.env}" }
}

# ---- Subnets -----------------------------------------------------------------------------------------------------

resource "aws_subnet" "public" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.public_cidr
  availability_zone = local.azs[0]

  # Nothing gets a public IP by default; the ECS service asks for one explicitly.
  map_public_ip_on_launch = false

  tags = { Name = "${var.project}-${var.env}-public-${local.azs[0]}" }
}

resource "aws_subnet" "app" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.app_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = { Name = "${var.project}-${var.env}-app-${local.azs[count.index]}" }
}

resource "aws_subnet" "db" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.db_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = { Name = "${var.project}-${var.env}-db-${local.azs[count.index]}" }
}

# ---- Internet gateway + route tables -----------------------------------------------------------------------------

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project}-${var.env}" }
}

# Public: everything not inside the VPC goes to the internet gateway.
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project}-${var.env}-public" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# App and db: only the VPC's own "local" route (added by AWS automatically). No internet in or out.
resource "aws_route_table" "app" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project}-${var.env}-app" }
}

resource "aws_route_table_association" "app" {
  count          = 2
  subnet_id      = aws_subnet.app[count.index].id
  route_table_id = aws_route_table.app.id
}

resource "aws_route_table" "db" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project}-${var.env}-db" }
}

resource "aws_route_table_association" "db" {
  count          = 2
  subnet_id      = aws_subnet.db[count.index].id
  route_table_id = aws_route_table.db.id
}

# ---- S3 gateway endpoint (free) ----------------------------------------------------------------------------------
# Lets S3 traffic (ECR image layers are stored in S3) stay inside AWS instead of going over the internet.

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id, aws_route_table.app.id]

  tags = { Name = "${var.project}-${var.env}-s3" }
}
