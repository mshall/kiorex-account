variable "environment" {
  description = "Domain-table environment: staging | production (local has no DNS). Selects the block of config/domains.json."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "zone_name" {
  description = "Hosted zone that holds the kiorly hosts (kiorly.com for production; staging hosts live under staging.kiorly.com inside the same zone)."
  type        = string
  default     = "kiorly.com"
}

variable "cloudfront_targets" {
  description = "Where each web host points: key = web host role (home, clinic, nurse, pharmacy, lab, clinic_alias_0, apex), value = CloudFront distribution domain + hosted zone id. Empty until the founder approves the first deploy: no record is created for roles that are not listed."
  type = map(object({
    domain_name = string
    zone_id     = string
  }))
  default = {}
}

variable "apprunner_domains" {
  description = "Optional App Runner custom-domain associations: key = host role, value = service ARN. Used for API hosts (api.clinic, api.pharmacy, api.lab) that are not behind CloudFront. Validation CNAMEs are output for the registrar-free Route 53 zone."
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
