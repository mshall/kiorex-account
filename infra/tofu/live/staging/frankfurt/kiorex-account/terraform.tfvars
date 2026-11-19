aws_account_id = "599243104052" # Kiorex account (aws-kiorex-profile)

# Staging: Cognito prefix domain. Clients with TODO_NEEDS_HUMAN redirect URIs in config/idp.json are skipped until set.
custom_domain       = ""
prefix_domain       = "kiorex-passport-staging"
deletion_protection = false
log_retention_days  = 30
alarm_emails        = [] # NEEDS_HUMAN

test_otp_enabled   = true # accepts 000000 for the seeded test numbers - non-prod only
test_phone_numbers = ["+201000000001", "+201000000002", "+201000000099"]

# Clients/scopes/token lifetimes: ../../../../../../config/idp.json (environments.staging).

account_service_enabled = false
