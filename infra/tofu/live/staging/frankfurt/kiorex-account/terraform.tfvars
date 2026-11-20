aws_account_id = "599243104052" # Kiorex account (aws-kiorex-profile)

# Staging: Cognito prefix domain. Clients with TODO_NEEDS_HUMAN redirect URIs in config/idp.json are skipped until set.
custom_domain       = ""
prefix_domain       = "kiorex-passport-staging"
deletion_protection = false
log_retention_days  = 30
alarm_emails        = [] # NEEDS_HUMAN

test_otp_enabled = true # accepts 000000 for the seeded test numbers - non-prod only
test_phone_numbers = [
  "+201000000001",
  "+201000000002",
  "+201000000099",
  "+201000001001",
  "+201000001002",
  "+201000001003",
  "+201000001004",
  "+201000001005",
  "+201000001006",
  "+201000001007",
  "+201000001008",
  "+201000001009",
  "+201000001010",
  "+201000001011",
  "+201000001012",
  "+201000002001",
  "+201000002002",
  "+201000002003",
  "+201000002004",
  "+201000002005",
  "+201000009001",
  "+201000009002",
  "+201000009003",
  "+201000001013",
  "+201000003001",
  "+201000003002",
  "+201000003003",
  "+201000003004",
  "+201000003005",
  "+201000003006",
  "+201000003007",
  "+201000003008",
  "+201000003009",
  "+201000003010",
  "+201000003011",
] # config/seed-users.json (e2e fixtures + the demo personas of TEST_DATA.md): all accept the fixed test OTP on staging only

# Clients/scopes/token lifetimes: ../../../../../../config/idp.json (environments.staging).

account_service_enabled = false

enable_demo_seed = true # Q10: IAM for scripts/seed-cognito-demo.mjs (non-production only; the plan fails for prod)
