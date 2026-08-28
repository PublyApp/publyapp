# syntax=docker/dockerfile:1

FROM node:24-alpine@sha256:156b55f92e98ccd5ef49578a8cea0df4679826564bad1c9d4ef04462b9f0ded6 AS prune

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY . .
# Use pnpm dlx here because turbo prune runs before workspace deps are installed.
# It is pinned to turbo@2.9.12 to keep this bootstrapping step reproducible.
RUN pnpm dlx turbo@2.9.12 prune front --docker

FROM node:24-alpine@sha256:156b55f92e98ccd5ef49578a8cea0df4679826564bad1c9d4ef04462b9f0ded6 AS install

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY --from=prune /workspace/out/json/ ./

RUN pnpm install --frozen-lockfile --ignore-scripts

# `turbo prune --docker` only copies workspace packages reachable through
# declared `dependencies`. `packages/_tsconfig` has no such declared
# dependents (apps/front, packages/shared-ts, and packages/client-ts each
# reference it only via the `extends` chain of their tsconfig.json), so
# turbo drops it from `out/full/packages/`. The @tanstack/router-plugin
# still resolves `apps/front/tsconfig.json`'s `extends:
# ../../packages/_tsconfig/tsconfig.base.json` at vite build time, and the
# tsconfig path lands on a missing file inside the container, aborting
# `pnpm --filter front build`. Pull the `_tsconfig` tree in explicitly so
# every tsconfig `extends` chain resolves the same way it does at the repo
# root. Local `pnpm install` already materializes any `.d.ts` paths
# underneath it via workspaces; this is a pure file-system copy.
COPY packages/_tsconfig ./packages/_tsconfig

FROM node:24-alpine@sha256:156b55f92e98ccd5ef49578a8cea0df4679826564bad1c9d4ef04462b9f0ded6 AS build

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY --from=install /workspace/ ./
COPY --from=prune /workspace/out/full/ ./

# Vite inlines VITE_* vars at build time, so this must be set before the
# build step. Defaults to false so a production build with no build arg
# keeps the /field-validation demo route gated off; the e2e test image
# turns it on via docker-compose.test.yml to cover InterZod's localized
# built-in validation messages.
ARG VITE_FEATURE_FIELD_VALIDATION_DEMO_ENABLED=false
ENV VITE_FEATURE_FIELD_VALIDATION_DEMO_ENABLED=$VITE_FEATURE_FIELD_VALIDATION_DEMO_ENABLED

RUN node apps/front/scripts/guards/assert-pinned.mts
RUN pnpm --filter @org/shared-ts run postinstall
RUN pnpm --filter front build
# `deploy` is the pnpm workspace deploy subcommand, not a package script.
RUN pnpm --filter=front deploy --legacy --prod /workspace/deploy

FROM node:24-alpine@sha256:156b55f92e98ccd5ef49578a8cea0df4679826564bad1c9d4ef04462b9f0ded6 AS runtime
LABEL org.opencontainers.image.source="https://github.com/PublyApp/publyapp"
LABEL org.opencontainers.image.description="PublyApp front web"

RUN addgroup -S app && adduser -S -G app app

WORKDIR /app
COPY --from=build /workspace/deploy/node_modules ./node_modules
COPY --from=build /workspace/deploy/package.json /app/package.json
COPY --from=build /workspace/deploy/server.mjs /app/server.mjs
COPY --from=build /workspace/deploy/dist ./dist

ENV PORT=5050
ENV NODE_ENV=production
# Default to loopback-only so the image boots safely without a reverse proxy.
# Production deployments MUST override this with the proxy peer's /32 address.
ENV TRUSTED_PROXY_CIDRS="127.0.0.1/32,::1/128"
EXPOSE 5050
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=20 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5050)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER app
CMD ["node", "server.mjs"]
