output "user_pool_id" {
  description = "Cognito user pool id."
  value       = module.identity.user_pool_id
}

output "issuer" {
  description = "OIDC issuer URL."
  value       = module.identity.issuer
}

output "hosted_url" {
  description = "OAuth endpoints base URL."
  value       = module.identity.hosted_url
}

output "client_ids" {
  description = "App client ids."
  value       = module.identity.client_ids
}

output "client_secret_arns" {
  description = "Secrets Manager ARNs of confidential client secrets."
  value       = module.identity.client_secret_arns
}

output "account_service_url" {
  description = "Optional account service URL."
  value       = one(module.account_service[*].api_origin)
}

output "ecr_repository_url" {
  description = "Account service image repository (null when disabled)."
  value       = one(module.account_service[*].ecr_repository_url)
}
