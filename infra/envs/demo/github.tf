# Phase 6: lets GitHub Actions deploy, with NO stored AWS keys. GitHub gives each workflow run a short-lived signed
# token (OIDC); AWS checks it came from our repo's main branch and hands out temporary credentials for this role.
#
# The deploy role can only: push our 2 images, register/run our task definitions, roll the api service, upload the
# website to its bucket and clear the CloudFront cache. It can't touch the network, the database or IAM.

variable "github_repository" {
  description = "owner/name of the GitHub repo allowed to deploy."
  type        = string
  default     = "Imperator7/Movie-ticketing"
}

# The account already has GitHub's OIDC provider (created for the portfolio). There can be only one per account,
# so we use it instead of creating another.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Only workflow runs on our repo's main branch. Pull requests and other branches get nothing.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = "${local.name}-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.github_assume.json
  max_session_duration = 3600
}

locals {
  account_id   = data.aws_caller_identity.current.account_id
  ecs_arn_base = "arn:aws:ecs:${var.region}:${local.account_id}"
}

data "aws_iam_policy_document" "github_deploy" {
  # Sign Docker in to ECR (this action can't be limited to a repo).
  statement {
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  # Push and inspect images in our 2 repos only.
  statement {
    actions = [
      "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:DescribeImages",
    ]
    resources = [for r in aws_ecr_repository.repo : r.arn]
  }
  # Read the current task definitions and register new versions with the new image.
  statement {
    actions   = ["ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"]
    resources = ["*"] # AWS doesn't support resource limits on these two
  }
  # Run our one-off tasks (migrate) and follow them.
  statement {
    actions   = ["ecs:RunTask"]
    resources = ["${local.ecs_arn_base}:task-definition/${local.name}-*:*"]
  }
  statement {
    actions   = ["ecs:DescribeTasks"]
    resources = ["${local.ecs_arn_base}:task/${local.name}/*"]
  }
  # Roll out the API service.
  statement {
    actions   = ["ecs:UpdateService", "ecs:DescribeServices"]
    resources = [aws_ecs_service.api.id]
  }
  # Hand the tasks their two roles (and only to ECS).
  statement {
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.execution.arn, aws_iam_role.task.arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
  # Print the migrate task's log in the workflow.
  statement {
    actions   = ["logs:FilterLogEvents", "logs:GetLogEvents"]
    resources = ["${aws_cloudwatch_log_group.ops.arn}:*"]
  }
  # Upload the website and clear the cache.
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.web.arn]
  }
  statement {
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]
  }
  statement {
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.main.arn]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "deploy-demo"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}

# Copy these into GitHub: repo → Settings → Secrets and variables → Actions → Variables. None of them is secret.
output "github_actions_variables" {
  value = {
    AWS_DEPLOY_ROLE_ARN        = aws_iam_role.github_deploy.arn
    ECS_SUBNET                 = aws_subnet.public.id
    ECS_SECURITY_GROUP         = aws_security_group.ops.id
    WEB_BUCKET                 = aws_s3_bucket.web.bucket
    CLOUDFRONT_DISTRIBUTION_ID = aws_cloudfront_distribution.main.id
    SITE_URL                   = "https://${aws_cloudfront_distribution.main.domain_name}"
  }
}
