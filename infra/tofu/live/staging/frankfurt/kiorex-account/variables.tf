variable "aws_account_id" {
  description = "AWS account id of this environment (guard). Prod: NEEDS_HUMAN (Identity account, HB05)."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account id."
  }
}

variable "git_sha" {
  description = "Image tag for the optional account service."
  type        = string
  default     = "unset"
}

variable "custom_domain" {
  description = "Custom IdP domain (account.kiorex.com). Empty = Cognito prefix domain."
  type        = string
  default     = ""
}

variable "zone_name" {
  description = "Route 53 zone of the custom domain."
  type        = string
  default     = ""
}

variable "prefix_domain" {
  description = "Cognito prefix domain when no custom domain."
  type        = string
  default     = null
}

variable "otp_bundle_path" {
  description = "Built zip of packages/otp-sender (see README). null = placeholder handlers."
  type        = string
  default     = null
}

variable "otp_extra_env" {
  description = "Non-secret OTP handler env (WA_PHONE_NUMBER_ID, WA_TEMPLATE_AR/EN)."
  type        = map(string)
  default     = {}
}

variable "test_otp_enabled" {
  description = "Fixed test OTP for seeded numbers (non-prod only)."
  type        = bool
  default     = false
}

variable "test_phone_numbers" {
  description = "Seeded test numbers."
  type        = list(string)
  default     = []
}

variable "deletion_protection" {
  description = "User pool deletion protection."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Lambda/log retention."
  type        = number
  default     = 90
}

variable "alarm_emails" {
  description = "Alarm subscribers (NEEDS_HUMAN)."
  type        = list(string)
  default     = []
}

variable "account_service_enabled" {
  description = "Optional small App Runner service for Passport web / OTP sender / back-channel logout dispatcher. Off: Lambdas only."
  type        = bool
  default     = false
}

variable "account_service" {
  description = "App Runner sizing and env for the optional account service."
  type        = any
  default     = {}
}
