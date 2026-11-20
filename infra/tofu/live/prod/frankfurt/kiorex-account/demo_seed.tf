# Q10 Part B: production never gets demo data. The variable exists only so a stray `enable_demo_seed = true` fails the plan loudly.
variable "enable_demo_seed" {
  description = "NEVER true in production (the plan fails)."
  type        = bool
  default     = false
}

resource "terraform_data" "demo_seed_guard" {
  input = var.enable_demo_seed
  lifecycle {
    precondition {
      condition     = !var.enable_demo_seed
      error_message = "The Cognito demo seed must never be enabled in production."
    }
  }
}
