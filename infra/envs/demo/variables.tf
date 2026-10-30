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
