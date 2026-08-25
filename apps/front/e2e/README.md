# front e2e

From the repo root, run the local e2e compose stack:

```bash
docker compose -f apps/front/docker-compose.test.yml up -d --build --wait
```

`front.localhost` and `api.front.localhost` must resolve to loopback. On
machines where `*.localhost` does not resolve, add them explicitly:

```bash
echo "127.0.0.1 front.localhost api.front.localhost" | sudo tee -a /etc/hosts
```

From the repo root, run Playwright:

```bash
pnpm --filter front exec playwright test
```

From the repo root, tear down the compose stack:

```bash
docker compose -f apps/front/docker-compose.test.yml down -v
```

## Running by tag

Every top-level `test.describe` carries `@<domain>` and `@<ticket>` tags
(vocabulary in [`docs/guides/e2e-tags.md`](../../../docs/guides/e2e-tags.md)).
Use the `test:e2e:tag` script to filter:

```bash
# Run all specs for a domain
pnpm --filter front test:e2e:tag @staff-tenants

# Run all specs for a specific ticket
pnpm --filter front test:e2e:tag @992
```

## Tag enforcement

A Vitest guard (`e2e/__tests__/e2e-tag-guard.test.ts`) runs as part of
`pnpm --filter front test` and CI. It reads every `e2e/**/*.spec.ts` file
and fails when a top-level `test.describe` lacks a domain tag, uses a domain
outside the vocabulary, or lacks a ticket tag. Adding a new spec without tags
breaks the gate.

See [`docs/guides/e2e-coverage.md`](../../../docs/guides/e2e-coverage.md) for
when to write an e2e test (the five criteria).

## Notes

`log-leak.spec.ts` is `fixme`-gated until M1.4, when front has login, the
authed `/staff/staff-users` route, and a session cookie.

The `request-counter` sidecar publishes `8800` for host-side counter checks.
Its TLS listener on `9443` is internal-only and is reached through Traefik's
`api.front.localhost:8443` TCP route.
