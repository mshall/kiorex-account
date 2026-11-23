# ADR-038: hosts, certificate and DNS for the Kiorly web products in the production environment. Nothing here is applied.
provider "aws" {
  region = "eu-central-1"
}

# CloudFront certificates must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

module "kiorly_domains" {
  source    = "../../../../modules/kiorly-domains"
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1 }

  environment        = "production"
  cloudfront_targets = var.cloudfront_targets
  apprunner_domains  = var.apprunner_domains
}

output "certificate_sans" {
  value = module.kiorly_domains.certificate_sans
}
