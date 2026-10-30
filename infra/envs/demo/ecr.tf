# Phase 4, step 1: the image registry (ECR). Our private Docker Hub inside AWS. ECS pulls the API image from here.
#
#   movie-api       the runtime image: the API itself, and the one-off `prisma migrate deploy` task
#   movie-api-seed  the build image (it has tsx, which the seed needs): the one-off seed task
#
# Images are tagged with the git commit (infra/scripts/push-images.sh). Tags can't be overwritten, so a tag always
# means exactly one build.

locals {
  ecr_repos = {
    api  = "movie-api"
    seed = "movie-api-seed"
  }
}

resource "aws_ecr_repository" "repo" {
  for_each = local.ecr_repos

  name                 = each.value
  image_tag_mutability = "IMMUTABLE"

  # Free basic scan for known vulnerabilities on every push (results in the ECR console).
  image_scanning_configuration {
    scan_on_push = true
  }

  # Demo: lets `terraform destroy` remove the repo even if it still holds images.
  force_delete = true

  tags = { Name = each.value }
}

# Keep only the 5 newest images per repo, so storage stays near zero.
resource "aws_ecr_lifecycle_policy" "keep_last_5" {
  for_each   = aws_ecr_repository.repo
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 5 newest images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}
