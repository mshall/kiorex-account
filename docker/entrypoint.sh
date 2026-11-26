#!/bin/sh
# Passport dev IdP container entrypoint (host-agnostic: App Runner, ECS, or one Docker host).
#   1. refuse production (also enforced again by the app itself),
#   2. run the schema migration and STOP on failure (a failed migration must not look healthy),
#   3. optionally run the synthetic demo seed (KX_RUN_DEMO_SEED=true; the seed has its own non-production guard),
#   4. start the server (exec: PID 1 receives SIGTERM for graceful shutdown).
set -eu

case "$(printf '%s' "${NODE_ENV:-}${KX_ENV:-}${APP_ENV:-}" | tr 'A-Z' 'a-z')" in
  *production*|*prod*) echo "entrypoint: refusing to start, NODE_ENV/KX_ENV/APP_ENV says production (the dev IdP is development-only)" >&2; exit 1 ;;
esac


echo "entrypoint: running migrations"
tsx apps/dev-idp/src/migrate.ts

if [ "${KX_RUN_DEMO_SEED:-false}" = "true" ]; then
  echo "entrypoint: running the synthetic demo seed"
  DEMO_SEED_ALLOWED=true tsx scripts/seed-demo.ts
fi

echo "entrypoint: starting the dev IdP"
exec tsx apps/dev-idp/src/index.ts
