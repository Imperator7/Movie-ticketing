terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Same state bucket as the portfolio, but its own key, so the two states never touch.
  backend "s3" {
    bucket       = "state-bucket-portfolio-project"
    key          = "movie-ticketing/demo/terraform.tfstate"
    region       = "ap-southeast-7"
    encrypt      = true
    use_lockfile = true
  }
}
