variable "name" {
  description = "Name prefix (e.g. kiorex-account-prod)."
  type        = string
}

variable "env" {
  description = "Environment: staging | prod."
  type        = string
}

variable "custom_domain" {
  description = "Custom Cognito domain (account.kiorex.com). Empty = Cognito prefix domain (staging)."
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for the custom domain."
  type        = string
  default     = null
}

variable "prefix_domain" {
  description = "Cognito prefix domain used when custom_domain is empty."
  type        = string
  default     = null
}

variable "resource_server_identifier" {
  description = "OAuth resource server identifier (token audience concept for kiorex-api)."
  type        = string
  default     = "kiorex-api"
}

variable "clients" {
  description = "App clients matching INTEGRATION.md: kiorex-web, kiorex-ops, kiorex-mobile (public, PKCE) and kiorly-clinic (confidential)."
  type = map(object({
    generate_secret        = optional(bool, false)
    callback_urls          = list(string)
    logout_urls            = optional(list(string), [])
    backchannel_logout_uri = optional(string)
    scopes                 = optional(list(string), ["openid", "profile", "phone", "kx"])
  }))
}

variable "test_otp_enabled" {
  description = "Accept 000000 for numbers in test_phone_numbers. NEVER in prod."
  type        = bool
  default     = false
}

variable "test_phone_numbers" {
  description = "Seeded test phone numbers (INTEGRATION.md) that accept the fixed test OTP when test_otp_enabled."
  type        = list(string)
  default     = []
}

variable "deletion_protection" {
  description = "User pool deletion protection."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Lambda log retention."
  type        = number
  default     = 90
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}

variable "token_lifetimes" {
  description = "From config/idp.json tokenLifetimes (KA-04)."
  type = object({
    accessTokenSeconds = number
    idTokenSeconds     = number
    refreshTokenDays   = number
  })
  default = { accessTokenSeconds = 900, idTokenSeconds = 900, refreshTokenDays = 30 }
}

variable "totp_mfa" {
  description = "Enable optional software-token (TOTP) MFA on the pool (KA-03: required for privileged roles - enforced by step-up in the account service, Cognito cannot target roles natively)."
  type        = bool
  default     = true
}

variable "otp_bundle_path" {
  description = "Zip built from kiorex-account/packages/otp-sender (esbuild of src/lambda.ts, handlers lambda.defineAuthChallenge / createAuthChallenge / verifyAuthChallengeResponse). null = inline placeholder handlers."
  type        = string
  default     = null
}

variable "otp_channel" {
  description = "OTP_CHANNEL for the bundle (whatsapp-sms in staging/prod; log is rejected in production)."
  type        = string
  default     = "whatsapp-sms"
}

variable "otp_extra_env" {
  description = "Extra NON-secret env vars for the OTP handlers (WA_PHONE_NUMBER_ID, WA_TEMPLATE_AR, WA_TEMPLATE_EN). The WhatsApp access token is NEEDS_HUMAN: it must come from Secrets Manager, never from OpenTofu."
  type        = map(string)
  default     = {}
}

variable "set_access_token_aud" {
  description = "Pre-token trigger also attempts to set aud=kiorex-api (verify in staging: Cognito may treat aud as reserved)."
  type        = bool
  default     = false
}
