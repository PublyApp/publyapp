# syntax=docker/dockerfile:1

FROM node:24-alpine@sha256:156b55f92e98ccd5ef49578a8cea0df4679826564bad1c9d4ef04462b9f0ded6 AS prune

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY . .
RUN pnpm dlx turbo@2.9.12 prune front-2 --docker

FROM node:24-alpine@sha256:156b55f92e98ccd5ef49578a8cea0df4679826564bad1c9d4ef04462b9f0ded6 AS install

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY --from=prune /workspace/out/json/ ./

RUN pnpm install --frozen-lockfile --ignore-scripts

FROM node:24-alpine@sha256:156b55f92e98ccd5ef49578a8cea0df4679826564bad1c9d4ef04462b9f0ded6 AS build

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY --from=install /workspace/ ./
COPY --from=prune /workspace/out/full/ ./

RUN node apps/front-2/scripts/assert-pinned.mjs
RUN pnpm --filter @org/shared-ts run postinstall
RUN pnpm --filter front-2 build
# `deploy` is the pnpm workspace deploy subcommand, not a package script.
RUN pnpm --filter=front-2 deploy --legacy --prod /workspace/deploy

FROM node:24-alpine@sha256:156b55f92e98ccd5ef49578a8cea0df4679826564bad1c9d4ef04462b9f0ded6 AS runtime

RUN addgroup -S app && adduser -S -G app app

WORKDIR /app
COPY --from=build /workspace/deploy/node_modules ./node_modules
COPY --from=build /workspace/deploy/package.json /app/package.json
COPY --from=build /workspace/deploy/server.mjs /app/server.mjs
COPY --from=build /workspace/deploy/dist ./dist

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=20 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER app
CMD ["node", "server.mjs"]
