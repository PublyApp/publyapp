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

### Global-floor tuning and alerts

The owner-tunable default is **6,000 requests per minute per resolved client IP**. It
allows a 100-user office NAT roughly 60 API requests per user per minute while named
session and work-class policies continue to constrain authenticated, expensive, and
email-producing operations. This is a safety floor, not a normal per-user quota.

Fixed windows can admit nearly twice the configured allowance across a window boundary.
Capacity planning for the default must therefore tolerate a short burst approaching
12,000 requests from one IP around a boundary. Before lowering the floor, replay a
representative front-end load that includes initial navigation, parallel query prefetch,
refocus refetches, and retry behavior behind a shared NAT.

Track global-floor utilization and `429` responses separately from named-policy
rejections. Alert for investigation when either condition is sustained for 15 minutes:

- p95 legitimate per-IP utilization exceeds 70% of the configured global allowance;

- global-floor `429` responses exceed 0.5% of non-health API requests.

Raise the floor when known legitimate NAT partitions approach the utilization threshold
without downstream saturation. Lower it only when capacity evidence supports the
fixed-window boundary burst. Re-evaluate the number when API replica count, front-end
request behavior, proxy topology, or expected office size changes.

## Audit matrix

All permit limits and windows are environment-configurable through `AppEnvironment`.
The values below are production defaults; Testing uses deliberately high defaults so
shared integration-test hosts do not exhaust a partition accidentally.

| Endpoint class | Policy | Default | Partition | Environment variables |
|---|---|---:|---|---|
| All API routes except health probes and `/files` | Global safety net | 6000 / 60s | Resolved client IP | `GLOBAL_RATE_LIMIT_PERMIT_LIMIT`, `GLOBAL_RATE_LIMIT_WINDOW_SECONDS` |
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

`PUBLY0011` enforces the static registration rule during build: every mapped endpoint must
declare or inherit a named policy, carry the global-only marker, or carry an opt-out marker
with a reason. It resolves the mapping method, receiver, and result types through Roslyn.
Known ASP.NET mapping symbols returning `RouteHandlerBuilder` (or another terminal
endpoint-convention builder) are terminal, while symbols returning `RouteGroupBuilder` are
group creation. For source-visible custom `Map*` helpers, it follows the returned expression
to the resolved mapping symbol, so an `IEndpointConventionBuilder` declaration no longer
hides a terminal `MapGet(...)` return and a `MapGroup(...)` return remains non-terminal.

For a captured endpoint local, the analyzer follows a fluent chain only while every receiver
and result remains an `IEndpointConventionBuilder`. It recognizes `RequireRateLimiting`,
`DisableRateLimiting`, `WithGlobalRateLimitOnly`, `WithRateLimitOptOut`, and the approved
anonymous-auth helpers by their intended containing type and namespace, not by method name
alone. Same-named methods on unrelated types therefore neither cover nor invalidate an
endpoint.

The analyzer deliberately emits no diagnostic when a custom helper is external or opaque,
or when source-visible returns have conflicting or unsupported flow and terminality cannot
be decided from available symbols. The startup guard is the authoritative coverage gate: it
inspects the complete materialized route map and fails application boot if any endpoint is
uncovered, names an unknown policy, or disables limiting without a reasoned opt-out. This
runtime backstop also covers non-`Map*` helpers and metadata applied through aliases, dynamic
dispatch, reflection, or control flow the analyzer does not follow.

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

## Counter storage (distributed budget, #953)

Fixed-window counters live in Postgres by default: table `rate_limit_counters`, one row per
(named policy, truncated SHA-256 partition hash, window start). Every acquisition is one atomic
conditional UPSERT (`INSERT ... ON CONFLICT DO UPDATE ... WHERE permit_count + n <= limit
RETURNING`), so N replicas share exactly one fleet-wide budget per partition and cannot
over-admit; the row lock on the conflicting tuple serialises concurrent writers. Connections are
borrowed from the scoped `AppDbContext` (never from `POSTGRES_CONNECTION_STRING` directly), so
test hosts automatically see their own database. Partition keys (IPs, emails, session
fingerprints, tenant IDs) are never persisted raw — only the 32-hex-char SHA-256 truncation,
same no-PII stance as throttle logs. Housekeeping deletes each touched key's superseded window
rows inline and sweeps rows older than the largest configured window at most once a minute.

Outage behaviour: five consecutive store failures for one named policy open that policy's circuit
breaker for 30 s — while open, acquisitions for that policy do not dial Postgres at all — then
one half-open probe decides between recovery and re-open. Partitions within a policy share its
breaker; unrelated policies have independent breakers, so one policy's failure cannot suppress
another policy's database attempts. While the store is unreachable, policies apply their fail
mode: anonymous-auth per-IP, per-email and password-reset-per-email plus the email-producing
`email-operation` / `tenant-email-operation` fail **CLOSED** (a rejection during an incident is
safer than handing unlimited login-guess or email-bomb budgets to whoever arrives); every other
policy fails open, because domain work already requires Postgres and rejecting more traffic
converts degradation into outage without buying protection. Failed acquisitions surface as
failed leases carrying `Retry-After` = remaining window, keeping the 429 contract unchanged.

`RATE_LIMIT_COUNTER_STORE` selects the implementation: `postgres` (default — scaling to a second
replica without reading docs still yields one shared budget) or `memory` (pre-#953 per-process
counters; the documented incident lever for single-replica triage when the database is the
incident).

## Enforcement and observability

Trusted forwarded headers are resolved before rate limiting. IP policies therefore key
on the client address produced by the trusted-proxy configuration, not the proxy address.
Production must trust only Traefik's exact `/32` or `/128` address(es), or a dedicated
proxy-only network. The shared application network must not be trusted because any peer
container could otherwise forge `X-Forwarded-For`; universal CIDRs are rejected at startup.
The configured CORS policy is evaluated by a header-only middleware before limiting, so
allowed browser origins can read early `429` and `413` RFC 7807 responses and the exposed
`Retry-After` header. That middleware does not short-circuit. The global limiter therefore
still runs before the framework CORS middleware serves a valid preflight, so `OPTIONS`
requests consume the same per-IP floor as other traffic instead of bypassing enforcement.
It also runs before database-backed session resolution. Once an IP exhausts the floor,
rotating forged session headers is rejected without another session lookup; a validation
result, including an invalid result, is reused for the remainder of the accepted request.
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
