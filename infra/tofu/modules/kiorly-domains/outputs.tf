output "hosts" {
  description = "Every host this environment serves (from config/domains.json)."
  value       = { web = local.web_hosts, api = local.api_hosts }
}

output "certificate_sans" {
  description = "Subject alternative names on the CloudFront certificate (the DNS/certificate go-live checklist in Docs/NEEDS_HUMAN.md lists them)."
  value       = concat([local.cert_primary], local.cert_sans)
}

output "certificate_arns" {
  value = module.dns_certs.certificate_arns
}

output "apprunner_validation_records" {
  description = "App Runner certificate validation records for API hosts."
  value       = { for k, a in aws_apprunner_custom_domain_association.api : k => a.certificate_validation_records }
}
