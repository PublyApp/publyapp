# API Rate Limiting

PublyApp applies two layers of API rate limiting:

1. A global safety net protects the API by resolved client IP.
2. Named endpoint policies add tighter limits for the work an endpoint performs.

The global limiter is additive: a request to an endpoint with a named policy must pass
both the global safety net and the named policy. Limits use fixed windows with no queue.
Rejected requests return RFC 7807 `application/problem+json`, status `429`, and a
`Retry-After` header.

Counters are process-local. A deployment with multiple API replicas receives the
configured allowance independently on each replica; use a shared limiter before scaling
when a strict deployment-wide cap is required.

## Audit matrix

All permit limits and windows are environment-configurable through `AppEnvironment`.
The values below are production defaults; Testing uses deliberately high defaults so
shared integration-test hosts do not exhaust a partition accidentally.

| Endpoint class | Policy | Default | Partition | Environment variables |
|---|---|---:|---|---|
| All API routes except health probes and `/files` | Global safety net | 1200 / 60s | Resolved client IP | `GLOBAL_RATE_LIMIT_PERMIT_LIMIT`, `GLOBAL_RATE_LIMIT_WINDOW_SECONDS` |
| Anonymous login and registration | `anonymous-auth-per-email` | 30 / 60s IP + 30 / 60s email | Resolved client IP + normalized email | `ANON_AUTH_IP_RATE_LIMIT_PERMIT_LIMIT`, `ANON_AUTH_IP_RATE_LIMIT_WINDOW_SECONDS`, `ANON_AUTH_EMAIL_RATE_LIMIT_PERMIT_LIMIT`, `ANON_AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS` |
| Anonymous password-reset request and verification-email resend | `password-reset-per-email` | 30 / 60s IP + 3 / 900s email | Resolved client IP + normalized email | `ANON_AUTH_IP_RATE_LIMIT_PERMIT_LIMIT`, `ANON_AUTH_IP_RATE_LIMIT_WINDOW_SECONDS`, `PASSWORD_RESET_EMAIL_RATE_LIMIT_PERMIT_LIMIT`, `PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS` |
| Other anonymous auth actions: password-reset confirmation/token checks, email-verification confirmation/token checks, invitation acceptance | `anonymous-auth-per-ip` | 30 / 60s | Resolved client IP | `ANON_AUTH_IP_RATE_LIMIT_PERMIT_LIMIT`, `ANON_AUTH_IP_RATE_LIMIT_WINDOW_SECONDS` |
| Other unauthenticated endpoints, including public invitation reads and active notices | `anonymous-other` | 120 / 60s | Resolved client IP | `ANONYMOUS_OTHER_RATE_LIMIT_PERMIT_LIMIT`, `ANONYMOUS_OTHER_RATE_LIMIT_WINDOW_SECONDS` |
| Normal authenticated staff and tenant reads/writes | `authenticated-default` | 600 / 60s | Validated session ID fingerprint | `AUTHENTICATED_RATE_LIMIT_PERMIT_LIMIT`, `AUTHENTICATED_RATE_LIMIT_WINDOW_SECONDS` |
| Expensive search/list endpoints | `heavy-search-list` | 180 / 60s | Validated session ID fingerprint | `HEAVY_SEARCH_RATE_LIMIT_PERMIT_LIMIT`, `HEAVY_SEARCH_RATE_LIMIT_WINDOW_SECONDS` |
| Non-tenant bulk operations | `bulk-operation` | 30 / 60s | Validated session ID fingerprint | `BULK_RATE_LIMIT_PERMIT_LIMIT`, `BULK_RATE_LIMIT_WINDOW_SECONDS` |
| Tenant-scoped bulk operations | `tenant-bulk-operation` | 30 / 60s session + 120 / 60s tenant | Validated session ID fingerprint + tenant ID | `BULK_RATE_LIMIT_PERMIT_LIMIT`, `BULK_RATE_LIMIT_WINDOW_SECONDS`, `TENANT_BULK_RATE_LIMIT_PERMIT_LIMIT`, `TENANT_BULK_RATE_LIMIT_WINDOW_SECONDS` |
| Non-tenant email-producing operations | `email-operation` | 10 recipients / 900s | Validated session ID fingerprint | `EMAIL_RATE_LIMIT_PERMIT_LIMIT`, `EMAIL_RATE_LIMIT_WINDOW_SECONDS` |
| Tenant email-producing operations | `tenant-email-operation` | 10 recipients / 900s session + 50 recipients / 900s tenant | Validated session ID fingerprint + tenant ID | `EMAIL_RATE_LIMIT_PERMIT_LIMIT`, `EMAIL_RATE_LIMIT_WINDOW_SECONDS`, `TENANT_EMAIL_RATE_LIMIT_PERMIT_LIMIT`, `TENANT_EMAIL_RATE_LIMIT_WINDOW_SECONDS` |
| Non-tenant exports | `export` | 10 / 60s | Validated session ID fingerprint | `EXPORT_RATE_LIMIT_PERMIT_LIMIT`, `EXPORT_RATE_LIMIT_WINDOW_SECONDS` |
| Tenant exports | `tenant-export` | 10 / 60s session + 40 / 60s tenant | Validated session ID fingerprint + tenant ID | `EXPORT_RATE_LIMIT_PERMIT_LIMIT`, `EXPORT_RATE_LIMIT_WINDOW_SECONDS`, `TENANT_EXPORT_RATE_LIMIT_PERMIT_LIMIT`, `TENANT_EXPORT_RATE_LIMIT_WINDOW_SECONDS` |
| Uploads | `upload` | 20 / 60s | Validated session ID fingerprint | `UPLOAD_RATE_LIMIT_PERMIT_LIMIT`, `UPLOAD_RATE_LIMIT_WINDOW_SECONDS` |

SSR is served by the frontend process and does not enter the API middleware pipeline.
Static files under `/files` are excluded because their immutable, server-generated URLs
are served by `StaticFileMiddleware`. Health, liveness, and readiness endpoints opt out so
infrastructure probes cannot be throttled.

## Explicit exceptional dispositions

Only these mapped endpoints intentionally rely on the global safety net without a named
policy:

- the fallback `404` route;
- the OpenAPI document and Scalar UI, when they are mapped in Development.

They carry `.WithGlobalRateLimitOnly()`. The three health endpoints (`/health`,
`/health/live`, and `/health/ready`) are the only mapped opt-outs. Each carries
`.WithRateLimitOptOut("reason")`, which adds both the documented reason and
`DisableRateLimiting` metadata.

`/files` is middleware rather than a mapped endpoint, so it is excluded directly by the
global partitioner. SSR belongs to the frontend process and is outside the API route
inventory.

## Rules for adding or changing an endpoint

1. Classify the endpoint by the most specific row in the audit matrix. Expensive work
   takes precedence over the authenticated default. Use the tenant variant when work is
   performed for a tenant, including staff routes with an explicit `{tenantId}`.
2. Apply the normal policy to the module or route group with
   `.RequireRateLimiting(...)`. Apply a tighter override to an individual endpoint when
   it performs search/list, bulk, email, export, upload, or anonymous-auth work.
3. If the global safety net is intentionally sufficient, attach the explicit
   `.WithGlobalRateLimitOnly()` marker. Do not leave an endpoint implicitly global-only.
4. Opt out only for infrastructure that must remain callable during a burst. Use
   `.WithRateLimitOptOut("specific reason")`; the marker, non-empty reason, and
   `DisableRateLimiting` metadata are all required. Business endpoints must not opt out.
5. Add or update a limiter integration spec when a route changes bucket, partition key,
   or rejection behavior. Specs must prove the cap succeeds and the next request returns
   RFC 7807 `429` with `Retry-After`.
6. Email fan-out endpoints must add
   `.WithRecipientWeightedRateLimit<TBody>(policy, getRecipientCount)` after body
   validation. The named policy consumes the first recipient permit; the filter consumes
   the remaining recipients from the same session and, for tenant email, tenant buckets.
   A request whose recipient count does not fit is rejected before the handler sends or
   queues any email.

`PUBLY0011` enforces the static registration rule during build: every mapped endpoint
must declare or inherit a named policy, carry the global-only marker, or carry an
opt-out marker with a reason. A runtime-metadata architecture spec separately builds the
real route map and verifies that group-level policy metadata reached every endpoint.

The normal registration shape is:

```csharp
var group = app.MapGroup("/widgets")
    .RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault);

group.MapGet("/", FindWidgets.Handle)
    .RequireRateLimiting(ApiRateLimitPolicies.HeavySearchList);
```

Do not apply multiple endpoint policies expecting them to compose. A tighter endpoint
policy replaces inherited named-policy metadata. The tenant bulk, email, and export
policies perform their session-plus-tenant composition internally.

The current email-fan-out judgments are:

- staff and tenant bulk invitations remain in their email policies and are
  recipient-weighted;
- `CreateStaffProfile` remains `email-operation` because its optional `emails` array can
  create invitations; the array is bounded by `MAX_BULK_INVITATIONS_SIZE` and its actual
  recipients are weighted;
- tenant creation remains `email-operation` because every required initial user receives
  an invitation, and `initialUsers` are recipient-weighted;
- cross-company membership bulk operations do not produce email and remain
  session-scoped `bulk-operation`.

## Enforcement and observability

Trusted forwarded headers are resolved before rate limiting. IP policies therefore key
on the client address produced by the trusted-proxy configuration, not the proxy address.
Production must trust only Traefik's exact `/32` or `/128` address(es), or a dedicated
proxy-only network. The shared application network must not be trusted because any peer
container could otherwise forge `X-Forwarded-For`; universal CIDRs are rejected at startup.
The global limiter runs before CORS, so valid preflight `OPTIONS` requests consume the same
per-IP floor as other traffic instead of short-circuiting around enforcement.
Authenticated policies validate the session before rate limiting and key on a fingerprint
of the persisted session ID. Missing or invalid tokens fall back to the resolved client-IP
partition, so rotating forged token strings cannot mint fresh authenticated buckets.
Tenant policies resolve the explicit `{tenantId}` route value first, then the
`X-Tenant-Id` header used by tenant-self-service routes.

Throttle logs contain only the named policy and a truncated SHA-256 fingerprint of the
partition. They never contain a raw session token, email address, tenant ID, client IP,
request body, or other personally identifiable value. Rejection warnings are sampled at
most once per policy per minute; a later sample reports the aggregate rejection count
since the previous warning, preventing rejected-request floods from amplifying log volume.

When changing a default, update the matching `AppEnvironment` values, `.env.example`,
every active compose definition, and the audit-matrix row together. Keep Testing defaults
high; integration specs that exercise rejection must replace limiter settings in their
isolated test host.
