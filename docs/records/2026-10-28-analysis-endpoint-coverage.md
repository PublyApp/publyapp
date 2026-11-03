# Analysis — which API endpoints the integration suite actually hits

- **Date** : 2026-10-28
- **Tip measured** : `03d1edb3c` (`develop`), worktree `lane/cov-measure`
- **Question** : for every endpoint mapped by `apps/api/Modules/**/Endpoints/*.cs`, does the API
  integration suite send at least one HTTP request to it?
- **Answer in one line** : **150 of 157 business endpoints were hit; 7 were never hit**, and 3 of the
  150 were only ever hit with a failure response.
- **Command** (run once, unsharded, suite already built):

  ```bash
  cd apps/api && PUBLYAPP_ENDPOINT_HIT_LOG=/tmp/cov-hits.tsv \
    PUBLYAPP_ENDPOINT_ROUTE_TABLE=/tmp/cov-routes.tsv \
    APP_ROLE=all ASPNETCORE_ENVIRONMENT=Testing \
    dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --no-build --nologo --verbosity minimal
  ```

  **18 m 47 s** of test execution (18 m 49 s wall) for **2 992 tests**: 2 983 passed, 9 failed,
  0 skipped. The run's long pole was one failing architecture guard whose cold `dotnet build` of
  `apps/apphost` consumed 15 m 21 s inside that window (see “Suite health”).

## Method

Two ad-hoc, test-only hooks were added for the run and **removed before the commit**; nothing in this
record's tree is instrumented, and no product code was touched.

1. **Request recorder.** A `[ModuleInitializer]` in the test assembly subscribed to every
   `DiagnosticListener` and recorded each `Microsoft.AspNetCore.Hosting.HttpRequestIn.Stop` event
   (payload: `HttpContext`). Per request it wrote
   `METHOD \t matched-route-template \t status \t raw-path`. Because the hosting diagnostics are
   emitted by the ASP.NET Core hosting layer itself, the recorder saw requests from every
   in-process host in the run, including the bespoke `WebApplicationFactory` variants some specs
   build directly instead of going through `ApiFactory` (rate-limiting, job-trigger and route-map
   specs). The hook is inert unless `PUBLYAPP_ENDPOINT_HIT_LOG` is set.

2. **Route table.** A throw-away spec built a real `WebApplication` in the `Testing` environment
   (unreachable `DbContext` stub, same technique as
   [`EndpointPermissionMetadataGuard.Spec.cs`](../../apps/api/Lib/Architecture/EndpointPermissionMetadataGuard.Spec.cs))
   and dumped `EndpointDataSource.Endpoints` as `METHODS \t raw-route-template \t display-name`.

**Why no path normalisation was needed.** The hit side is not a raw URL: it is the route template
routing itself selected (`HttpContext.GetEndpoint()` → `RouteEndpoint.RoutePattern.RawText`), i.e.
the same string the table dump holds. The match is therefore an exact `(METHOD, template)` equality —
`/posts/{postId}` can never be confused with `/posts/<uuid>`. No hand-written regex normalisation was
involved, so no normalisation error can be hiding in the numbers.

**Cross-check that the denominator is complete.** The runtime table holds **162** method/pattern
keys. Subtracting the 5 system keys (4 health checks + the `{*path:nonfile}` fallback) leaves
**157** business endpoints. A naive string count of `Map{Get,Post,Put,Patch,Delete,Methods}(` call
sites in `apps/api/Modules/*/Endpoints/*.cs` gives 158; the difference is exactly the deliberately
commented-out staff-user create route at
[`UserEndpointsForStaff.cs:21`](../../apps/api/Modules/Users/Endpoints/UserEndpointsForStaff.cs#L21)
(“Direct staff-user creation is intentionally not mapped”). 158 − 1 = 157, so the runtime table and
the endpoint files agree.

The table was also checked for duplicate `(METHOD, template)` keys: 0.

## Numbers

| Metric                                               | Value  |
| ---------------------------------------------------- | ------ |
| Method/route keys in the runtime table               | 162    |
| System routes (4 health + 1 fallback)                | 5      |
| **Business endpoints** (`Modules/**/Endpoints/*.cs`) | **157**|
| **Hit at least once**                                | **150**|
| **Never hit**                                        | **7**  |
| Hit with at least one 2xx/3xx response               | 147    |
| Hit only with a 4xx response (no success)            | 3      |
| HTTP requests recorded in the run                    | 5 550  |
| Distinct raw request paths                           | 891    |
| Distinct response status codes observed              | 12     |

Status codes observed across all 5 550 recorded requests:
`200 201 204 400 401 403 404 409 413 422 429 503`.

By surface (a route's surface is its path scope):

| Surface                                                | Endpoints | Hit | Never hit |
| ------------------------------------------------------ | --------- | --- | --------- |
| Anonymous (`/auth/*`, `/invitations/*`, `/notices/active`) | 18        | 17  | 1         |
| Staff (`/staff/*`)                                     | 103       | 100 | 3         |
| Tenant (root, implicit `X-Tenant-Id`)                  | 36        | 33  | 3         |
| **Total**                                              | **157**   |**150**| **7**   |

System routes, for completeness: 64 requests reached the 4 health checks (12 `live`, 18 `ready`,
14 `/health`, 20 `drain`) and 16 requests were routed to the `{*path:nonfile}` fallback — the 404
contract is exercised.

Requests that matched **no** endpoint: 26, all under `/files/*` (17 distinct paths; 10 served `200`,
16 returned `404`). Those are static-file probes served by `UseStaticFiles` for `/files/uploads`,
not API routes; they are excluded from every count above. No `405` request was recorded, so no hit
in the table came from a method-mismatch rejection.

## Never-hit endpoints (full list)

The 7 endpoints below received **zero** HTTP requests in the run. “No behavioural spec” in the last
column is a static observation on top of the measurement: no co-located `*.Spec.cs` exists for the
handler, and a grep of every `*.Spec.cs` in `apps/api` finds no reference that exercises it (only
architecture inventories that list the type or route as data).

| # | Endpoint                                    | Handler                              | Mapped in                                                                                                                | Behavioural spec |
| - | ------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| 1 | `GET /auth/user-tenants`                    | `GetUserTenants`                     | [`AuthEndpoints.cs`](../../apps/api/Modules/Auth/Endpoints/AuthEndpoints.cs)                                             | none — only `typeof(GetUserTenants)` in `ArchitectureDiscovery.Spec.cs:20` |
| 2 | `GET /staff/invitations/{invitationId}`     | `GetStaffInvitation`                 | [`InvitationEndpointsForStaff.cs`](../../apps/api/Modules/Invitations/Endpoints/InvitationEndpointsForStaff.cs)           | none             |
| 3 | `GET /staff/invitations/{invitationId}/link`| `GetStaffInvitationLink`             | same file                                                                                                                | none             |
| 4 | `POST /staff/invitations/{invitationId}/resend` | `ResendStaffInvitation`          | same file                                                                                                                | none             |
| 5 | `POST /posts/publications/{publicationId}/mark-published` | `MarkPublicationPublishedForTenant` | [`PostPublishingEndpointsForTenant.cs`](../../apps/api/Modules/Publishing/Endpoints/PostPublishingEndpointsForTenant.cs) | none — only the string `"MarkPublicationPublishedForTenant"` in `PublishingDispatchArchitecture.Spec.cs:78` |
| 6 | `POST /social-accounts/mastodon/start`      | `StartMastodonConnectForTenant`      | [`SocialAccountEndpointsForTenant.cs`](../../apps/api/Modules/SocialAccounts/Endpoints/SocialAccountEndpointsForTenant.cs) | none (the Mastodon OAuth service and client have specs; this route does not) |
| 7 | `POST /social-accounts/mastodon/callback`   | `CompleteMastodonConnectForTenant`   | same file                                                                                                                | none             |

Grouped by module: Invitations 3 (the staff read/link/resend trio), SocialAccounts 2 (Mastodon
connect start + callback), Auth 1 (`user-tenants`), Publishing 1 (`mark-published`).

## Hit, but never with a success response

These 3 endpoints were reached, so they count as “hit”, but every recorded response was a failure —
a hit here proves the route resolves and its guards reject, not that the happy path works.

| Endpoint                            | Statuses observed  | Note                                                         |
| ----------------------------------- | ------------------ | ------------------------------------------------------------ |
| `GET /auth/verification-link`       | 404, 422, 429      | `GetVerificationLink`                                         |
| `GET /staff/users/{userId}`         | 400, 401, 403, 404 | `GetStaffUserById` — the co-located spec only tests malformed/missing ids and auth failures |
| `POST /auth/verify-email-request`   | 404, 422, 429      | `VerifyEmailRequest`                                          |

## What this measurement does NOT prove

1. **A hit means routing matched the route — not that the handler ran.** The recorder sees the
   request's resolved endpoint, so a request short-circuited by an auth filter (`401`/`403`), the
   rate limiter (`429`) or a validation filter (`422`) counts as a hit even though the handler never
   executed. 3 routes were hit exclusively by failure responses (table above); 147 had at least one
   2xx, but nothing here says a test asserted the body, the side effects or the status.
2. **No branch, line or permission coverage.** One successful request to a route leaves its
   validation branches, `403` path, conflict paths, pagination variants and error branches
   unexercised. This is endpoint *reachability*, not handler coverage.
3. **“Never hit” is not “untested” in general.** Some specs call a handler directly instead of
   sending a request — for example
   [`CreateTenantAsStaff.Spec.cs:1083`](../../apps/api/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.Spec.cs#L1083)
   and [`CreateStaffUpload.Failure.Spec.cs:251`](../../apps/api/Modules/Uploads/Handlers/Staff/CreateStaffUpload.Failure.Spec.cs#L251)
   invoke `Handle(...)` in-process. Any such coverage is invisible to this measurement. For the 7
   never-hit endpoints specifically, a static check found no behavioural spec at all, but the
   measurement alone proves only “no HTTP request reached this route”.
4. **In-process hosts only.** Only hosts created inside the test process are observed. A real Kestrel
   server (Aspire AppHost, `just dev-*`, either e2e suite) is out of scope; no spec in this tree was
   found to send HTTP to one, but a future out-of-process spec would be invisible and would silently
   shrink the hit set.
5. **The denominator is the Testing-environment route table.** OpenAPI/Scalar endpoints are mapped
   only in Development and are absent; the worker role serves no HTTP. A route that exists only in a
   deployed configuration is not counted.
6. **One run, one machine, one configuration** (`APP_ROLE=all`, `ASPNETCORE_ENVIRONMENT=Testing`,
   xUnit parallelism of 4 classes). No ordering-sensitive result was observed — every recorded
   pattern exists in the table (`unknown patterns hit: 0`) — but a spec that is flaky or skipped in
   another run would move an endpoint between the two columns. No test was skipped in this run.
7. **Not a guard.** It is one dated measurement, not a CI step, not a manifest, not a ratchet. Nobody
   is enforcing that the 7 endpoints stay listed; re-run the method to refresh it.

## Suite health during the measurement

The suite was **not green**: 9 failures, 0 skipped, 2 983 passed. All 9 are
`AppHostOrchestrationGuardSpec`, whose shared lazy warm-up runs
`dotnet build apps/apphost -c Debug` with a 15-minute cap and asserts the build exits on its own; it
did not finish inside the cap (15 m 21 s), so the class's 8 artifact assertions failed immediately
after. That guard talks to no HTTP endpoint of the API host and its subject (`apps/apphost`) does not
reference the test assembly, so it cannot affect the hit set. It was **not** re-run against clean
`develop`, so this record does not claim the failure is pre-existing — only that it is outside the
measured surface. It was the run's long pole: while that single build was in flight the rest of the
suite was executed by the other xUnit workers.

## Reproducing

There is no committed hook: the two throw-away files (`Lib/Testing/Diagnostics/EndpointHitRecorder.cs`
and `Tests/EndpointRouteTableDump.Spec.cs`, ~90 and ~70 lines) were deleted before the commit. To
refresh the numbers:

1. Add a test-only `[ModuleInitializer]` that subscribes to
   `DiagnosticListener.AllListeners` and, for `Microsoft.AspNetCore.Hosting.HttpRequestIn.Stop`
   events whose payload is an `HttpContext`, appends
   `${Method}\t${(HttpContext.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? "-"}\t${Response.StatusCode}\t${Request.Path}`
   to the file named by `PUBLYAPP_ENDPOINT_HIT_LOG`. Put it under `apps/api/Lib/Testing/` so only
   the test project compiles it (`PublyApp.Api.csproj` removes `Lib/Testing/**` and `Tests/**`).
2. Add a spec that builds `WebApplicationFactory<Program>` in `Testing` with a stub `DbContext`,
   resolves `EndpointDataSource` and writes one `METHODS\tpattern\tdisplay` line per `RouteEndpoint`
   to `PUBLYAPP_ENDPOINT_ROUTE_TABLE` (copy the factory from the permission-metadata guard).
3. Run the command at the top of this record (add
   `PUBLYAPP_ENDPOINT_ROUTE_TABLE=<file>`); diff `(METHOD, template)` pairs, treating
   `{*path:nonfile}` and `/health*` as system routes and `template == "-"` as non-routed.
