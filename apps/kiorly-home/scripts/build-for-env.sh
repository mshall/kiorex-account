#!/usr/bin/env bash
# Build Kiorly Home for a hosted environment (test | pilot | prod) with every origin taken from the URL registry
# (_docs/registry/service-url-registry.yaml), never typed. Uses the KX_ENV=dev tier (dev-tier.ts): https only, no localhost, no dev panel.
#   scripts/build-for-env.sh test [outDir]        then: npm run check:bundle -w @kiorex/kiorly-home
# The product APIs are the products' own web hosts (each serves same-origin /api/*; the Clinic host routes /api/* to its API at the CDN).
# Passport token and workspaces calls use the same-origin /idp/* path (CDN behaviour idp_proxy in infra/tofu).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; app="$(cd "$here/.." && pwd)"; ws="$(cd "$app/../../.." && pwd)"
env_id="${1:?usage: build-for-env.sh <test|pilot|prod> [outDir]}"; out="${2:-$app/dist}"
reg="${KX_REGISTRY_VALIDATOR:-$ws/_docs/registry/validate-registry.mjs}"
emit="$(node "$reg" --emit env --env "$env_id")"
val() { printf '%s\n' "$emit" | awk -F'\t' -v s="$1" -v k="$2" '$1==s { split($2,a,"="); if (a[1]==k) { sub(/^[^=]*=/,"",$2); print $2; exit } }'; }
issuer="$(val kiorex.api OIDC_ISSUER)"; home="$(val kiorly.app VITE_KIORLY_HOME_URL)"
clinic="$(val kiorly.clinics APP_WEB_URL)"; pharmacy="$(val kiorly.pharmacies WEB_APP_URL)"; lab="$(val kiorly.labs PUBLIC_BASE_URL)"
for v in issuer home clinic pharmacy lab; do [ -n "${!v}" ] || { echo "registry gave no value for $v in env $env_id" >&2; exit 65; }; done
patient="$(val kiorex.marketplace WEB_BASE_URL)"
cd "$app"
env KX_ENV=dev VITE_PASSPORT_ISSUER="$issuer" KX_HOME_ORIGIN="$home" \
  KX_PRODUCT_URL_CLINIC="$clinic" KX_PRODUCT_URL_PHARMACY="$pharmacy" KX_PRODUCT_URL_LAB="$lab" \
  KX_API_CLINIC="$clinic" KX_API_PHARMACY="$pharmacy" KX_API_LAB="$lab" KX_PATIENT_URL="$patient" \
  npx vite build --mode production --outDir "$out" --emptyOutDir
echo "built $env_id: home=$home issuer=$issuer clinic=$clinic pharmacy=$pharmacy lab=$lab -> $out"
