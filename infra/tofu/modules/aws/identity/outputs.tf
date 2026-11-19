output "user_pool_id" {
  description = "Cognito user pool id."
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "Cognito user pool ARN."
  value       = aws_cognito_user_pool.this.arn
}

output "issuer" {
  description = "OIDC issuer URL (token `iss`; discovery at /.well-known/openid-configuration, JWKS at /.well-known/jwks.json)."
  value       = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
}

output "hosted_domain" {
  description = "Cognito domain name (custom or prefix)."
  value       = aws_cognito_user_pool_domain.this.domain
}

output "hosted_url" {
  description = "Base URL of the OAuth endpoints (/oauth2/authorize, /oauth2/token)."
  value       = local.use_custom_domain ? "https://${var.custom_domain}" : "https://${var.prefix_domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}

output "domain_cloudfront_distribution" {
  description = "CloudFront distribution behind the custom Cognito domain (target of the account.kiorex.com alias record)."
  value       = aws_cognito_user_pool_domain.this.cloudfront_distribution
}

output "domain_cloudfront_zone_id" {
  description = "Hosted zone id for the alias record."
  value       = aws_cognito_user_pool_domain.this.cloudfront_distribution_zone_id
}

output "client_ids" {
  description = "App client ids keyed by client name."
  value       = { for k, c in aws_cognito_user_pool_client.this : k => c.id }
}

output "client_secret_arns" {
  description = "Secrets Manager ARNs holding confidential client secrets."
  value       = { for k, s in aws_secretsmanager_secret.client : k => s.arn }
}

output "trigger_function_names" {
  description = "Lambda trigger function names (alarm targets)."
  value       = [for k, f in aws_lambda_function.fn : f.function_name]
}

output "otp_sender_function_arn" {
  description = "OTP sender placeholder Lambda ARN."
  value       = aws_lambda_function.fn["otp-sender"].arn
}

output "backchannel_registry_parameter" {
  description = "SSM parameter holding the back-channel logout registry."
  value       = aws_ssm_parameter.backchannel.name
}
