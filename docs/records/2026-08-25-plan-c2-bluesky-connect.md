# C2 — Bluesky connect (Lane #641) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Epic C delivery step 2 (spec `2026-08-22-epic-c-social-accounts-design.md`, pruned from `docs/` on 2026-08-25 — see `2026-08-25-audit-docs-prune.md`; §6 item 2 preserved here, closing #641): a minimal Bluesky client (session open with an app password, DID/handle resolution), the three tenant permissions (`tenant.socialaccounts.view|manage|publish`), and the routes **list / connect / reconnect / disconnect / attach (+ detach)** with audit entries, a stricter rate-limit policy for the routes that call Bluesky, and the regenerated Kiota client.

**Architecture:** The existing C1-bis slice (`apps/api/Modules/SocialAccounts`: entities, `CredentialProtector`, master-key witness, `LastErrorSanitiser`, `VisibleIn`) is extended in place. The Bluesky HTTP call sits behind an **infrastructure seam** (`IBlueskySessionProvider`, namespace `PublyApp.Api.Infrastructure.Social`) so `SocialAccountService` keeps depending only on `AppDbContext` + infrastructure abstractions (the `ServiceDependencyBoundaryGuard` rule: services never inject other domain services; handlers orchestrate). Failure classification happens inside the adapter: account-caused refusals (bad credentials, unknown identifier) vs transient (network/5xx) surface as a typed result, never as exceptions crossing the seam.

**Tech stack:** .NET 10 minimal APIs, EF Core 10, xUnit + FluentAssertions + Testcontainers via `ApiFixture`, Kiota client generation via `just generate-client`.

## Global Constraints (from spec §2/§3/§4/§6/§7)

1. **Secret hygiene:** `ProtectedCredentials` cleartext is returned by no API, logged nowhere, present in no error message, stored in no audit row. Every response body of every new route is scanned by a spec that fails if the app password appears. `LastError` goes through `LastErrorSanitiser`.
2. **Bluesky refusal → nothing stored:** if the provider refuses the session, the API returns 422/503 accordingly and writes zero rows (verified by spec).
3. **Isolation:** another tenant's account answers **404**, never 403.
4. **Visibility:** list endpoint applies `VisibleIn` semantics only when filtering per project: unattached = visible everywhere; attached to X = invisible when filtered by Y. Without a project filter all accounts are listed.
5. **Permissions:** each route carries exactly one verb permission via `.WithTenantPermission([...])`; missing permission → 403 (filter behavior), which is asserted per route.
6. **Rate limiting (spec §4):** connect/reconnect call Bluesky, so they get a stricter dedicated policy than reads. New policy `SocialConnect` added to `ApiRateLimitSettings`/`ApiRateLimiterStore`/`ApiRateLimitOptionsSetup`/env wiring/`ComprehensiveRateLimiting.Spec` expectations. List stays on `HeavySearchList`; disconnect/attach/detach stay on `AuthenticatedDefault`.
7. **Wire conventions:** camelCase JSON fields, snake_case query params, wire status strings via a static `SocialAccountWire.FormatStatus` formatter (`active`, `needs_reconnect`, `revoked`), credential type `app_password`. No collapsed lowercase values.
8. **Analyzers/guards:** PUBLY0001–0007 respected (no `!`, no `?? throw`, no `ToLower()` dispatch, cached JsonElement getters, no `Dto` suffix on wire types, `[Service]` DI with primary interface `I{ClassName}`, service methods take `Guid tenantId` and use it). Handler entrypoint named `Handle`; contract types are top-level siblings; handlers hold no DbContext. Tenant handlers live under `Handlers/Tenant` with names containing `Tenant`/`ForTenant`.
9. **Audit:** new `AuditActions` constants `socialaccount.connected`, `socialaccount.reconnected`, `socialaccount.disconnected`, `socialaccount.projects.attached` (details carry detached count too). Details include handle/DID/project ids — never credentials.
10. **Migrations:** none required — C2 adds no columns or tables. If implementation proves otherwise, `just db-add SocialAccountsC2 && just db-migrate`.
11. **No hosted service added** (`AppRoleCompositionSpec` unaffected).
12. **OpenAPI snake_case guard:** query/body params snake_case; response JSON camelCase.

## File Structure

**Create**
- `apps/api/Infrastructure/Social/IBlueskySessionProvider.cs` — seam: `Task<BlueskySessionResult> OpenSessionAsync(BlueskyCredentials credentials, CancellationToken ct)`.
- `apps/api/Infrastructure/Social/BlueskyModels.cs` — `BlueskyCredentials(Identifier, AppPassword)`, `BlueskySession(Did, Handle)`, typed outcomes `BlueskySessionResult.{Success, AccountFailure, Transient}` (AccountFailure carries a sanitised reason string).
- `apps/api/Infrastructure/Social/BlueskySessionProvider.cs` — `[Service]` typed HttpClient (`com.atproto.server.createSession` at `https://bsky.social/xrpc`), classifies `HttpRequestException`/timeout → `Transient`, 401 → `AccountFailure("credentials refused")`, 400 → `AccountFailure(...)` per AT Protocol error taxonomy. Never throws across the seam except `OperationCanceledException`.
- `apps/api/Lib/Testing/Fakes/FakeBlueskySessionProvider.cs` — records calls, programmable outcome (`NextResult`), default success mapping identifiers to deterministic DIDs.
- `apps/api/Modules/SocialAccounts/Permissions/SocialAccountPermissionsForTenant.cs` — `ISlicePermissions`, KeyPrefix `socialaccounts`, VIEW/MANAGE/PUBLISH with EN+FR translations.
- `apps/api/Modules/SocialAccounts/Routes.SocialAccounts.cs` — `Routes.SocialAccounts.ForTenant` partial: Root `/social-accounts`, Find `/`, Connect `/connect`, Reconnect `/{socialAccountId}/reconnect`, Disconnect `/{socialAccountId}/disconnect`, Attachments `/{socialAccountId}/projects` (PUT replace-all attach/detach), GetByIdFn-style helpers.
- `apps/api/Modules/SocialAccounts/Endpoints/SocialAccountEndpointsForTenant.cs` — group `RequireRateLimiting(AuthenticatedDefault)` + per-route overrides; `.WithTenantPermission(...)` per verb.
- `apps/api/Modules/SocialAccounts/Handlers/Tenant/FindSocialAccountsForTenant.cs` — keyset list (CursorPaginatedQuery subclass + validator; optional `project_id` filter applying VisibleIn semantics; sort_id `created_at|updated_at`).
- `apps/api/Modules/SocialAccounts/Handlers/Tenant/ConnectSocialAccountForTenant.cs`
- `apps/api/Modules/SocialAccounts/Handlers/Tenant/ReconnectSocialAccountForTenant.cs`
- `apps/api/Modules/SocialAccounts/Handlers/Tenant/DisconnectSocialAccountForTenant.cs`
- `apps/api/Modules/SocialAccounts/Handlers/Tenant/SetSocialAccountProjectsForTenant.cs` — replaces the full attachment set (attach + detach in one idempotent PUT).
- Specs:
  - `apps/api/Modules/SocialAccounts/SocialAccountEndpoints.Spec.cs` — happy paths, contract shapes.
  - `apps/api/Modules/SocialAccounts/SocialAccountSecretLeak.Spec.cs` — every route's full JSON + audit rows scanned for the password.
  - `apps/api/Modules/SocialAccounts/SocialAccountIsolation.Spec.cs` — cross-tenant 404.
  - `apps/api/Modules/SocialAccounts/SocialAccountVisibility.Spec.cs` — VisibleIn through the list endpoint.
  - `apps/api/Modules/SocialAccounts/SocialAccountPermissions.Spec.cs` — 403 per route without the verb.
  - `apps/api/Modules/SocialAccounts/SocialAccountRefusal.Spec.cs` — Bluesky refusal stores nothing (both failure classes); reconnect on Revoked → 404; disconnect pauses nothing here (C4) but sets Revoked + erases secret.
- `docs/records/2026-08-25-plan-c2-bluesky-connect.md` — this file (moved round 2 from `docs/superpowers/plans/`, which develop pruned).

**Modify**
- `apps/api/Lib/AppPermissions.cs` — `public SocialAccountPermissionsForTenant SocialAccounts { get; } = new();` in `TenantScopePermissions`.
- `apps/api/Lib/Routes/Routes.cs` — nothing (route constants live in the module's partial file, mirroring Posts/AuditLogs).
- `apps/api/Lib/RateLimiting/ApiRateLimitSettings.cs` — add `SocialConnect` window + `FromEnvironment` wiring.
- `apps/api/Lib/AppEnvironment.cs` — `SOCIAL_CONNECT_RATE_LIMIT_PERMIT_LIMIT` (default 5) / `..._WINDOW_SECONDS` (default 3600) with FluentValidation bounds.
- `apps/api/Lib/RateLimiting/ApiRateLimitPolicies.cs` — constant + store entry + options-setup partitioning (session-fingerprint single policy).
- `apps/api/Lib/RateLimiting/ComprehensiveRateLimiting.Spec.cs` — extend settings construction sites to include the new window (compile fix + one assertion row if the spec enumerates policies).
- `apps/api/Lib/ServiceRegistration.cs` — register `IBlueskySessionProvider` (typed HttpClient) next to the C1-bis block.
- `apps/api/Lib/Testing/Fixtures/ApiFactory.cs` — replace `IBlueskySessionProvider` with `FakeBlueskySessionProvider` singleton (same shape as `FakeEmailSender`).
- `apps/api/Modules/SocialAccounts/Services/SocialAccountService.cs` — add list/connect/reconnect/disconnect/set-projects methods (tenantId param used everywhere).
- `apps/api/Lib/AuditActions` holder (`apps/api/Modules/AuditLogs/Entities/AuditLog.cs`) — four new constants.
- `packages/shared-ts/src/lib/i18n/json/response-message.en.json` + `.fr.json` — new keys (see Task 5); regenerate `ResponseKeys.g.cs` via `just generate-response-keys`.
- `apps/api/Modules/Permissions/Handlers/Staff/FindTenantPermissions.Spec.cs` — extend `ExpectedTenantPermissionKeys` with the three keys (sorted position).
- `apps/client-ts/**` + front types — generated only, via `just build-api && just generate-client`.

---

## Task 1: Permissions slice (view/manage/publish)

**Files:** Create `SocialAccountPermissionsForTenant.cs`; Modify `AppPermissions.cs`, `FindTenantPermissions.Spec.cs`.

- [ ] **Step 1: Extend `ExpectedTenantPermissionKeys`** in `FindTenantPermissions.Spec.cs` with `tenant.socialaccounts.publish`, `tenant.socialaccounts.manage`, `tenant.socialaccounts.view` inserted in the sorted position after `tenant.settings.edit`/before `tenant.billing.*` (match the array's current ordering convention). Run the spec → red (seeder has no such keys yet).
- [ ] **Step 2: Implement** `SocialAccountPermissionsForTenant : ISlicePermissions` (KeyPrefix `socialaccounts`; VIEW "View social accounts"/MANAGE "Connect and manage social accounts"/PUBLISH "Publish through social accounts"; EN + FR translations following `PostPermissionsForTenant` verbatim style).
- [ ] **Step 3: Wire into `AppPermissions.TenantScopePermissions`** as `SocialAccounts`.
- [ ] **Step 4:** Run `FindTenantPermissions.Spec` → green. Commit.

## Task 2: Bluesky infrastructure seam + fake + rate-limit policy

**Files:** Create `Infrastructure/Social/*`, `FakeBlueskySessionProvider.cs`; Modify rate-limit quartet, env wiring, `ServiceRegistration.cs`, `ApiFactory.cs`, limiter spec.

- [ ] **Step 1: Failing unit spec** for `BlueskySessionProvider` classification using a stubbed `HttpMessageHandler`: 401 → `AccountFailure`, 400 with `InvalidRequest` → `AccountFailure`, `HttpRequestException` → `Transient`, 500 → `Transient`. Assert the reason strings never echo the app password (the adapter forwards it only in the request body).
- [ ] **Step 2: Implement models + interface + provider.** Provider uses `IHttpClientFactory`-created client configured once (`BaseAddress https://bsky.social/`); request body `{identifier, app_password}`; response `{did, handle}`; non-success mapped per step 1. `[Service(ServiceLifetime.Scoped)]` with primary interface naming.
- [ ] **Step 3: Fake** in `Lib/Testing/Fakes/` mirroring `FakeEmailSender` ergonomics (`SentCalls`, `NextResult` settable, default success).
- [ ] **Step 4: Rate limit policy** `SocialConnect`: settings record field, env vars (defaults 5 permits / 3600 s), store entry, options setup partitioned by session fingerprint, `IsKnown` coverage automatic via constants. Update `ComprehensiveRateLimiting.Spec` construction sites (compile-level) — its theory enumerates anonymous flows, so only the `ApiRateLimitSettings` constructions need the new argument.
- [ ] **Step 5: DI + ApiFactory**: register real provider; replace with fake in `ApiFactory` (`RemoveAll<IBlueskySessionProvider>()` + singleton fake). Run architecture guards + limiter specs → green. Commit.

## Task 3: Service methods (list, connect, reconnect, disconnect, set projects)

**Files:** Modify `SocialAccountService.cs` (+ co-located unit-ish specs where pure).

Design (all methods take `Guid tenantId` and use it):

- `FindForTenantAsync(tenantId, FindSocialAccountsArgs{Cursor, Limit, SortId, SortOrder, ProjectId?}, ct)` → keyset pagination identical to `PostService.FindForTenantAsync` (cursor on `Id` GUID, sort field handler for `created_at|updated_at`, invalid sort_id/cursor typed failures). When `ProjectId` is set: load junction rows for the page candidates and apply `VisibleIn.Visible(account, projectId)` before materialising the page (page size applied after visibility filter, matching the spec's rule that attached accounts are invisible elsewhere; documented tradeoff: filter-before-page keeps correctness over cursor stability for v1).
- `ConnectAsync(tenantId, actorUserId, identifier, appPassword, ct)`:
  1. resolve existing row by DID later; first call `_bluesky.OpenSessionAsync` (infrastructure injected into the **service** — allowed, infrastructure abstraction);
  2. `AccountFailure` → return typed `ConnectResult.Refused(reasonKey)` — **no DB write**;
  3. `Transient` → `ConnectResult.Unreachable` — no DB write;
  4. success: upsert-by-unique-index semantics — find by `(tenantId, Bluesky, did)`; if found and Status Active → `ConnectResult.AlreadyConnected`; if found and not deleted → replace secret (`CredentialType.AppPassword`), set DisplayHandle, Status=Active, clear LastError, set LastSuccessAt (reconnect-equivalent path for a previously disconnected DID);
     if absent → insert new row;
  5. audit handled by caller (handler), passing handle/DID only.
- `ReconnectAsync(tenantId, socialAccountId, actorUserId, appPassword, identifier?, ct)`: load row scoped by tenant (null → NotFound); refuse when Status Revoked (typed `ReconnectResult.NotFound`-style conflict → 404 per §3 "connecting a different account requires reassigning"); open session with stored DisplayHandle unless identifier overrides; success → replace secret, Active, LastSuccessAt, clear LastError; refusal/unreachable → typed results, row untouched except… nothing (LastError update is C4/Epic-D territory; keep C2 read-pure on failure).
- `DisconnectAsync(tenantId, socialAccountId, actorUserId, ct)`: load scoped (null → NotFound); set Status=Revoked, erase `ProtectedCredentials` (empty string sentinel consistent with UnprotectOutcome.Absent handling), clear LastError; posts untouched (pause is C4).
- `SetProjectsAsync(tenantId, socialAccountId, projectIds, ct)`: load scoped; validate ids belong to tenant (unknown id → typed InvalidProject); diff against existing junction rows; insert/remove; returns applied counts for audit details.

- [ ] **Step 1: Write failing service-level specs** (direct `new SocialAccountService(dbContext, protector, bluesky)` against the fixture DB): refused connect writes nothing; successful connect persists encrypted blob whose plaintext ≠ app password (decrypt via protector in test only); duplicate DID upsert; revoke erases secret; set-projects diffing; list pagination + visibility.
- [ ] **Step 2: Implement** until green. Run `SocialAccountArchitecture.Spec` (tenantId usage guard) + dependency-boundary guard → green. Commit.

## Task 4: Routes, endpoints, handlers, i18n keys, audit constants

**Files:** Create `Routes.SocialAccounts.cs`, `Endpoints/SocialAccountEndpointsForTenant.cs`, five handlers; Modify `Program.cs` (map under `tenantGroup`), i18n json ×2, `AuditLog.cs` constants; run `just generate-response-keys`.

Contract summary:

| Route | Verb | Permission | Limiter | Success | Failures |
|---|---|---|---|---|---|
| `/social-accounts/` | GET | view | HeavySearchList | 200 `FindSocialAccountsForTenantResponse : CursorPaginatedResult<SocialAccountListItem>` | 400 bad cursor/sort_id |
| `/social-accounts/connect` | POST | manage | **SocialConnect** | 201 `SocialAccountCreated{item}` | 422 `credentials_refused`, 503 `provider_unreachable`, 409 `already_connected` |
| `/social-accounts/{id}/reconnect` | POST | manage | **SocialConnect** | 200 `ApiResponse(message,key)` | 404 foreign/unknown/revoked, 422 refused, 503 unreachable |
| `/social-accounts/{id}/disconnect` | POST | manage | AuthenticatedDefault | 200 `ApiResponse` | 404 |
| `/social-accounts/{id}/projects` | PUT | manage | AuthenticatedDefault | 200 `ApiResponse` | 404, 422 unknown project |

- `SocialAccountListItem`: `id`, `provider` ("bluesky"), `external_account_id`(DID), `display_handle`, `status` (wire string), `credential_type` ("app_password"), `last_success_at`, `last_error`, `project_ids[]`. **No secret field, ever.**
- Handlers follow `FindPostsForTenant` shape: parse auth context tenantId, cache JsonElement getters, map service results to `TypedProblems.*` with new ResponseKeys.
- Audit calls in mutation handlers via `IAuditLogService.LogAsync` (actor = `authContext.UserId`, action constants from Task list above, TargetId = account id, Details = {handle, did, project_ids/count}).

- [ ] Step 1: failing endpoint specs (contract shapes + status codes per table).
- [ ] Step 2: implement handlers/endpoints/routes; wire `MapSocialAccountEndpointsForTenant()` in Program.cs; add audit constants + i18n keys (EN+FR); `just generate-response-keys`; green. Commit.

## Task 5: Proof specs (the six mandated proofs)

One file per proof, all integration specs on the ephemeral DB, fake Bluesky only:

1. **Secret-leak sweep** (`SocialAccountSecretLeak.Spec`): connect with password `correct-horse-battery-staple`; then GET list, GET each detail-bearing route, and read `audit_log` rows directly via DbContext; assert raw password appears nowhere; assert DB column `protected_credentials` decrypts to the password but the stored blob ≠ plaintext.
2. **Isolation**: tenant B token + X-Tenant-Id B on tenant A's account id → 404 on reconnect/disconnect/projects; A's account absent from B's list.
3. **Visibility**: unattached account listed under both projects' filter; attached-to-X account listed under X filter, absent under Y filter, present unfiltered.
4. **Permissions**: matrix test hitting all 5 routes without the verb → 403 (and 404-without-session sanity).
5. **Refusal**: fake returns AccountFailure → 422, zero rows in `social_accounts` for that tenant; Transient → 503, zero rows; then success path inserts exactly one row.
6. **Disconnect semantics**: disconnect → status revoked + secret erased (`Unprotect` → Absent) + still listed; reconnect-after-revoke → 404.

Plus the **adversarial mutation** (for PR body): temporarily drop `.Where(a => a.TenantId == tenantId)` from the service's find-by-id → `SocialAccountIsolation.Spec` must go red; capture command + output transcript into `.dump/mutation-check.md`; revert.

- [ ] All proof specs green; mutation transcript captured; revert verified clean. Commit.

## Task 6: Kiota regeneration + full gates

- [ ] `just build-api && just generate-client && pnpm --filter front typecheck` — commit regenerated `packages/client-ts`.
- [ ] `~/ai-orchestration-playbook/tools/heavy.sh just test-api` (serialized) → green.
- [ ] `just check-write`, `just knip`, OpenAPI drift/spec suites green.
- [ ] Push branch.

## Task 7: PR + DONE

- [ ] Write `.dump/pr-body.md` (mirror house style: What / Fix-per-area / Verification with concrete commands + mutation evidence; `Closes #641`, refs #630).
- [ ] `gh pr create --base develop --head lane/wt-641 --title "feat(social): C2 Bluesky connect (#641)" --body-file .dump/pr-body.md`.
- [ ] Poll CI to green (fix forward if red).
- [ ] Write `.dump/DONE.md` (summary, evidence links, CI run URL). Print **DONE**.
