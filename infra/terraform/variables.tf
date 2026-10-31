variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Project prefix for resource naming"
  type        = string
  default     = "syncbytes"
}

variable "environment" {
  description = "Deployment environment (e.g. dev, prod)"
  type        = string
  default     = "prod"
}

variable "github_repo" {
  description = "GitHub repository (owner/repo) for IAM OIDC role"
  type        = string
  default     = "yashrrrr/SyncBytes"
}

variable "domain_name" {
  description = "Custom domain or DuckDNS subdomain"
  type        = string
  default     = "syncbytes.duckdns.org"
}
