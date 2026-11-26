# syntax=docker/dockerfile:1
# Kiorex Passport DEV IdP / account service (apps/dev-idp, serves /account and the OIDC endpoints).
# DEVELOPMENT TIERS ONLY: the app refuses NODE_ENV/KX_ENV/APP_ENV=production. Production identity is the managed IdP.
# Multi-arch: builds natively for linux/arm64 and linux/amd64 (no platform-specific steps; esbuild picks its binary at npm ci).
#   docker build -t kiorex-passport-dev .
#   docker buildx build --platform linux/amd64,linux/arm64 -t <registry>/kiorex-passport-dev --push .
# Health: GET /healthz (200 {"status":"ok",...}), also baked in as HEALTHCHECK. Discovery: /.well-known/openid-configuration.
# Runtime config is environment only; see Docs/DEPLOY_DEV.md.
FROM node:26-bookworm-slim AS deps
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
# manifests first so the dependency layer is cached until a package.json or the lock changes
COPY package.json package-lock.json ./
COPY apps/dev-idp/package.json apps/dev-idp/
COPY apps/passport-ui/package.json apps/passport-ui/
COPY apps/kiorly-home/package.json apps/kiorly-home/
COPY packages/backchannel/package.json packages/backchannel/
COPY packages/otp-sender/package.json packages/otp-sender/
# Dev dependencies are needed at run time on purpose: tsx runs the TypeScript sources and esbuild + react bundle the Passport UI at start-up.
RUN npm ci

FROM node:26-bookworm-slim
ENV NODE_ENV=development \
    PORT=4400 \
    HOST=0.0.0.0 \
    KX_TRUST_PROXY=true \
    DEV_IDP_PUBLIC=true
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
COPY config ./config
COPY scripts ./scripts
COPY apps/dev-idp ./apps/dev-idp
COPY apps/passport-ui ./apps/passport-ui
COPY packages ./packages
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
ENV PATH="/app/node_modules/.bin:${PATH}"
RUN chmod +x /usr/local/bin/entrypoint.sh && chown -R node:node /app
USER node
EXPOSE 4400
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4400)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
