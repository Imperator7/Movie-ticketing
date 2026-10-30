locals {
  tags = {
    project      = var.project
    env          = var.env
    "managed-by" = "terraform"
  }
}

# Credentials come from the environment (AWS_PROFILE=movie-demo locally, OIDC in CI), never from code.
provider "aws" {
  region = var.region
  default_tags {
    tags = local.tags
  }
}

# CloudFront-scoped resources (WAF web ACL, ACM certificates) must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = local.tags
  }
}
