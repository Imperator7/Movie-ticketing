# Phase 9: the NAT. Lets tasks in the private `app` subnets call OUT to the internet (pull images from ECR, read
# secrets from SSM, write logs, call Stripe) without having a public address themselves. Nothing can call IN.
#
#   task (private, no public IP)  ->  NAT instance (public subnet)  ->  internet gateway  ->  internet
#
# fck-nat = an open-source NAT image on a tiny EC2 instance: about USD 3 a month. AWS's managed NAT gateway does
# the same job for about USD 33 a month. Trade-off: one small instance in one zone, and if it stops, the tasks
# can't call out until it is back. Fine for a demo.

# The newest fck-nat image for ARM (Amazon Linux 2023), published by the fck-nat project's AWS account.
data "aws_ami" "fck_nat" {
  most_recent = true
  owners      = ["568608671756"]

  filter {
    name   = "name"
    values = ["fck-nat-al2023-*-arm64-ebs"]
  }
}

# Who may send traffic through the NAT: only our own tasks, only HTTPS.
resource "aws_security_group" "nat" {
  name        = "${local.name}-nat"
  description = "NAT instance: HTTPS in from our tasks, HTTPS out to the internet"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-nat" }
}

resource "aws_vpc_security_group_ingress_rule" "nat_from_api" {
  security_group_id            = aws_security_group.nat.id
  referenced_security_group_id = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  description                  = "HTTPS from the API task"
}

resource "aws_vpc_security_group_ingress_rule" "nat_from_ops" {
  security_group_id            = aws_security_group.nat.id
  referenced_security_group_id = aws_security_group.ops.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  description                  = "HTTPS from migrate / seed / db-bootstrap"
}

resource "aws_vpc_security_group_egress_rule" "nat_https" {
  security_group_id = aws_security_group.nat.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "HTTPS to the internet"
}

resource "aws_instance" "nat" {
  ami           = data.aws_ami.fck_nat.id
  instance_type = "t4g.nano"

  # The NAT itself must be reachable from the internet side, so it sits in the PUBLIC subnet with a public IP.
  subnet_id                   = aws_subnet.public.id
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.nat.id]

  # A normal instance drops packets that are not addressed to it. A NAT forwards other machines' packets, so this
  # check must be off.
  source_dest_check = false

  # No SSH key: nobody logs in to this machine. IMDSv2 only (a hardening default).
  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    encrypted = true
  }

  # A newer fck-nat image must not replace the running NAT by surprise on some later `terraform apply`.
  # To upgrade on purpose: terraform apply -replace=aws_instance.nat
  lifecycle {
    ignore_changes = [ami]
  }

  tags = { Name = "${local.name}-nat" }
}

# The private `app` subnets: everything that is not inside the VPC goes to the NAT instance.
resource "aws_route" "app_internet" {
  route_table_id         = aws_route_table.app.id
  destination_cidr_block = "0.0.0.0/0"
  network_interface_id   = aws_instance.nat.primary_network_interface_id
}
