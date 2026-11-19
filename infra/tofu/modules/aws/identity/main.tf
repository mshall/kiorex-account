# Identity contract (kiorex-account only): managed IdP = Amazon Cognito user pool (KX-21 §08, KX-04).
#  - phone-number sign-in with CUSTOM_AUTH (OTP) via Lambda triggers - PLACEHOLDERS, provider wiring is NEEDS_HUMAN
#  - access/ID token claims per INTEGRATION.md: sub, phone_number, phone_number_verified, name, locale, kx_roles
#  - app clients: kiorex-web / kiorex-ops / kiorex-mobile (public, PKCE) and kiorly-clinic (confidential)
#  - custom domain account.kiorex.com (certificate in us-east-1)
# No clinical data in identity.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  use_custom_domain = var.custom_domain != ""
  fn_names          = ["define-auth-challenge", "create-auth-challenge", "verify-auth-challenge", "pre-token-generation", "otp-sender"]
}

# --- Lambda triggers (inline placeholder code) -----------------------------------------------------------
locals {
  code = {
    "define-auth-challenge" = <<-EOT
      // Custom auth: up to 3 OTP attempts, then fail.
      exports.handler = async (event) => {
        const s = event.request.session || [];
        const last = s[s.length - 1];
        if (last && last.challengeName === "CUSTOM_CHALLENGE" && last.challengeResult === true) {
          event.response.issueTokens = true;
          event.response.failAuthentication = false;
        } else if (s.length >= 3) {
          event.response.issueTokens = false;
          event.response.failAuthentication = true;
        } else {
          event.response.issueTokens = false;
          event.response.failAuthentication = false;
          event.response.challengeName = "CUSTOM_CHALLENGE";
        }
        return event;
      };
    EOT
    "create-auth-challenge" = <<-EOT
      // PLACEHOLDER: generates a 6-digit OTP and hands it to the otp-sender function (WhatsApp/SMS adapter).
      const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
      const crypto = require("crypto");
      const lambda = new LambdaClient({});
      exports.handler = async (event) => {
        const prev = event.request.session || [];
        let code;
        if (prev.length > 0) {
          code = String(prev[prev.length - 1].challengeMetadata || "").replace("CODE-", "");
        } else {
          code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
          await lambda.send(new InvokeCommand({
            FunctionName: process.env.OTP_SENDER_FUNCTION,
            InvocationType: "Event",
            Payload: Buffer.from(JSON.stringify({
              phone: event.request.userAttributes.phone_number,
              code: code,
              locale: event.request.userAttributes.locale || "ar",
            })),
          }));
        }
        event.response.publicChallengeParameters = { channel: "otp" };
        event.response.privateChallengeParameters = { answer: code };
        event.response.challengeMetadata = "CODE-" + code;
        return event;
      };
    EOT
    "verify-auth-challenge" = <<-EOT
      // Non-prod only: TEST_OTP_ENABLED=true accepts 000000 for the seeded test numbers (INTEGRATION.md).
      exports.handler = async (event) => {
        const expected = event.request.privateChallengeParameters.answer;
        const given = String(event.request.challengeAnswer || "");
        const phones = (process.env.TEST_PHONES || "").split(",").filter(Boolean);
        const testOk = process.env.TEST_OTP_ENABLED === "true" && given === "000000" && phones.includes(event.request.userAttributes.phone_number);
        event.response.answerCorrect = given === expected || testOk;
        return event;
      };
    EOT
    "pre-token-generation"  = <<-EOT
      // Adds kx_roles + identity claims to access and ID tokens (Pre token generation V2_0).
      // NOTE: Cognito access tokens carry client_id (not aud); the audience claim 'kiorex-api' of INTEGRATION.md is
      // enforced via the resource-server scope - Kiorex API must validate scope/client_id (NEEDS_HUMAN, see README).
      exports.handler = async (event) => {
        const a = event.request.userAttributes || {};
        const roles = String(a["custom:kx_roles"] || "patient").split(",").map((s) => s.trim()).filter(Boolean);
        const claims = {
          kx_roles: roles,
          phone_number: a.phone_number,
          phone_number_verified: String(a.phone_number_verified === "true"),
          locale: a.locale || "ar",
        };
        if (a.name) claims.name = a.name;
        if (process.env.SET_AUD === "true") claims.aud = "kiorex-api";
        event.response = {
          claimsAndScopeOverrideDetails: {
            idTokenGeneration: { claimsToAddOrOverride: claims },
            accessTokenGeneration: { claimsToAddOrOverride: claims },
          },
        };
        return event;
      };
    EOT
    "otp-sender"            = <<-EOT
      // PLACEHOLDER (TODO_NEEDS_HUMAN): wire WhatsApp Cloud API / SMS provider + approved Meta template ids here.
      // Never log the code or the full phone number.
      exports.handler = async (event) => {
        console.log(JSON.stringify({ msg: "otp-sender placeholder - no provider wired", phoneLast4: String(event.phone || "").slice(-4), locale: event.locale }));
        return { sent: false };
      };
    EOT
  }
}

data "archive_file" "fn" {
  for_each    = local.code
  type        = "zip"
  output_path = "${path.module}/.tmp/${var.name}-${each.key}.zip"
  source {
    filename = "index.js"
    content  = each.value
  }
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "fn" {
  name               = "${var.name}-idp-triggers"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "fn_logs" {
  role       = aws_iam_role.fn.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "fn_invoke_sender" {
  name = "invoke-otp-sender"
  role = aws_iam_role.fn.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.fn["otp-sender"].arn
    }]
  })
}

resource "aws_cloudwatch_log_group" "fn" {
  for_each          = local.code
  name              = "/aws/lambda/${var.name}-${each.key}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

locals {
  bundle_handlers = {
    "define-auth-challenge" = "lambda.defineAuthChallenge"
    "create-auth-challenge" = "lambda.createAuthChallenge"
    "verify-auth-challenge" = "lambda.verifyAuthChallengeResponse"
  }
  use_bundle = var.otp_bundle_path != null
}

resource "aws_lambda_function" "fn" {
  for_each      = local.code
  function_name = "${var.name}-${each.key}"
  role          = aws_iam_role.fn.arn
  runtime       = "nodejs22.x"
  # Real handlers from packages/otp-sender when a bundle is supplied; inline placeholders otherwise.
  handler          = local.use_bundle && contains(keys(local.bundle_handlers), each.key) ? local.bundle_handlers[each.key] : "index.handler"
  filename         = local.use_bundle && contains(keys(local.bundle_handlers), each.key) ? var.otp_bundle_path : data.archive_file.fn[each.key].output_path
  source_code_hash = local.use_bundle && contains(keys(local.bundle_handlers), each.key) ? filebase64sha256(var.otp_bundle_path) : data.archive_file.fn[each.key].output_base64sha256
  timeout          = 10
  memory_size      = 128

  environment {
    variables = merge(
      each.key == "create-auth-challenge" ? { OTP_SENDER_FUNCTION = "${var.name}-otp-sender" } : {},
      each.key == "verify-auth-challenge" ? {
        TEST_OTP_ENABLED = tostring(var.test_otp_enabled)
        TEST_PHONES      = join(",", var.test_phone_numbers)
      } : {},
      each.key == "otp-sender" ? { OTP_PROVIDER = "none" } : {},
      each.key == "pre-token-generation" ? { SET_AUD = tostring(var.set_access_token_aud) } : {},
      local.use_bundle && contains(keys(local.bundle_handlers), each.key) ? merge(
        {
          NODE_ENV         = var.env == "prod" ? "production" : "staging"
          OTP_CHANNEL      = var.otp_channel
          OTP_TEST_NUMBERS = var.test_otp_enabled ? join(",", var.test_phone_numbers) : ""
        },
        var.otp_extra_env,
      ) : {},
    )
  }

  tags       = var.tags
  depends_on = [aws_cloudwatch_log_group.fn, aws_iam_role_policy_attachment.fn_logs]
}

resource "terraform_data" "no_test_otp_in_prod" {
  lifecycle {
    precondition {
      condition     = !(var.env == "prod" && var.test_otp_enabled)
      error_message = "The fixed test OTP must never be enabled in production."
    }
  }
}

# --- User pool -----------------------------------------------------------------------------------------------
resource "aws_cognito_user_pool" "this" {
  name                     = var.name
  user_pool_tier           = "ESSENTIALS" # required for Pre token generation V2_0
  username_attributes      = ["phone_number"]
  auto_verified_attributes = ["phone_number"]
  mfa_configuration        = var.totp_mfa ? "OPTIONAL" : "OFF" # OTP is the first factor; TOTP for privileged roles (KA-03)
  deletion_protection      = var.deletion_protection ? "ACTIVE" : "INACTIVE"

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  schema {
    name                = "phone_number"
    attribute_data_type = "String"
    required            = true
    mutable             = true
    string_attribute_constraints {}
  }

  schema {
    name                = "locale"
    attribute_data_type = "String"
    required            = false
    mutable             = true
    string_attribute_constraints {}
  }

  # Comma-separated roles, e.g. "ops_admin,super_admin". Set only by admins/back-office; not client-writable.
  schema {
    name                     = "kx_roles"
    attribute_data_type      = "String"
    developer_only_attribute = false
    required                 = false
    mutable                  = true
    string_attribute_constraints {
      min_length = 0
      max_length = 512
    }
  }

  dynamic "software_token_mfa_configuration" {
    for_each = var.totp_mfa ? [1] : []
    content {
      enabled = true
    }
  }

  lambda_config {
    define_auth_challenge          = aws_lambda_function.fn["define-auth-challenge"].arn
    create_auth_challenge          = aws_lambda_function.fn["create-auth-challenge"].arn
    verify_auth_challenge_response = aws_lambda_function.fn["verify-auth-challenge"].arn
    pre_token_generation_config {
      lambda_arn     = aws_lambda_function.fn["pre-token-generation"].arn
      lambda_version = "V2_0"
    }
  }

  tags = var.tags

  lifecycle {
    ignore_changes = [schema] # Cognito schema is immutable after creation
  }
}

resource "aws_lambda_permission" "cognito" {
  for_each      = toset(["define-auth-challenge", "create-auth-challenge", "verify-auth-challenge", "pre-token-generation"])
  statement_id  = "AllowCognito-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn[each.key].function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.this.arn
}

resource "aws_cognito_resource_server" "api" {
  identifier   = var.resource_server_identifier
  name         = "Kiorex Passport"
  user_pool_id = aws_cognito_user_pool.this.id
  scope {
    scope_name        = "access"
    scope_description = "Access the Kiorex API as the signed-in user"
  }
  scope {
    scope_name        = "kx"
    scope_description = "Role hints only - never grants clinical access (ADR-013)"
  }
}

# --- App clients (INTEGRATION.md) -------------------------------------------------------------------------------
resource "aws_cognito_user_pool_client" "this" {
  for_each     = var.clients
  name         = each.key
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret                      = each.value.generate_secret
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"] # authorization code + PKCE
  allowed_oauth_scopes = concat(
    [for sc in each.value.scopes : sc if contains(["openid", "profile", "phone"], sc)],
    ["${var.resource_server_identifier}/access"],
    contains(each.value.scopes, "kx") ? ["${var.resource_server_identifier}/kx"] : [],
  )
  supported_identity_providers  = ["COGNITO"]
  callback_urls                 = each.value.callback_urls
  logout_urls                   = each.value.logout_urls
  explicit_auth_flows           = ["ALLOW_CUSTOM_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  access_token_validity  = var.token_lifetimes.accessTokenSeconds
  id_token_validity      = var.token_lifetimes.idTokenSeconds
  refresh_token_validity = var.token_lifetimes.refreshTokenDays
  token_validity_units {
    access_token  = "seconds"
    id_token      = "seconds"
    refresh_token = "days"
  }

  depends_on = [aws_cognito_resource_server.api]
}

# Confidential client secrets go to Secrets Manager for the owning product (never printed / output).
resource "aws_secretsmanager_secret" "client" {
  for_each                = { for k, c in var.clients : k => c if c.generate_secret }
  name                    = "${var.name}/client-${each.key}"
  description             = "OIDC client secret for ${each.key} (hand over to the owning product's secret store)"
  recovery_window_in_days = var.env == "prod" ? 30 : 0
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "client" {
  for_each  = aws_secretsmanager_secret.client
  secret_id = each.value.id
  secret_string = jsonencode({
    client_id     = aws_cognito_user_pool_client.this[each.key].id
    client_secret = aws_cognito_user_pool_client.this[each.key].client_secret
  })
}

# --- Domain -------------------------------------------------------------------------------------------------------
# Custom domain account.kiorex.com: Cognito requires the parent domain (kiorex.com) to resolve to an A record first
# (NEEDS_HUMAN: DNS prerequisite) and an ACM certificate in us-east-1.
resource "aws_cognito_user_pool_domain" "this" {
  domain          = local.use_custom_domain ? var.custom_domain : var.prefix_domain
  certificate_arn = local.use_custom_domain ? var.certificate_arn : null
  user_pool_id    = aws_cognito_user_pool.this.id
}

# --- Back-channel logout registry (config-as-code) --------------------------------------------------------------------
# Cognito does not emit OIDC back-channel logout itself. The account service (or a later Lambda) reads this registry
# and POSTs a signed logout_token on `session.revoked` / `subject.deleted` (KX-04, INTEGRATION.md).
resource "aws_ssm_parameter" "backchannel" {
  name = "/kiorex/account/${var.env}/backchannel-logout-clients"
  type = "String"
  value = jsonencode({
    for k, c in var.clients : aws_cognito_user_pool_client.this[k].id => {
      client_name            = k
      backchannel_logout_uri = c.backchannel_logout_uri
    } if c.backchannel_logout_uri != null
  })
  tags = var.tags
}
