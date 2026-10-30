variable "region" {
  description = "Main region for the VPC, ECS and RDS."
  type        = string
  default     = "ap-southeast-7"
}

variable "project" {
  type    = string
  default = "movie-ticketing"
}

variable "env" {
  type    = string
  default = "demo"
}

variable "payments_provider" {
  description = "fake = demo pay button, no Stripe. Must be stripe before Phase 5 makes the API public (D5)."
  type        = string
  default     = "fake"
  validation {
    condition     = contains(["fake", "stripe"], var.payments_provider)
    error_message = "payments_provider must be fake or stripe."
  }
}
