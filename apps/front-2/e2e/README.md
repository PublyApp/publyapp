# front-2 e2e

From the repo root, run the local e2e compose stack:

```bash
docker compose -f apps/front-2/docker-compose.test.yml up -d --build
```

From the repo root, run Playwright:

```bash
pnpm --filter front-2 exec playwright test
```

From the repo root, tear down the compose stack:

```bash
docker compose -f apps/front-2/docker-compose.test.yml down -v
```

`log-leak.spec.ts` is `fixme`-gated until M1.4, when front-2 has login, the
authed `/staff/staff-users` route, and a session cookie.

The `request-counter` sidecar publishes `8800` for host-side counter checks.
Its TLS listener on `9443` is internal-only and is reached through Traefik's
`api.front-2.localhost:8443` TCP route.
