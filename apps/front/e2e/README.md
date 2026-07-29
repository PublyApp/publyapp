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

`log-leak.spec.ts` is `fixme`-gated until M1.4, when front has login, the
authed `/staff/staff-users` route, and a session cookie.

The `request-counter` sidecar publishes `8800` for host-side counter checks.
Its TLS listener on `9443` is internal-only and is reached through Traefik's
`api.front.localhost:8443` TCP route.
