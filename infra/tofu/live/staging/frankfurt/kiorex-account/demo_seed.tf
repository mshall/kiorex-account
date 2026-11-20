# Q10 Part B: IAM for the Cognito demo seed (scripts/seed-cognito-demo.mjs). NON-PRODUCTION ONLY: this is the staging stack and the plan fails if the
# environment were prod. Passport on AWS is Cognito (no account DB / no Lambda): the seed is a script run by a human with a role that carries this
# policy. Nothing here creates users; the script does, after a human deployed staging.

variable "enable_demo_seed" {
  description = "Create the IAM policy that lets an operator run scripts/seed-cognito-demo.mjs against this (staging) pool."
  type        = bool
  default     = false
}

variable "demo_seed_principal_arns" {
  description = "IAM role/user ARNs that may assume the demo seed role (e.g. the staging operator's SSO role). Empty = policy only, attach it yourself."
  type        = list(string)
  default     = []
}

resource "terraform_data" "demo_seed_guard" {
  input = var.enable_demo_seed
  lifecycle {
    precondition {
      condition     = !(local.idp_env == "prod" && var.enable_demo_seed)
      error_message = "The Cognito demo seed must never be enabled in production."
    }
  }
}

data "aws_iam_policy_document" "cognito_demo_seed" {
  count = var.enable_demo_seed ? 1 : 0
  statement {
    sid = "SeedDemoUsersInThisPoolOnly"
    actions = [
      "cognito-idp:DescribeUserPool",
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminGetUser",
      "cognito-idp:AdminSetUserPassword",
      "cognito-idp:AdminUpdateUserAttributes",
      "cognito-idp:AdminDeleteUser",
    ]
    resources = [module.identity.user_pool_arn]
  }
}

resource "aws_iam_policy" "cognito_demo_seed" {
  count       = var.enable_demo_seed ? 1 : 0
  name        = "${local.name}-cognito-demo-seed"
  description = "Run scripts/seed-cognito-demo.mjs against the staging Passport user pool (non-production demo users)."
  policy      = data.aws_iam_policy_document.cognito_demo_seed[0].json
  tags        = merge(local.tags, { Purpose = "demo-seed" })
  depends_on  = [terraform_data.demo_seed_guard]
}

data "aws_iam_policy_document" "demo_seed_trust" {
  count = var.enable_demo_seed && length(var.demo_seed_principal_arns) > 0 ? 1 : 0
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = var.demo_seed_principal_arns
    }
  }
}

resource "aws_iam_role" "cognito_demo_seed" {
  count              = var.enable_demo_seed && length(var.demo_seed_principal_arns) > 0 ? 1 : 0
  name               = "${local.name}-cognito-demo-seed"
  assume_role_policy = data.aws_iam_policy_document.demo_seed_trust[0].json
  tags               = merge(local.tags, { Purpose = "demo-seed" })
}

resource "aws_iam_role_policy_attachment" "cognito_demo_seed" {
  count      = var.enable_demo_seed && length(var.demo_seed_principal_arns) > 0 ? 1 : 0
  role       = aws_iam_role.cognito_demo_seed[0].name
  policy_arn = aws_iam_policy.cognito_demo_seed[0].arn
}

output "cognito_demo_seed_policy_arn" {
  description = "IAM policy for the Cognito demo seed (null unless enable_demo_seed)."
  value       = one(aws_iam_policy.cognito_demo_seed[*].arn)
}

output "demo_seed_invoke" {
  description = "How to seed the demo personas into the staging pool after the deploy (a human runs it; scripts/seed-staging.sh does it as step 1)."
  value       = var.enable_demo_seed ? "DEMO_SEED_ALLOWED=true KIORLY_ENV=staging node scripts/seed-cognito-demo.mjs --user-pool-id ${module.identity.user_pool_id} --region ${local.region} --out .seed/cognito-sub-map.json" : null
}
