# ADR-038 (Kiorly Home / domains): hosts, certificate SANs and DNS records are DERIVED from kiorex-account/config/domains.json, the ONE
# domain table per environment. Go-live needs no code change: set the cloudfront_targets / apprunner_domains variables after the
# founder-approved deploy. Nothing here is applied by this change (validate/fmt only).

locals {
  table = jsondecode(file("${path.module}/../../../../config/domains.json")).environments[var.environment]

  host_of = { for k, v in {
    home     = local.table.home
    clinic   = local.table.clinic
    nurse    = local.table.nurse
    pharmacy = local.table.pharmacy
    lab      = local.table.lab
    } : k => trimprefix(v, "https://")
  }
  apex_host    = try(trimprefix(local.table.apexRedirect, "https://"), null)
  alias_hosts  = { for i, h in try(local.table.aliases.clinic, []) : "clinic_alias_${i}" => trimprefix(h, "https://") }
  api_hosts    = { for k, v in local.table.api : "api_${k}" => trimprefix(v, "https://") }
  web_hosts    = merge(local.host_of, local.alias_hosts, local.apex_host == null ? {} : { apex = local.apex_host })
  cert_primary = local.host_of["home"]
  cert_sans    = sort(distinct([for k, h in merge(local.web_hosts, local.api_hosts) : h if h != local.cert_primary]))
  zone_id      = data.aws_route53_zone.this.zone_id
  tags         = merge({ Product = "kiorly-domains", Environment = var.environment, ManagedBy = "opentofu" }, var.tags)
}

check "hosts_are_https_and_not_local" {
  assert {
    condition     = alltrue([for h in values(merge(local.web_hosts, local.api_hosts)) : !can(regex("localhost|127\\.0\\.0\\.1", h))])
    error_message = "The ${var.environment} domain table must not contain a local host."
  }
}

# The hosted zone is created once by the global DNS stack (modules/aws/dns-certs `zones`, delegation at the registrar is NEEDS_HUMAN).
data "aws_route53_zone" "this" {
  name         = var.zone_name
  private_zone = false
}

module "dns_certs" {
  source    = "../aws/dns-certs"
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1 }

  # One certificate for CloudFront (us-east-1): www + clinic + nurse + pharmacy + lab (+ app alias, apex, API hosts) as SANs.
  certificates = {
    kiorly = {
      domain  = local.cert_primary
      sans    = local.cert_sans
      zone_id = local.zone_id
    }
  }
  tags = local.tags
}

# A/AAAA aliases per web host. Roles without a CloudFront target are skipped (nothing is deployed yet).
resource "aws_route53_record" "web_a" {
  for_each = { for k, h in local.web_hosts : k => h if contains(keys(var.cloudfront_targets), k) }
  zone_id  = local.zone_id
  name     = each.value
  type     = "A"
  alias {
    name                   = var.cloudfront_targets[each.key].domain_name
    zone_id                = var.cloudfront_targets[each.key].zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "web_aaaa" {
  for_each = aws_route53_record.web_a
  zone_id  = local.zone_id
  name     = each.value.name
  type     = "AAAA"
  alias {
    name                   = each.value.alias[0].name
    zone_id                = each.value.alias[0].zone_id
    evaluate_target_health = false
  }
}

# App Runner custom domains for API hosts (optional).
resource "aws_apprunner_custom_domain_association" "api" {
  for_each             = var.apprunner_domains
  domain_name          = local.api_hosts[each.key]
  service_arn          = each.value
  enable_www_subdomain = false
}
