aws_account_id = "REPLACE_WITH_PROD_ACCOUNT_ID" # NEEDS_HUMAN: Identity account (HB05). Intentionally invalid until decided.

custom_domain       = "account.kiorex.com" # Cognito requires kiorex.com to resolve to an A record first (NEEDS_HUMAN)
zone_name           = "kiorex.com"         # live/prod/global/dns must be applied first
deletion_protection = true
log_retention_days  = 90
alarm_emails        = [] # NEEDS_HUMAN

test_otp_enabled = false # never in prod

# Clients/scopes/token lifetimes: ../../../../../../config/idp.json (environments.production).

account_service_enabled = false
