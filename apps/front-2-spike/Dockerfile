# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/front-2-spike ./apps/front-2-spike
COPY packages/client-ts ./packages/client-ts
COPY packages/shared-ts ./packages/shared-ts
COPY packages/_tsconfig ./packages/_tsconfig

RUN pnpm install --frozen-lockfile --ignore-scripts --fix-lockfile
RUN pnpm --filter front-2-spike build
RUN pnpm --filter front-2-spike deploy --legacy --prod --ignore-scripts /workspace/runtime
RUN cp -R /workspace/apps/front-2-spike/server.mjs /workspace/runtime/ \
 && cp -R /workspace/apps/front-2-spike/dist /workspace/runtime/
RUN cp -R /workspace/node_modules/.pnpm/lodash@4.18.1/node_modules/lodash /workspace/runtime/node_modules/

FROM node:22-alpine AS runtime

RUN addgroup -S app && adduser -S -G app app
RUN apk add --no-cache curl

WORKDIR /app
COPY --from=builder /workspace/runtime /app

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=20 \
  CMD curl -fsS http://127.0.0.1:3000/login >/dev/null

USER app
CMD ["node", "server.mjs"]
