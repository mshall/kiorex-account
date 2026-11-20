# live/staging/frankfurt/kiorex-account: Kiorex Passport identity (Cognito) + optional account service.

locals {
  cells  = jsondecode(file("${path.root}/../../../../../../platform/data-cells.json")).cells
  cell   = "frankfurt"
  region = local.cells[local.cell].awsRegion
  name   = "kiorex-account-staging"
  tags = {
    Product          = "kiorex-account"
    Env              = "staging"
    Owner            = "platform-team"
    CostCenter       = "kiorex-account"
    KiorlyHostCell   = local.cell
    KiorlyDataRegion = local.region
    KiorlyStackRole  = "identity-cell"
    KiorlyDataClass  = "identity"
  }
  custom = var.custom_domain != ""

  # Clients, token lifetimes and scopes come from config/idp.json (KA-01..05) - single source of truth.
  idp     = jsondecode(file("${path.root}/../../../../../../config/idp.json"))
  idp_env = "staging"
  is_url  = { for u in distinct(flatten([for c in local.idp.clients : concat(c.environments[local.idp_env].redirectUris, c.environments[local.idp_env].postLogoutRedirectUris, try([c.environments[local.idp_env].backchannelLogoutUri], []))])) : u => can(regex("^[a-z][a-z0-9+.-]*://", u)) }
  clients = {
    for c in local.idp.clients : c.clientId => {
      generate_secret        = c.type == "confidential"
      scopes                 = [for s in c.scopes : s if s != "offline_access"] # Cognito issues refresh tokens without a scope
      callback_urls          = [for u in c.environments[local.idp_env].redirectUris : u if local.is_url[u]]
      logout_urls            = [for u in c.environments[local.idp_env].postLogoutRedirectUris : u if local.is_url[u]]
      backchannel_logout_uri = try(local.is_url[c.environments[local.idp_env].backchannelLogoutUri] ? c.environments[local.idp_env].backchannelLogoutUri : null, null) # the Passport SPA client has none
    }
  }
  # Clients whose redirect URIs are still TODO_NEEDS_HUMAN in idp.json are skipped (Cognito needs >= 1 callback URL).
  deployable_clients = { for k, c in local.clients : k => c if length(c.callback_urls) > 0 }
}

provider "aws" {
  region              = local.region
  allowed_account_ids = [var.aws_account_id]
  default_tags {
    tags = {
      Product          = "kiorex-account"
      Env              = "staging"
      Owner            = "platform-team"
      CostCenter       = "kiorex-account"
      ManagedBy        = "opentofu"
      KiorlyHostCell   = local.cell
      KiorlyDataRegion = local.region
    }
  }
}

# ACM certificate for the Cognito custom domain must be in us-east-1.
provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = [var.aws_account_id]
  default_tags {
    tags = {
      Product          = "kiorex-account"
      Env              = "staging"
      Owner            = "platform-team"
      CostCenter       = "kiorex-account"
      ManagedBy        = "opentofu"
      KiorlyHostCell   = local.cell
      KiorlyDataRegion = local.region
    }
  }
}

resource "terraform_data" "cell_guard" {
  input = data.aws_region.current.region
  lifecycle {
    precondition {
      condition     = data.aws_region.current.region == local.cells[local.cell].awsRegion
      error_message = "Data residency: cell ${local.cell} requires region ${local.cells[local.cell].awsRegion}."
    }
  }
}

data "aws_region" "current" {}

data "aws_route53_zone" "this" {
  count        = local.custom ? 1 : 0
  name         = var.zone_name
  private_zone = false
}

module "dns_certs" {
  count     = local.custom ? 1 : 0
  source    = "../../../../modules/aws/dns-certs"
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1 }

  certificates = { idp = { domain = var.custom_domain, zone_id = data.aws_route53_zone.this[0].zone_id } }
  # Alias record to the Cognito-managed CloudFront distribution.
  create_alias_records   = true
  alias_records          = { idp = { name = var.custom_domain, zone_id = data.aws_route53_zone.this[0].zone_id } }
  cloudfront_domain_name = module.identity.domain_cloudfront_distribution
  cloudfront_zone_id     = module.identity.domain_cloudfront_zone_id
  tags                   = local.tags
}

module "identity" {
  source = "../../../../modules/aws/identity"

  name                = local.name
  env                 = "staging"
  custom_domain       = var.custom_domain
  certificate_arn     = local.custom ? module.dns_certs[0].certificate_arns["idp"] : null
  prefix_domain       = var.prefix_domain
  clients             = local.deployable_clients
  token_lifetimes     = local.idp.tokenLifetimes
  otp_bundle_path     = var.otp_bundle_path
  otp_extra_env       = var.otp_extra_env
  test_otp_enabled    = var.test_otp_enabled
  test_phone_numbers  = var.test_phone_numbers
  deletion_protection = var.deletion_protection
  log_retention_days  = var.log_retention_days
  tags                = merge(local.tags, { Name = terraform_data.cell_guard.output })
}

module "observability" {
  source = "../../../../modules/aws/observability"

  name                  = local.name
  alarm_emails          = var.alarm_emails
  lambda_function_names = module.identity.trigger_function_names
  log_retention_days    = var.log_retention_days
  tags                  = local.tags
}

# Optional: Passport web / OTP sender / back-channel logout dispatcher (no DB, no CDN, default egress).
module "account_service" {
  count     = var.account_service_enabled ? 1 : 0
  source    = "../../../../modules/product-stack"
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1 }

  product    = "kiorex-account"
  env        = "staging"
  cell       = local.cell
  cells      = local.cells
  stack_role = "identity-cell"
  image_tag  = var.git_sha

  enable_database = false
  enable_uploads  = false
  enable_cdn      = false
  waf_enabled     = false
  api             = lookup(var.account_service, "api", {})
  env_vars = merge(
    {
      NODE_ENV                       = "production"
      COGNITO_USER_POOL_ID           = module.identity.user_pool_id
      COGNITO_ISSUER                 = module.identity.issuer
      OTP_SENDER_FUNCTION_ARN        = module.identity.otp_sender_function_arn
      BACKCHANNEL_REGISTRY_PARAMETER = module.identity.backchannel_registry_parameter
    },
    lookup(var.account_service, "env_vars", {}),
  )
  extra_policy_json  = [data.aws_iam_policy_document.account_service.json]
  alarm_emails       = var.alarm_emails
  log_retention_days = var.log_retention_days
}

data "aws_iam_policy_document" "account_service" {
  statement {
    sid       = "ManageUsers"
    actions   = ["cognito-idp:AdminGetUser", "cognito-idp:AdminUpdateUserAttributes", "cognito-idp:AdminUserGlobalSignOut", "cognito-idp:AdminDeleteUser"]
    resources = [module.identity.user_pool_arn]
  }
  statement {
    sid       = "InvokeOtpSender"
    actions   = ["lambda:InvokeFunction"]
    resources = [module.identity.otp_sender_function_arn]
  }
  statement {
    sid       = "ReadBackchannelRegistry"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${local.region}:${var.aws_account_id}:parameter${module.identity.backchannel_registry_parameter}"]
  }
}
