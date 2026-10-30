terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Remote state in the product owner's existing state bucket (shared with the portfolio, separate key).
  # Bucket and region come from backend.hcl (git-ignored, copy backend.hcl.example):
  #   terraform init -backend-config=backend.hcl
  backend "s3" {
    key          = "movie-ticketing/demo/terraform.tfstate"
    encrypt      = true
    use_lockfile = true # S3 native lock file, no DynamoDB table
  }
}
