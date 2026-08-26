# Staff impersonation of tenant users (#160) — Phase 1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the missing backend half of #160 (staff impersonation of tenant users) as a complete vertical API slice: an "end impersonation" service method that emits the never-yet-emitted `impersonation.ended` audit action, two staff endpoints (`POST /staff/impersonations` to start, `POST /staff/impersonations/{id}/end` to end), a dedicated `ImpersonationsPermissionsForStaff` slice with `START`/`END` verbs, response-message i18n keys EN+FR, and the regenerated Kiota client. Round 2 adds four blocker-level pieces to the same slice: the downstream **identity-attribution seam** (`IRequestAuthContext.IsImpersonation` + `ImpersonatingStaffUserId`, populated by `SessionAuthFilter`, consumed by every audit write), the **adversarial start guards** (non-staff callers, staff-scope targets, nested impersonations), the **security core** (deny-list, hard applied time limit, explicit exit), and the **tenant-scope banner signal** on `GetScopeAuthData`. Round 3 makes every guarantee MACHINE-CHECKED instead of asserted: an inventoried + analyzer-enforced + gate-wired attribution rule (Steps 0b–0d), presentation-time enforcement of the time limit inside `SessionAuthFilter.InvokeAsync`, service-path-exercising adversarial specs with named kill mutations (M1–M8), and a fully specified partial unique index with its 409 contract.

**Scope (round 4, stated plainly): this PR is PLANNING-ONLY — a single docs file, no code.** The analyzer, the specs, the migration `ImpersonationOneActiveImpersonationPerUser`, the route group, the permission slice, the handlers, and every other `- [ ]` item below are TODOs for the implementation PR(s), NOT artifacts in this tree at this tip. Verified: `git diff --name-only $(git merge-base origin/develop HEAD)..HEAD` → `docs/records/2026-08-26-plan-160-staff-impersonation.md` only; `git ls-tree -r origin/develop -- packages/lint-cs` lists 29 files and none is `ImpersonationVictimAsAuditActorAnalyzer.cs`. Every gate named below (Step 0d) is therefore a gate **the implementation PR will rely on, named here so its reviewer can re-check the wiring** — not a gate that runs on this PR's code. Round 4 corrects four factual errors round 3 made about the real repo (each re-derived against `origin/develop` = `198a6e4b70` with pasted output in `.dump/citations-r4.md`): the attribution guard now enumerates BOTH real audit-write patterns (Step 0b/0c); the CI claim is rewritten as future wiring; §3b names its two unit specs, their kill mutations M7/M8, and quantifies the per-request cost; Step 0b's inventory command is one that actually produces the enumeration (the old command returned exactly 1 line).

The front-end UI half of #160 (start button in the staff user list, end banner in the tenant UI) is deliberately out of scope here and is tracked by the phase 2 issue.

**Adversarial core (round-2 review, all blocker-level — addressed in-plan):**

1. **Downstream identity attribution (round 3: enforced by machine, not prose).** An impersonated request MUST be attributable to the REAL staff actor everywhere downstream (authorization filters, handlers, audit writes). Today `SessionAuthFilter` resolves identity solely from `sessionData.User.Id` into `IRequestAuthContext.UserId`, and the context carries no impersonation signal — so every downstream check acts as the victim. Task 5 specifies the context fields, the exact population point, the audit actor rule, and the named RED spec proving an impersonated request records the real staff actor, never the victim.
   **Round 3 honesty requirement:** there is NO single audit seam in this repo today. At the develop tip this plan is verified against (`198a6e4b70`; every number below re-run at round 4), `git grep -c "new CreateAuditLogArgs" apps/api` finds **58 construction sites with an explicit `UserId:`**, of which **54** pass `UserId: account.UserId` where `account` comes from `authContext.AccountTenant` / `authContext.AccountStaff` — populated by `TenantAuthFilter` / `StaffAuthFilter` from the VICTIM's id under impersonation. Four more pass a local variable (`CreateStaffProfile` via `currentUserId = authContext.AccountStaff.UserId`; `AcceptInvitation` twice; the `UploadOrphanReclaimerHandler` job). The 58th construction site is inside the helper `TenantUserCompanyShared.LogBulkActionAsync` (one construction, called by four `*TenantUserCompaniesForStaff` handlers).
   **Round 4 honesty requirement — TWO distinct audit-write patterns exist at the tip; a guard over pattern 1 alone guards half the surface.** Re-derived at `origin/develop` = `198a6e4b70` (commands + full output in `.dump/citations-r4.md`):
   - **Pattern 1 — `new CreateAuditLogArgs(...)` + `IAuditLogService.LogAsync(...)`: 58 sites.** All live in handler or job files; zero under any `Services/` directory (`git grep -lE 'new CreateAuditLogArgs' origin/develop -- apps/api | grep -cE 'Services/'` → `0`). The helper site is one of the 58 (57 files contain a construction; `TenantUserCompanyShared.cs` is one of them and is NOT under `Services/`).
   - **Pattern 2 — `AuditLog.CreateEntry(...)` + `_dbContext.AuditLog.Add(...)` directly: exactly 3 production sites** (`git grep -n -A8 "AuditLog\\.CreateEntry(" origin/develop -- apps/api | grep "userId:"` → the private helper `AddAuditEntry` in `apps/api/Modules/Impersonations/Services/ImpersonationService.cs` writing `userId: staffUserId`, and the private helper `AddAuditEntry` in `apps/api/Modules/Profiles/Services/TenantProfileAsStaffService.cs` writing `userId: args.ActorUserId` (the handler feeds it via `ActorUserId: account.UserId`); plus `AuditLogService.BuildAuditLog` itself, the abstraction's own factory):
     1. `Modules/AuditLogs/Services/AuditLogService.cs` (`BuildAuditLog`) — the abstraction itself; exempt by definition.
     2. `Modules/Impersonations/Services/ImpersonationService.cs` (`AddAuditEntry`) — this plan's own file; `userId:` is an explicit parameter (`staffUserId`), never a context-typed value.
     3. `Modules/Profiles/Services/TenantProfileAsStaffService.cs` (`AddAuditEntry`, private) — **the real present-tense bypass**: it writes `userId: args.ActorUserId` into the audit row. The caller chain is `AssignTenantProfileUserAsStaff.Handle` → reads `var account = authContext.AccountStaff;` → passes `ActorUserId: account.UserId` inside `SetTenantProfileUserArgs`. Under impersonation as shipped today, `AccountStaff.UserId` would be the impersonated principal's id — a service writing an audit row whose actor comes from a context-shaped value through an args record, invisible to a pattern-1-only analyzer.
   A pattern-1-only analyzer CATCHES ZERO pattern-2 sites. The guard therefore covers both patterns (Step 0c), and the plan states its honest residual gap instead of overstating coverage: **what neither layer can cover today is a THIRD pattern that does not exist yet** — a future writer that obtains the actor id from an untyped source (reflection, raw SQL result, a new args record field named anything other than the enumerated shapes). If such a pattern appears, it ships outside both layers' populations; the follow-up is to re-run the Step 0b inventory commands as a drift check whenever `audit_logs` gains a new write path (recorded as part of F5 below). A plan that claims total future-proof coverage would be lying; a plan that enumerates what it catches and names what it cannot catch is executable.
2. **Adversarial start guards.** A non-staff account cannot start an impersonation; impersonation cannot be nested onto a user who is already being impersonated; a staff-scope account can never be a TARGET. The current `CreateImpersonationSessionAsync` only filters `AccountScope.Tenant && Status != AccountStatus.Suspended`; Task 3 adds the service-boundary guards plus an active-impersonation uniqueness backstop, each proven by a named spec.
3. **Security core.** What the impersonated session cannot do, a hard enforced time limit with an explicit exit mechanism, and the backend banner contract for #1497 are specified under "Security core guarantees" below and implemented in Tasks 3–5.

**Architecture:** The impersonation data model already exists and does not change: an impersonation session is a normal `sessions` row with `is_impersonation = true`, `impersonating_staff_user_id`, `impersonation_reason`, and `impersonation_expires_at` (`apps/api/Modules/Auth/Entities/Session.cs`). The dual-cookie transport format (`s:<staffToken>+t:<tenantToken>`) already exists in `packages/shared-ts/src/lib/session/parse.ts` and is written at login / accept-invitation by `apps/front/src/lib/server/session-actions.ts` and `session-cookie-utils.ts`. What #160 lacks is the control plane:

- `IImpersonationService.EndImpersonationSessionForStaffAsync(EndImpersonationSessionArgs, CancellationToken)` — revokes the impersonation session row (hard delete; `sessions` rows are hard-deleted by the existing `CleanupExpiredSessionsHandler` sweep, so hard delete on revoke matches house behavior for session lifecycle) inside one save, emitting the `AuditActions.ImpersonationEnded` audit entry in the same transaction.
- **Identity attribution (new):** `IRequestAuthContext` gains `bool IsImpersonation { get; set; }` and `Guid? ImpersonatingStaffUserId { get; set; }`; `SessionAuthFilter` populates both from `sessionData.Session.IsImpersonation` / `.ImpersonatingStaffUserId` immediately after resolving `sessionData.User.Id`. Every downstream audit row written during an impersonated request therefore records the REAL staff actor as `UserId` (with the victim preserved as `Details.ActingAsUserId`). Spec: `ItShouldAttributeImpersonatedRequestToRealActorInAudit` (Task 5).
- **Start guards (new):** the explicit-target creation path rejects staff-scope targets (`403 impersonation-staff-user-required`), rejects targets with an active impersonation session (`409 impersonation-already-impersonated`, backed by a partial unique index), and sits behind `WithStaffAuthorization` so non-staff callers never reach the service.
- **Security core (new):** deny-list of operations for any impersonated principal (no credential change, no tenant delete, no re-impersonation start/end), a HARD time limit ENFORCED AT PRESENTATION TIME in `SessionAuthFilter.InvokeAsync` — expired, suspended-mid-window, or grant-revoked impersonation sessions are rejected there with 401 and their row deleted (see "Security core guarantees" §3) — and an explicit exit surface (`POST /staff/impersonations/{id}/end`).
- **Banner signal contract (new):** `GetScopeAuthData` (tenant scope) exposes `is_impersonated` + `impersonation_expires_at` so the phase 2 front (#1497) can render a visible banner for the whole session without any further backend change.
- Two handlers under `apps/api/Modules/Impersonations/Handlers/Staff/`: `StartImpersonationForStaff.cs` and `EndImpersonationForStaff.cs`.
- An endpoint group `apps/api/Modules/Impersonations/Endpoints/ImpersonationEndpointsForStaff.cs` mounted at `/staff/impersonations`.
- A new permission slice `ImpersonationsPermissionsForStaff` (`staff_impersonations.start`, `staff_impersonations.end`) wired into `AppPermissions.Staff` so the reflection-based seeder picks it up.
- Two new response-message i18n key groups (EN + FR): start-path failures and end-path outcomes.

The start endpoint returns the created impersonation session's token and id so the front can compose the combined cookie `s:<staffToken>+t:<impersonationToken>` using the existing `formatSessionCookie({staffToken, tenantToken})` helper — no front server-fn changes are required in this phase; the phase 2 UI issue wires them.

**Tech stack:** .NET 10 minimal APIs, EF Core 10 against real PostgreSQL via Testcontainers (`ApiFixture`), xUnit + FluentAssertions, FluentValidation over `JsonElement` bodies, Kiota client regeneration.

## Global Constraints

1. **No schema changes to existing columns.** Every column the feature needs exists on `sessions` (`Session.cs`). Exactly one additive schema artifact is allowed: a partial unique index backing the no-parallel-impersonation invariant, fully specified (round 3):
   - **Index name:** `ux_sessions_one_active_impersonation_per_user`, on `sessions(user_id)`.
   - **Predicate (`WHERE`, mapped with `HasFilter`):** `is_impersonation AND impersonation_expires_at > now()` — written in the migration as `"is_impersonation = true AND impersonation_expires_at > now()"`. The temporal clause is NOT optional: a bare `WHERE is_impersonation` lets one expired-but-not-yet-swept row poison the constraint and block every legitimate future impersonation of the same victim until the sweep passes.
   - **Migration:** added via `just db-add ImpersonationOneActiveImpersonationPerUser`; expand-only, reversible, must stay clean under `just ci-migration-expand-contract`. Verified in-repo pattern to copy: migration `20260822190902_SocialAccountPartialUniqueIndex` (`CreateIndex` with `unique: true, filter:`).
   - **API response when the index fires (round 4: discriminator fully specified):** the creation path catches the `DbUpdateException` raised by this index specifically and maps it to the SAME typed result as the pre-check — `ImpersonationCreateResult.AlreadyImpersonated` → handler returns **409** `TypedProblems.Conflict(..., ResponseKeys.ImpersonationAlreadyImpersonated)` with plain-words cause text ("This user already has an active impersonation session"). Never a raw 500 (transparent-failure product rule, 2026-08-22).
     **The exact discriminator (round 4):** unwrap `ex.InnerException` as `Npgsql.PostgresException` and require BOTH `SqlState == "23505"` AND `ConstraintName == "ux_sessions_one_active_impersonation_per_user"` — the constraint name is the ONLY discriminator; never `ex.Message.Contains(...)`. This is not an invented pattern: it copies the repo's own verified helper `BulkSeeder.IsExpectedNaturalKeyViolation` (`apps/api/Lib/Seeding/BulkSeeder.cs`: `ex.InnerException is Npgsql.PostgresException { SqlState: "23505" } pgEx && pgEx.ConstraintName is not null && expectedConstraintNames.Contains(pgEx.ConstraintName)`), whose doc comment already states that a 23505 on any OTHER constraint must not be treated as "this natural key already exists".
     **Fallback when the discriminator does not match:** any other failure on the same insert path (different SqlState, different ConstraintName, or a non-Postgres exception) is re-thrown untouched — it surfaces as whatever it is, never mis-mapped to 409. No bulk-insert path writes impersonation sessions today, so no second wrapping shape exists to handle; if one appears it must extend this same helper rather than catch broadly.
     **Paired tests named now (an unspecified discriminator is an untestable claim):**
     - `ItShouldMapUniqueViolationOnTheIndexToAlreadyImpersonated` — race simulation: insert a competing active impersonation row directly via the fixture DbContext, then call the creation path → `ImpersonationCreateResult.AlreadyImpersonated`; HTTP twin → 409 with the plain-words cause.
     - Discriminator mutation (paired kill): rename the index in a scratch migration → the mapping spec goes RED while everything else stays green — proving the code keys on the constraint NAME, not on the exception message.
     - `ItShouldNotMapUnrelatedConstraintFailureToAlreadyImpersonated` — force a synthetic FK violation on the same insert path (nonexistent user id, the same invalid-FK trick `ItShouldRollbackSessionAndAuditWhenAuditInsertFails` uses) → assert the outcome is NOT `AlreadyImpersonated` (the exception propagates) — an unrelated constraint failure can never masquerade as 409.
   If anything else proves necessary, stop and re-plan — inventing a table would fork the auth model.
2. **Hard delete on revoke, matching session-lifecycle house style.** `CleanupExpiredSessionsHandler` hard-deletes expired `sessions` rows; there is no `IsDeleted` soft-delete flag on `Session : INoTenantEntity`. Revoking an impersonation session therefore means removing its row.
3. **Audit atomicity.** The `impersonation.ended` audit row and the session deletion commit together or not at all — same contract the existing green spec `ItShouldRollbackSessionAndAuditWhenAuditInsertFails` already proves for creation. The end path must be held to the identical standard: if the audit insert fails, the session row survives.
4. **Transparent failure causes** (owner product rule): every failure this surface returns names what went wrong in plain words with a stable translation key — `impersonation-not-found`, `impersonation-already-ended`, `impersonation-staff-user-required`, `impersonation-user-not-in-tenant`, `impersonation-already-impersonated`. Never a bare 404 without cause text, never a generic 500.
5. **Permissions are split per verb, no god-mode:** `staff_impersonations.start` and `staff_impersonations.end` are two independent grants. Cross-checked against `SystemNoticePermissionsForStaff` (five single-verb properties) and `JobsPermissionsForStaff` (the K-1 comment documents the same convention). Admin bypass note: `PermissionFilter.InvokeAsync` lets `AccountLevel.Admin` through every permission check, so the 403 specs must use non-admin staff users seeded via `StaffUserTestHelper.SeedStaffUserAsync(AccountLevel.User)` plus a staff profile carrying exactly the tested permission keys (pattern proven in `FindTenantsAsStaff.Spec.cs`, helpers `CreateStaffProfileAsync` + `UpdateStaffUserProfilesAsync`).
6. **Rate limiting:** both routes sit behind `ApiRateLimitPolicies.AuthenticatedDefault`. Impersonation start creates a live credential and must not be quieter than ordinary authenticated mutations; no new policy is added (no env vars, no settings-constructor ripple).
7. **Wire conventions:** camelCase JSON fields; errors are RFC 7807 via `TypedProblems.*` with stable `translationKey`s; handler wire types (`Body`/`Response`) are top-level siblings in the handler file with no `Dto` suffix; `Guid.TryParse` for route ids (malformed → 400 `MalformedId`, per `DeleteSystemNoticeSpec.ItShouldReturnBadRequestForMalformedId`); no route constraints.
8. **C# standards:** no null-forgiving operator, no `?? throw`, pattern-matching null checks, braces everywhere, max 100-char lines, handler orchestration only (no DbContext in handlers), services depend only on DbContext (+ infrastructure). The existing `ImpersonationService` uses `[Service(ServiceLifetime.Scoped)]` DI and stays the single owner of impersonation writes.
9. **Staff-method naming:** the service methods this plan adds are consumed only by staff handlers and carry the `ForStaffAsync` suffix (PUBLY0007 convention for staff-called variants).
10. **i18n parity:** new response-message keys land in both `packages/shared-ts/src/lib/i18n/json/response-message.en.json` and `.fr.json`; regenerate constants with `just generate-response-keys`.
11. **Client regeneration gate:** after endpoint changes, `just build-api && just generate-client && pnpm --filter front typecheck` must pass and the regenerated `packages/client-ts/` is committed. A second consecutive `just generate-client` run must produce a zero git diff.
12. **No disable/suppression comments, no `!` in production C#, no test skips or retries, boring readable code.**

## Security core guarantees (blocker-level; normative for every task below)

1. **Who may impersonate:** a staff-scope caller holding `staff_impersonations.start` (admins bypass via `PermissionFilter`, by design). A tenant-scope caller can never reach these routes: `/staff/*` groups sit behind `StaffAuthFilter`, which answers any non-staff identity with 403 `ResponseKeys.NotAStaffUser` — proven by `ItShouldPinStaffAuthFilterBoundaryForNonStaffCallers` (renamed in round 3; the former working name `ItShouldReturnForbiddenWhenCallerIsNotAStaffAccount` no longer exists anywhere in the plan).
2. **What an impersonated session can NOT do (deny-list):**
   - **Change credentials** — password mutation flows (`ResetPassword`, `RequestPasswordReset`) require out-of-band email control of the victim's inbox; this plan adds no authenticated credential-mutation endpoint, and if one ever exists it MUST be denied to impersonated principals (guard note recorded in the phase-2 issue #1497).
   - **Delete (or mutate tenancy state of) the tenant** — `DeleteTenantAsStaff` and bulk variants are `/staff/*` routes behind permission filters; an impersonated session resolves NO staff `UserAccount` (`StaffAuthFilter` looks up accounts by `authContext.UserId`, which is the VICTIM's id, a tenant-scope user), so every `/staff/*` route returns 403 for it. Proven by `ItShouldReturnForbiddenForImpersonatedSessionOnStaffRoutes` (Task 5).
   - **Re-impersonate** — starting or ending an impersonation requires `staff_impersonations.*` grants resolved from a staff account; an impersonated principal has none. Additionally the service-level nesting guard rejects ANY second active impersonation for the same victim regardless of caller (spec `ItShouldRejectNestedImpersonationAtServiceBoundary`).
3. **Hard time limit, applied at presentation time (round-3 rewrite of a false round-2 claim):** `DurationMinutes` is capped by `StartImpersonationForStaffBodyValidator` (max 480); `CreateImpersonationSessionAsync` clamps to that ceiling server-side. Round 2 claimed "three-layer enforcement"; that claim was half-fiction when verified at the round-3 tip (`26dcc27698`) and re-verified unchanged at round 4 (`198a6e4b70`): `ValidateImpersonationSessionAsync` (`apps/api/Modules/Impersonations/Services/ImpersonationService.cs:118`) has **zero callers** today (`git grep -n ValidateImpersonationSessionAsync apps/api` matches only its interface declaration at line 23 and its implementation at line 118), and `Session.IsImpersonationValid()` (`apps/api/Modules/Auth/Entities/Session.cs:59`) is read only inside that dead method. The only live layer was the `CleanupExpiredSessionsHandler` sweep — a cadence job that by construction cannot reject an expired token PRESENTED before its next pass, so an expired-but-not-yet-swept impersonation session kept authenticating as the victim. The enforced contract is:
   - **(a) Presentation time — `SessionAuthFilter.InvokeAsync` is the named enforcement point.** After `sessionData` resolves non-null and BEFORE populating any context (`authContext.SessionToken = sessionToken; authContext.UserId = sessionData.User.Id;`), the filter rejects a dead impersonation session:

```csharp
if (sessionData.Session.IsImpersonation && !sessionData.Session.IsImpersonationValid()) {
	// Expired impersonation presented before the sweep reached it. Hard-delete
	// the dead row now (same ExecuteDeleteAsync motif SessionService
	// .GetSessionByToken already applies to expired ORDINARY sessions) and reject.
	return TypedProblems.Unauthorized("Session token is invalid or expired", ResponseKeys.Unauthorized);
}
```

     Response: **401 with the same generic body and key as every other invalid session** (`ResponseKeys.Unauthorized`) — never a message that discloses impersonation state to whoever holds the cookie. This call site is what puts the expiry predicate in front of every presented impersonation token. The accompanying row deletion goes through the injected `ISessionService`/scoped DbContext the filter already resolves from `httpContext.RequestServices`, mirroring `GetSessionByToken`'s own expiry handling so the sweep never processes the row twice.
     **Public-surface retirement (round 4).** Today `IImpersonationService.ValidateImpersonationSessionAsync(token, ct)` is a PUBLIC yes/no path with zero callers (interface declaration + implementation only; `git grep -n ValidateImpersonationSessionAsync apps/api` matches exactly those two lines at develop) — it checks validity without deleting the row, without the §3b staff-liveness/grant checks, and without the 401 contract. Left in place, it invites a future lane to call it directly and believe impersonation is enforced — the round-2 dead-code hazard in a new shape. This plan RETIRES it: the implementation deletes BOTH the interface method and its implementation, keeps `Session.IsImpersonationValid()` as the single predicate source, and inlines the filter-side checks shown above. No `[Obsolete]` transitional state — the repo uses `[Obsolete]` nowhere (`git grep -c "\[Obsolete" origin/develop -- apps/api` → 0 results), so removal, not deprecation-widening, is the house-compatible move.
   - **(b) Mid-window staff suspension or grant loss — enforced at the same choke point.** Today the only "is this staff still staff" control lives in `StaffAuthFilter`, which tenant routes bypass, so a suspended staff member's combined cookie kept acting as the victim for up to 480 minutes. Therefore, whenever the presenting session is an impersonation session, `SessionAuthFilter.InvokeAsync` additionally checks, BEFORE populating any context: (i) STAFF LIVENESS — the user behind `sessionData.Session.ImpersonatingStaffUserId` is not deleted / suspended / unverified (the same predicate `GetSessionByToken` already applies to the victim; one extra indexed `users` primary-key lookup); (ii) GRANT LIVENESS — `staff_impersonations.start` still resolves for that staff id through `IPermissionService.GetPermissionsAsync` (the same per-request resolution `PermissionFilter` performs for staff routes). Failure of either check hard-deletes the impersonation row (same `ExecuteDeleteAsync` motif as §3a) and returns the same generic 401. Contract: suspension or grant revocation takes effect at the NEXT request, never later; no zombie window.
     **Cost, quantified (round 4):** the grant re-check is a REAL query — `PermissionService.GetPermissionsAsync` joins `profile_permissions × user_account_profiles × user_accounts` on every call, and no permission cache exists in this repo today (the service holds only `AppDbContext`; verified at develop). Phase-1 decision recorded here: the re-check is ACCEPTED per impersonated request and any cache is ASPIRATIONAL — impersonated requests are rare, manually started, high-privilege events, so one extra join-query per presented impersonation token is a deliberate price for closing the zombie window; if volume ever justifies caching, that is a follow-up carrying its own invalidate-on-revoke requirement, never an implicit optimization.
     **Machine-checked (round 4), closing the round-3 prose-only gap.** Two unit specs in `apps/api/Lib/Filters/SessionAuthFilter.Spec.cs`, each with its own named kill:
     - `ItShouldReturnUnauthorizedWhenImpersonatingStaffIsSuspended` — seed an active impersonation session whose `ImpersonatingStaffUserId` names a staff user that gets suspended after start; present the token; expect 401 `ResponseKeys.Unauthorized` AND the impersonation row deleted. Kill = **Mutation M7**: delete the §3b staff-liveness branch → this spec RED, everything else green.
     - `ItShouldReturnUnauthorizedWhenStaffLostStartGrant` — same shape with a staff user whose profile no longer carries `staff_impersonations.start`; expect identical 401 + row deletion. Kill = **Mutation M8**: delete the grant re-check branch → this spec RED, everything else green.
     Honest scope note: mutations M1–M6 sit upstream or downstream of these branches (M3 only reverts the CONTEXT-population lines), so a lane that populates `authContext.IsImpersonation` correctly but never reads `sessionData.Session.ImpersonatingStaffUserId` for validation passes M1–M6 green — M7 and M8 exist precisely to close that hole.
   - **(c) Sweep — demoted to janitor.** `CleanupExpiredSessionsHandler` keeps cleaning up rows nobody presents again. It is a hygiene layer, NEVER relied on for enforcement.

   Expiry is thus enforced where tokens are accepted, not by a column default and not by a cadence job.
4. **Explicit exit mechanism:** `POST /staff/impersonations/{id}/end` revokes the row transactionally with the ended-audit (Task 4). Exit does not depend on expiry.
5. **Visible-banner backend contract:** `GetScopeAuthData` (tenant scope) gains `IsImpersonated` + `ImpersonationExpiresAt` on `GetScopeAuthDataTenant`, serialized camelCase (`is_impersonated`, `impersonation_expires_at`) and regenerated into the Kiota client. The banner UI itself is #1497's job; the backend signal ships here and is proven by `ItShouldExposeIsImpersonatedToTenantScopeClients` (Task 5). **Probe transport (round 4, fixing an underspecified spec):** the combined cookie `s:<staffToken>+t:<tenantToken>` is a FRONT construct (`packages/shared-ts/src/lib/session/parse.ts`); the API reads ONE token from `X-Session-Token`. The spec therefore does NOT present a combined cookie: it seeds the impersonation sessions row via the service helper and presents ONLY the impersonation (`t:`) token in `X-Session-Token`, which authenticates as the impersonation session — exactly the server-side state the banner must reflect. The ordinary-session leg presents a plain login token. Which cookie half the real browser sends on tenant calls is a phase-2 (#1497) decision and is answered there.
6. **Audit trail:** `impersonation.started` AND `impersonation.ended` rows record actor + target + reason (+ duration at start); downstream audits during an impersonated request record the real staff actor per the identity-attribution rule.

## File Structure

**Modify**

- `apps/api/Modules/Impersonations/Services/ImpersonationService.cs` — add `EndImpersonationSessionForStaffAsync(EndImpersonationSessionArgs, CancellationToken)` returning a discriminated result (`Ended` | `NotFound` | `AlreadyEnded`); add `EndImpersonationSessionArgs(Guid SessionId, Guid EndedByStaffUserId)` record. Extend the creation path with the explicit-target overload carrying the staff-target and nesting guards (Task 3). Keep `CreateImpersonationSessionAsync`'s existing throw-based contract for `TargetUserId == null`.
- `apps/api/Lib/RequestAuthContext.cs` — add `bool IsImpersonation { get; set; }` and `Guid? ImpersonatingStaffUserId { get; set; }` to `IRequestAuthContext` + `RequestAuthContext` (identity-attribution seam).
- `apps/api/Lib/Filters/SessionAuthFilter.cs` — populate the two new context fields from `sessionData.Session` immediately after `authContext.UserId = sessionData.User.Id;`; AND reject at presentation time any impersonation session that is expired, or whose staff actor is suspended/deleted/unverified, or whose staff lost `staff_impersonations.start` (401 + row deletion — Security core guarantees §3a/§3b).
- `apps/api/Modules/Auth/Handlers/GetScopeAuthData.cs` — add `IsImpersonated` / `ImpersonationExpiresAt` to `GetScopeAuthDataTenant` (banner signal contract).
- `apps/api/Lib/AppPermissions.cs` — add `public ImpersonationsPermissionsForStaff Impersonations { get; } = new();` to `StaffScopePermissions`.
- `packages/shared-ts/src/lib/i18n/json/response-message.en.json` + `.fr.json` — add the seven failure/success keys listed in Task 4.
- `apps/api/Program.cs` — one line: `staffGroup.MapImpersonationEndpointsForStaff();` next to the other staff mappings.

**Create**

- `apps/api/Modules/Impersonations/Permissions/ImpersonationsPermissionsForStaff.cs`
- `apps/api/Modules/Impersonations/Routes.Impersonations.cs` (partial `Routes` class)
- `apps/api/Modules/Impersonations/Endpoints/ImpersonationEndpointsForStaff.cs`
- `apps/api/Modules/Impersonations/Handlers/Staff/StartImpersonationForStaff.cs`
- `apps/api/Modules/Impersonations/Handlers/Staff/StartImpersonation.Spec.cs`
- `apps/api/Modules/Impersonations/Handlers/Staff/EndImpersonationForStaff.cs`
- `apps/api/Modules/Impersonations/Handlers/Staff/EndImpersonation.Spec.cs`
- one EF migration adding the partial unique index of Global Constraint 1 (`just db-add ImpersonationOneActiveImpersonationPerUser`)
- `apps/api/Lib/Filters/SessionAuthFilter.Spec.cs` (attribution population unit specs)
- `packages/lint-cs/ImpersonationVictimAsAuditActorAnalyzer.cs` (+ `.Spec.cs`) — the machine-checked attribution guard, Task 5 Step 0c
- `apps/api/Lib/Architecture/AuditAttributionGuard.Spec.cs` — reflection guard over all `CreateAuditLogArgs` constructors in auth-aware types, Task 5 Step 0c

---

## Task 1: Permission slice `ImpersonationsPermissionsForStaff`

**Files:** Create `apps/api/Modules/Impersonations/Permissions/ImpersonationsPermissionsForStaff.cs`; modify `apps/api/Lib/AppPermissions.cs`.

- [ ] **Step 1: RED — failing permission-seeding assertion.** Create `apps/api/Modules/Impersonations/Permissions/ImpersonationsPermissionsForStaff.Spec.cs`:

```csharp
using FluentAssertions;

using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Impersonations.Permissions;

using Xunit;

namespace PublyApp.Api.Modules.Impersonations.Permissions;

public sealed class ImpersonationsPermissionsForStaffSpec {
	[Fact]
	public void ItShouldExposeStartAndEndPermissionKeys() {
		var slice = new ImpersonationsPermissionsForStaff();
		slice.KeyPrefix.Should().Be("staff_impersonations");
		slice.START.Key.Should().Be("staff_impersonations.start");
		slice.END.Key.Should().Be("staff_impersonations.end");
	}

	[Fact]
	public void ItShouldRegisterTheSliceInStaffScope() {
		var scope = new StaffScopePermissions();
		scope.Impersonations.Should().NotBeNull();
		scope.Impersonations.START.Key.Should().Be("staff_impersonations.start");
	}
}
```

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~ImpersonationsPermissions"` → RED (compile error: the type does not exist).

- [ ] **Step 2: GREEN — implement the slice.** Mirror `SystemNoticePermissionsForStaff.cs` exactly (class shape, `ISlicePermissions`, EN+FR translations):

```csharp
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Impersonations.Permissions;

public class ImpersonationsPermissionsForStaff : ISlicePermissions {
	public string KeyPrefix { get; } = "staff_impersonations";

	public Permission START { get; }
	public Permission END { get; }

	public ImpersonationsPermissionsForStaff() {
		START = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "start" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Start impersonation", Description = "Start impersonating a tenant user as a staff member" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Démarrer une usurpation d'identité", Description = "Usurper l'identité d'un utilisateur locataire en tant que membre du personnel" });

		END = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "end" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "End impersonation", Description = "Revoke a running impersonation session" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Terminer une usurpation d'identité", Description = "Révoquer une session d'usurpation d'identité en cours" });
	}
}
```

Add to `StaffScopePermissions` in `apps/api/Lib/AppPermissions.cs`:

```csharp
public ImpersonationsPermissionsForStaff Impersonations { get; } = new();
```

Because `PermissionSeeder` reflects over `IScopePermissions` → `ISlicePermissions` properties, the two keys seed automatically once the slice property exists.

- [ ] **Step 3: GREEN check.** Same filter → green. Also run `--filter "FullyQualifiedName~PermissionSeeder"` to confirm seeding discovery still passes.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/Modules/Impersonations apps/api/Lib/AppPermissions.cs
git commit -m "feat(impersonations): staff impersonation permission slice (#160)"
```

## Task 2: Route constants + endpoint group skeleton

**Files:** Create `apps/api/Modules/Impersonations/Routes.Impersonations.cs`, `apps/api/Modules/Impersonations/Endpoints/ImpersonationEndpointsForStaff.cs`; modify `apps/api/Program.cs`.

- [ ] **Step 1: Routes partial class**, mirroring `Routes.SystemNotices.ForStaff` shape:

```csharp
#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	public static class Impersonations {
		public static class ForStaff {
			public const string Root = "/impersonations";
			public const string Start = "/";
			public const string End = "/{sessionId}/end";

			public static string EndFn(string sessionId) {
				return $"/{sessionId}/end";
			}
		}
	}
}
```

(The `IDE0130` pragma pair copies `Routes.SystemNotices.cs` verbatim — this is the established exception pattern for the shared `Routes` partial, not a new suppression.)

- [ ] **Step 2: Endpoint group** mirroring `SystemNoticeEndpointsForStaff`:

```csharp
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Impersonations.Handlers.Staff;

namespace PublyApp.Api.Modules.Impersonations.Endpoints;

public static class ImpersonationEndpointsForStaff {
	public static IEndpointRouteBuilder MapImpersonationEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Impersonations.ForStaff.Root)
			.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
			.WithTags("Staff Impersonations");

		group.MapPost(
				Routes.Impersonations.ForStaff.Start,
				StartImpersonationForStaff.Handle
			)
			.WithName("StartImpersonationForStaff")
			.WithSummary("Start impersonating a tenant user")
			.WithReqBodyValidation<StartImpersonationForStaffBody>()
			.WithPermission([AppPermissions.Staff.Impersonations.START]);

		group.MapPost(
				Routes.Impersonations.ForStaff.End,
				EndImpersonationForStaff.Handle
			)
			.WithName("EndImpersonationForStaff")
			.WithSummary("Revoke a running impersonation session")
			.WithPermission([AppPermissions.Staff.Impersonations.END]);

		return routes;
	}
}
```

- [ ] **Step 3: Mount it.** In `apps/api/Program.cs`, next to `staffGroup.MapJobDeadLetterEndpointsForStaff();` add `staffGroup.MapImpersonationEndpointsForStaff();`.

- [ ] **Step 4: RED proof at the HTTP boundary.** This task's compile-green state is itself the first observable milestone; the endpoint specs in Tasks 3–4 are the paired RED evidence (they fail before their handlers exist). Run the architecture guards to catch metadata problems early:

```bash
cd apps/api && dotnet build && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test \
  --filter "FullyQualifiedName~EndpointPermissionMetadataGuard|FullyQualifiedName~RouteConstraintGuard"
```

Expected: green (handlers referenced above must exist by now — implement Tasks 3–4 handlers first if you land this file standalone, or land Tasks 2–4 in one commit sequence where the build stays compilable).

- [ ] **Step 5: Commit** (together with Task 3/4 handlers so the tree always builds):

```bash
git add apps/api/Modules/Impersonations apps/api/Program.cs
git commit -m "feat(impersonations): /staff/impersonations endpoint group (#160)"
```

## Task 3: Start endpoint `POST /staff/impersonations`

**Files:** Create `apps/api/Modules/Impersonations/Handlers/Staff/StartImpersonationForStaff.cs` + `StartImpersonation.Spec.cs`.

Design decisions (with alternatives):

- **Who gets impersonated?** The request names the target user explicitly (`targetUserId`), not just the tenant. Alternative rejected: deriving the target from the tenant's highest-level account like `CreateImpersonationSessionAsync` does today — that silently impersonates whichever account sorts first, which is wrong for support flows aimed at a specific user and makes audits ambiguous about who was actually impersonated. The service gains an explicit-target overload; the legacy highest-level default remains for compatibility but the endpoint always passes an explicit target. The endpoint validates the target belongs to the named tenant and is an active tenant-scope account (service-level guard, mirrors the suspended-account exclusion already in the service).
- **Who can never be a target (service-boundary guards):** the explicit-target path resolves the target's `UserAccount` and rejects any `AccountScope.Staff` match with `ImpersonationResult.StaffUserRequired` (mapped by the handler to 403 `impersonation-staff-user-required`); combined with the tenant-scope predicate this makes a staff-scope target unstartable even for admins. Nesting is impossible: if the target user already holds an active impersonation session (`IsImpersonation && ImpersonationExpiresAt > UtcNow` on any row for that `UserId`), the service returns `ImpersonationCreateResult.AlreadyImpersonated` → handler maps to **409** `TypedProblems.Conflict(..., ResponseKeys.ImpersonationAlreadyImpersonated)`; if the pre-check misses a race, the partial unique index fires (Global Constraint 1) and the SAME typed result and 409 come back out of the caught `DbUpdateException` — the race loser gets the identical plain-words cause, never a 500. Both guards are proven by named specs in Step 1 that exercise the SERVICE path directly (see the rewritten spec bodies: they construct callers/targets that reach the guards, not callers that die in upstream filters).
- **Why 201 Created:** house rule — create success → 201 `Created<T>` with entity DTO (AGENTS.md response-format rule), matching `CreateSystemNotice`.
- **Token exposure:** the response carries the raw impersonation token once, over the authenticated staff channel — the same trust level as `auth/login`'s response. It is needed once to compose the combined cookie; there is no other read path for it.

- [ ] **Step 1: RED — endpoint spec.** Create the spec file with these cases (full code shape below; reuse `SeedTenantUserAsync`-style helpers from the existing `ImpersonationService.Spec.cs`):

```csharp
[Fact]
public async Task ItShouldReturnCreatedWithImpersonationTokenAndId() {
	// staff admin login; seed tenant + active tenant-scope user;
	// POST { targetUserId, reason: "support ticket 42" }
	// expect 201; body.impersonationToken non-empty;
	// body.sessionExpiresAt > now; then verify DB:
	//   sessions row with IsImpersonation == true,
	//   ImpersonatingStaffUserId == staff admin's userId,
	//   ImpersonationReason == "support ticket 42";
	// and verify AuditLog row: Action == "impersonation.started",
	//   UserId == staff admin, TargetId == tenantId.
}

[Fact]
public async Task ItShouldReturnNotFoundWhenTargetUserIsNotInTenant() {
	// POST with a targetUser that has no UserAccount row for tenantId
	// → 404 AppProblemDetails, TranslationKey == "impersonation-user-not-in-tenant".
}

[Fact]
public async Task ItShouldReturnForbiddenForNonAdminWithoutStartGrant() {
	// SeedStaffUserAsync(email, AccountLevel.User); create staff profile with
	// permissions: [] ; assign to user; login as that user; POST → 403.
}

[Fact]
public async Task ItShouldAllowStaffWithExplicitStartGrant() {
	// Same non-admin staff, profile permissions: ["staff_impersonations.start"]
	// → 201.
}

[Fact]
public async Task ItShouldPinStaffAuthFilterBoundaryForNonStaffCallers() {
	// Scope note (round 3): this spec pins the FILTER boundary, not the service guard.
	// Seed an active TENANT-scope user (no UserAccount row with Scope == Staff);
	// login; POST /staff/impersonations → 403 ResponseKeys.NotAStaffUser,
	// independent of permission grants. Its paired kill is mutation M5
	// (remove WithPermission from the route), NOT a service-guard deletion:
	// deleting the service guards leaves this spec green BY DESIGN, because
	// StaffAuthFilter answers first. The service-path guards have their own
	// direct-service specs below.
}

[Fact]
public async Task ItShouldRejectNestedImpersonationAtServiceBoundary() {
	// ROUND-3 REWRITE — must reach the service guard, not die upstream.
	// DIRECT-SERVICE leg (primary evidence): build the service from the fixture
	// scope (pattern of ImpersonationService.Spec.ItShouldRollbackSessionAnd-
	// AuditWhenAuditInsertFails) and call CreateImpersonationSessionAsync twice
	// with explicit TargetUserId = V while S1 is active → second call returns
	// ImpersonationCreateResult.AlreadyImpersonated; assert NO second row
	// (exactly ONE active impersonation row for V) and no second started-audit.
	// No HTTP, no login, no permission filters involved: the assertion fails if
	// the nesting pre-check OR the unique-index backstop is removed (either one
	// lets the second row exist).
	// HTTP twin (secondary): caller holding staff_impersonations.start POSTs
	// again → 409 TranslationKey == "impersonation-already-impersonated"
	// (proves the handler mapping, not the guard).
}

[Fact]
public async Task ItShouldReturnForbiddenWhenTargetUserIsStaffScope() {
	// ROUND-3 REWRITE — the round-2 wording was wrong: "independent of grants"
	// is false, because without staff_impersonations.start the request dies at
	// the permission filter long before the service guard. Construct a caller
	// that DOES hold the grant: SeedStaffUserAsync(email, AccountLevel.User)
	// plus a staff profile carrying exactly ["staff_impersonations.start"]
	// (pattern: FindTenantsAsStaff.Spec.cs helpers), then POST {
	// tenantId: <target's staff tenant>, targetUserId: <staff-scope user> }
	// → 403 TranslationKey == "impersonation-staff-user-required"; no sessions
	// row, no audit row. Kill test: remove ONLY the
	// `if (accountStaff.Scope == AccountScope.Staff) return StaffUserRequired;`
	// guard from the explicit-target service path → THIS spec goes RED while
	// every other spec stays green (that asymmetry is the point).
}

[Fact]
public async Task ItShouldAssertTheNamedUniqueIndexExistsInDatabase() {
	// ROUND-4 addition (closes the SECOND leg of the round-2 trap): a lane can add
	// the application pre-check and skip the migration, or vice versa; the
	// behavioural nesting spec catches some of those combinations only via the
	// race leg, which is timing-dependent. This spec introspects the DATABASE and
	// fails when the BACKSTOP is missing or renamed:
	//   SELECT indexname FROM pg_indexes
	//    WHERE tablename = 'sessions'
	//      AND indexname = 'ux_sessions_one_active_impersonation_per_user';
	// Assert: exactly one row. Paired tripwires: the migration
	// ImpersonationOneActiveImpersonationPerUser ↔ this spec (missing/dropped/
	// renamed index → RED) AND the expand/contract gate
	// `just ci-migration-expand-contract` ↔ the migration itself (Task 6 Step 1b).
	// Together: a missing migration is a PAIRED-RED, never a silent green.
}

[Fact]
public async Task ItShouldReturnForbiddenWhenTargetUserIsStaffScopeOverHttp() {
	// HTTP twin of the direct-service staff-target spec: same granted caller
	// shape (["staff_impersonations.start"] profile, AccountLevel.User),
	// staff-scope target → 403 "impersonation-staff-user-required" over the wire.
}

[Fact]
public async Task ItShouldRecordTargetUserIdInStartAuditDetails() {
	// Closes the round-2 F2 hole (a mutation dropping TargetUserId from the
	// start-audit details was caught by NOTHING): create an impersonation via
	// the explicit-target path, open audit_logs, assert the started row carries
	// Details.TargetUserId == <seeded victim user id> AND UserId == <acting
	// staff id> AND TargetId == tenantId. Paired kill: Mutation M6.
}
```

Run → RED (route/handler do not exist → 404 on the POST).

- [ ] **Step 2: GREEN — handler + service change.** Extend `IImpersonationService` with an explicit-target creation path (keep the existing method signature working for its current callers):

```csharp
public record CreateImpersonationSessionArgs(
	Guid TenantId,
	Guid StaffUserId,
	string Reason,
	int DurationMinutes = 60,
	Guid? TargetUserId = null
);
```

In the implementation, when `TargetUserId` has a value:

1. Resolve that specific active tenant-scope `UserAccount` instead of the order-by-level default (same predicate otherwise: `Scope == AccountScope.Tenant && Status != AccountStatus.Suspended`, additionally `UserId == TargetUserId`).
2. **Staff-target guard:** if instead a `UserAccount` with `Scope == AccountScope.Staff` exists for `TargetUserId`, return `ImpersonationCreateResult.StaffUserRequired` — never create a session whose victim is a staff account.
3. **Nesting guard:** before inserting, query for any existing `sessions` row with `UserId == resolved.UserId && IsImpersonation && ImpersonationExpiresAt > DateTime.UtcNow`; if one exists return `ImpersonationCreateResult.AlreadyImpersonated`. The partial unique index from Global Constraint 1 turns any race that slips past the check into a DB error instead of a double impersonation.
4. When no account matches at all return `null` from the resolution step and let the method return a typed `ImpersonationResult.NotFound` instead of throwing `InvalidOperationException` — the handler maps that to 404 with `impersonation-user-not-in-tenant`.

The explicit-target path returns results because "user not in tenant" / "target is staff" / "already being impersonated" are expected client errors, not programming errors; the throw-based contract of the existing method is preserved for `TargetUserId == null`.

Handler body type and validator:

```csharp
public record StartImpersonationForStaffBody {
	public required JsonElement TenantId { get; init; }
	public required JsonElement TargetUserId { get; init; }
	public JsonElement? Reason { get; init; }
	public JsonElement? DurationMinutes { get; init; }

	public Guid GetTenantId() { return TenantId.GetValueAsGuid(); }
	public Guid GetTargetUserId() { return TargetUserId.GetValueAsGuid(); }
	public string GetReason() { ... }
	public int GetDurationMinutes() { ... }
}

public class StartImpersonationForStaffBodyValidator
	: AbstractValidator<StartImpersonationForStaffBody> {
	public StartImpersonationForStaffBodyValidator() {
		RuleFor(x => x.TenantId)... // required-guid JsonElementRules.* extension
		RuleFor(x => x.TargetUserId)... // required-guid JsonElementRules.* extension
		RuleFor(x => x.Reason).MustBeNullableStringWithLength("Reason", 1, 500);
		RuleFor(x => x.DurationMinutes) // nullable-int rule, inclusive range 1..480
			// — HARD time-limit ceiling, see Security core guarantees §3.
	}
}
```

(Final rule names come from `JsonElementRules.*` extension methods — read `apps/api/Lib/Validation/` and mirror `CreateSystemNoticeBodyValidator` usage; never inline validation chains, PUBLY0005.)

Response DTO:

```csharp
public record StartImpersonationForStaffResponse {
	public required Guid SessionId { get; init; }
	public required Guid UserId { get; init; }
	public required string ImpersonationToken { get; init; }
	public required DateTime SessionExpiresAt { get; init; }
	public required DateTime ImpersonationExpiresAt { get; init; }
}
```

Handler flow: cache `body.GetTenantId()` / `GetTargetUserId()` locals (PUBLY0006), null-guard `authContext.AccountStaff` (throw InvalidOperationException exactly like `DeleteSystemNotice`), call the service, map typed results: `Created` → 201; `NotFound` → 404 `TypedProblems.NotFound(..., ResponseKeys.ImpersonationUserNotInTenant)`; `StaffUserRequired` → 403 `TypedProblems.Forbidden(..., ResponseKeys.ImpersonationStaffUserRequired)`; `AlreadyImpersonated` → 409 `TypedProblems.Conflict(..., ResponseKeys.ImpersonationAlreadyImpersonated)`. No separate audit call in the handler: unlike `DeleteSystemNotice` (whose service owns no audit), the impersonation service already writes its own audit rows transactionally — duplicating the write in the handler would double-log. The START audit records the exact impersonated user (follow-up F2 below).

- [ ] **Step 3: GREEN check.** Spec filter green; full-module filter green.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/Modules/Impersonations
git commit -m "feat(impersonations): POST /staff/impersonations start endpoint (#160)"
```

## Task 4: End endpoint + `EndImpersonationSessionForStaffAsync` + i18n keys

**Files:** Modify `apps/api/Modules/Impersonations/Services/ImpersonationService.cs`; create `apps/api/Modules/Impersonations/Handlers/Staff/EndImpersonationForStaff.cs` + `EndImpersonation.Spec.cs`; modify both response-message JSON files; run `just generate-response-keys`.

Design decisions (with alternatives):

- **Discriminated result, not exceptions:** `EndImpersonationSessionForStaffAsync` returns `ImpersonationEndResult` = `Ended` | `NotFound` | `AlreadyEnded`. Alternatives rejected: bool + out-param (cannot distinguish "never existed" from "already revoked", and the transparent-failure rule needs distinct causes); exceptions (expected client outcomes are not exceptional).
- **AlreadyEnded detection:** the impersonation session row is identified by id + `IsImpersonation == true`. "Already ended" is indistinguishable from "never existed" after a hard delete, so the service distinguishes them only while the row lives: `NotFound` when no row with that id exists at all, `AlreadyEnded` when the row existed but its `ImpersonationExpiresAt <= UtcNow` (an expired-but-not-yet-swept row is materially "already over"). Known limitation, stated openly: once `CleanupExpiredSessionsHandler` has swept the row, an any-time later call returns `NotFound`, not `AlreadyEnded` — the two states collapse post-sweep. The contract therefore promises DURABLE plain-words causes, not a durable status distinction: `impersonation-already-ended` inside the window, and `impersonation-not-found` afterwards with copy that says the session is no longer active ("not active — it may have already been revoked or expired"), so both messages carry the cause in plain words at all times. Follow-up F3 below tracks whether a tombstone/soft-state upgrade is ever warranted; it must NOT reintroduce soft-delete lifecycle on `sessions`.
- **Who may end:** any caller holding `staff_impersonations.end` — including a different staff member than the one who started (a shift handover). The audit row records `EndedByStaffUserId` in `Details` and the impersonated session's `ImpersonatingStaffUserId` remains on the deleted row's audit trail via the started audit.

- [ ] **Step 1: RED — service spec additions** (append to `ImpersonationService.Spec.cs`, reusing its existing helpers):

```csharp
[Fact]
public async Task ItShouldEndSessionEmittingImpersonationEndedAudit() {
	var (tenantId, _) = await SeedTenantUserAsync();
	var staffUserId = await SeedStaffActorAsync();
	var service = BuildService(); // local helper wrapping fixture scope
	var session = await service.CreateImpersonationSessionAsync(
		new CreateImpersonationSessionArgs(tenantId, staffUserId, "end-test"));

	var result = await service.EndImpersonationSessionForStaffAsync(
		new EndImpersonationSessionArgs(session.GetRequiredId(), staffUserId));

	result.Should().BeOfType<ImpersonationEndResult.Ended>();
	(await CountSessionsAsync(s => s.Id == session.GetRequiredId())).Should().Be(0);
	(await CountAuditsAsync(a =>
		a.Action == AuditActions.ImpersonationEnded &&
		a.UserId == staffUserId &&
		a.TargetId == session.GetRequiredId())).Should().Be(1);
}

[Fact]
public async Task ItShouldRollBackEndWhenAuditInsertFails() {
	// Arrange: valid impersonation session; a service whose AuditLog insert fails
	// (reuse the invalid-FK trick from ItShouldRollbackSessionAndAuditWhenAuditInsertFails
	// — e.g. pass a nonexistent EndedByStaffUserId if AuditLog.UserId is FK-bound,
	// else inject a failing AuditLog via the same seam the create-spec uses).
	// Act: EndImpersonationSessionForStaffAsync → DbUpdateException.
	// Assert: the sessions row STILL EXISTS (rollback), no impersonation.ended audit.
}

[Fact]
public async Task ItShouldReportAlreadyEndedForAnExpiredImpersonationRow() {
	// Create session; UPDATE sessions SET impersonation_expires_at = now() - interval '1 minute';
	// End → ImpersonationEndResult.AlreadyEnded; row still present (not swept);
	// no new impersonation.ended audit row.
}

[Fact]
public async Task ItShouldReturnNotFoundForUnknownSessionId() { ... }
```

- [ ] **Step 2: GREEN — service implementation sketch (end path).**

```csharp
public abstract record ImpersonationEndResult {
	public sealed record Ended : ImpersonationEndResult;
	public sealed record NotFound : ImpersonationEndResult;
	public sealed record AlreadyEnded : ImpersonationEndResult;
}

public record EndImpersonationSessionArgs(
	Guid SessionId,
	Guid EndedByStaffUserId
);

public async Task<ImpersonationEndResult> EndImpersonationSessionForStaffAsync(
	EndImpersonationSessionArgs args,
	CancellationToken cancellationToken = default
) {
	await using var tx = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

	var sessionQuery =
		from s in _dbContext.Session
		where s.Id == args.SessionId && s.IsImpersonation
		select s;

	var session = await sessionQuery.FirstOrDefaultAsync(cancellationToken);

	if (session is null) {
		return new ImpersonationEndResult.NotFound();
	}

	if (session.IsImpersonationValid()) {
		await _dbContext.Session.Remove(session);
		AddEndAuditEntry(args, session);
		await _dbContext.SaveChangesAsync(cancellationToken);
		await tx.CommitAsync(cancellationToken);
	} else {
		// Expired but not yet swept by CleanupExpiredSessionsHandler: the
		// impersonation is over; report AlreadyEnded and leave the sweep
		// to own the row's removal.
		return new ImpersonationEndResult.AlreadyEnded();
	}

	if (_logger.IsEnabled(LogLevel.Information)) {
		_logger.LogInformation(
			"Impersonation session {SessionId} ended by staff user {StaffUserId}",
			args.SessionId, args.EndedByStaffUserId);
	}

	return new ImpersonationEndResult.Ended();
}
```

`AddEndAuditEntry` mirrors `AddAuditEntry` but uses `AuditActions.ImpersonationEnded` with `details: { EndedByStaffUserId, StartedByStaffUserId = session.ImpersonatingStaffUserId, Reason = session.ImpersonationReason }` and `ipAddress`/`userAgent` from the accessor like the start path.

**Start-audit fix (follow-up F2, fixed here):** `AddAuditEntry` currently records only `targetId: tenantId`, dropping the exact impersonated user. With the explicit-target path the service KNOWS the victim (`resolved.UserId`), so the new explicit-target creation writes `details: { Reason, Duration, TargetUserId = resolved.UserId }` (and `targetId` stays the tenant for tenant-level queries). The legacy highest-level path keeps its current shape. The dedicated assertion is Task 3 Step 1's `ItShouldRecordTargetUserIdInStartAuditDetails`, and its paired kill is Mutation M6 — without that pairing a lane dropping `TargetUserId` ships green (the round-2 review's exact finding).

- [ ] **Step 3: GREEN — handler.** `EndImpersonationForStaff` maps: `Ended` → 200 `Ok<ApiResponse>` message "Impersonation ended successfully" + key; `AlreadyEnded` → 200 `Ok<ApiResponse>` with key `impersonation-already-ended` (plain words: the session had already expired); `NotFound` → 404 `TypedProblems.NotFound("No active impersonation session for this id", ResponseKeys.ImpersonationNotFound)` (plain words cover the swept-row case: the session is not active, whether revoked, expired-and-swept, or never real); malformed `{sessionId}` → 400 `ResponseKeys.MalformedId`.

- [ ] **Step 4: i18n keys.** Add to BOTH `response-message.en.json` and `response-message.fr.json`:

```json
"impersonation-started-success": "Impersonation session started",
"impersonation-user-not-in-tenant": "The target user does not belong to this workspace",
"impersonation-staff-user-required": "Staff accounts cannot be impersonated",
"impersonation-already-impersonated": "This user already has an active impersonation session",
"impersonation-not-found": "No active impersonation session for this id (it may have already been revoked or expired)",
"impersonation-already-ended": "This impersonation session had already expired",
"impersonation-ended-success": "Impersonation ended successfully"
```

FR translations mirror the same shape ("Session d'usurpation d'identité démarrée", etc.). Run `just generate-response-keys` and commit the regenerated `ResponseKeys.g.cs`.

- [ ] **Step 5: GREEN check + commit.**

```bash
just generate-response-keys
git add apps/api packages/shared-ts/src/lib/i18n/json
git commit -m "feat(impersonations): end impersonation endpoint + ended-audit (#160)"
```

## Task 5: Endpoint integration specs + adversarial mutation

**Files:** extend the two handler spec files from Tasks 3–4; create `apps/api/Lib/Filters/SessionAuthFilter.Spec.cs`; extend `apps/api/Modules/Auth/Handlers/GetScopeAuthData.Spec.cs`.

- [ ] **Step 0a (BLOCKER, round 2): identity-attribution seam.** This is the mechanism that makes an impersonated request attributable to the REAL staff actor everywhere downstream. Steps 0b–0d below make the seam ENFORCEABLE — the round-3 review established that "every audit write routes through this extension" is currently FALSE in this repo, so the seam ships together with an inventory, a machine-checked guard, and a CI gate.

  **Context fields.** Add to `IRequestAuthContext` / `RequestAuthContext`:

```csharp
// Impersonation (round-2): set by SessionAuthFilter when the presented session is an
// impersonation session. Downstream authorization and audit code reads these instead of
// assuming authContext.UserId IS the actor.
bool IsImpersonation { get; set; }
Guid? ImpersonatingStaffUserId { get; set; }
```

  **Population point.** In `SessionAuthFilter.InvokeAsync`, immediately after `authContext.UserId = sessionData.User.Id;`, add:

```csharp
authContext.IsImpersonation = sessionData.Session.IsImpersonation;
if (sessionData.Session.IsImpersonation) {
	// The real actor for every downstream audit write. Never log the token itself.
	authContext.ImpersonatingStaffUserId = sessionData.Session.ImpersonatingStaffUserId;
}
```

  `SessionData.Session` is the full entity row (`SessionService.GetSessionByToken` returns `{ Session, User }`), so both values are already resolved — no extra query.

  **Audit naming rule.** Every audit write downstream of an impersonated request records the REAL staff actor as `AuditLog.UserId` and preserves the victim as `Details.ActingAsUserId`. Concretely, audit-writing services resolve the actor through one shared seam:

```csharp
public static class AuditActorExtensions {
	public static Guid GetAuditActorUserId(this IRequestAuthContext authContext) {
		return authContext.IsImpersonation && authContext.ImpersonatingStaffUserId.HasValue
			? authContext.ImpersonatingStaffUserId.Value   // real actor
			: authContext.UserId!.Value;                   // ordinary self-acted request
	}
}
```

  (Null handled explicitly per PUBLY0001 — no null-forgiving operator in production code.) Existing services keep writing audits exactly as today for non-impersonated requests; only the actor-resolution line routes through the seam. The impersonation service's OWN start/end audits already take explicit staff ids and are unaffected.

  **Unit specs** (`apps/api/Lib/Filters/SessionAuthFilter.Spec.cs`, fixture-backed):

```csharp
[Fact]
public async Task ItShouldPopulateImpersonationContextFromSessionData() {
	// Seed victim + active impersonation session row (service helper);
	// GET any session-authenticated probe route with the impersonation token;
	// assert via a probe endpoint (or scoped IRequestAuthContext inspection):
	//   IsImpersonation == true,
	//   ImpersonatingStaffUserId == seeding staff id,
	//   UserId == VICTIM id (unchanged — tenant-scope resolution keeps working).
}

[Fact]
public async Task ItShouldLeaveContextUnmarkedForOrdinarySessions() {
	// Ordinary login session through the same filter:
	// IsImpersonation == false, ImpersonatingStaffUserId == null.
}
```

- [ ] **Step 0b (BLOCKER, round 3; command REPLACED round 4): INVENTORY of every audit-write site that can attribute an action to the victim.** The plan does not get to say "all audits flow through the seam" — it must prove it. Round 3's inventory command was WRONG and is deleted: `git grep -n "AccountStaff.UserId\|AccountTenant.UserId" -- apps/api | grep -v Spec` returns exactly ONE line against develop (`CreateStaffProfile.cs:198: var currentUserId = authContext.AccountStaff.UserId;`), because the 54 victimized sites reach `AccountStaff`/`AccountTenant` through a captured outer `var account = ...` initialiser that a literal `AccountStaff.UserId` grep cannot see. The production commands cover BOTH real audit-write patterns (all RUN at tip `198a6e4b70`; verbatim outputs in `.dump/citations-r4.md`):

```bash
# PATTERN 1 — CreateAuditLogArgs constructions and their UserId sources:
git grep -n -A1 "new CreateAuditLogArgs" -- apps/api | grep "UserId:"
# Victim-typed sources inside pattern 1:
git grep -n -A1 "new CreateAuditLogArgs" -- apps/api | grep -c "UserId: account.UserId,"
# Non-account sources inside pattern 1 (expect 4: AcceptInvitation x2,
# CreateStaffProfile currentUserId, UploadOrphanReclaimerHandler):
git grep -n -A1 "new CreateAuditLogArgs" -- apps/api | grep "UserId:" | grep -v "UserId: account.UserId,"
# Captured-var initialisers the analyzer must trace THROUGH (dataflow):
git grep -nE "var account = authContext\.(AccountStaff|AccountTenant);" -- apps/api | grep -v Spec
# PATTERN 2 — direct AuditLog.CreateEntry sites and their userId sources:
git grep -n -A8 "AuditLog\.CreateEntry(" -- apps/api | grep "userId:"
```

  Real output at tip `198a6e4b70`: pattern 1 = **58** `UserId:` lines, of which **54** are `UserId: account.UserId,`; the non-account 4 are `AcceptInvitation.cs` ×2 (`existingUser.GetRequiredId()` / `user.GetRequiredId()`), `CreateStaffProfile.cs` (`currentUserId`), `UploadOrphanReclaimerHandler.cs` (`candidate.CreatedByUserId`); captured-var initialisers = **57** (47 `var account = authContext.AccountStaff;` + 10 `... AccountTenant;`); pattern 2 = **2 writer sites** (`ImpersonationService.cs` → `userId: staffUserId`, explicit parameter; `TenantProfileAsStaffService.cs` → `userId: args.ActorUserId`, args-record field) plus the abstraction factory `AuditLogService.cs` itself.

  Deliverable: `.dump/audit-inventory.md` (untracked, referenced from the PR body) listing EVERY site from BOTH patterns with file:symbol (symbol-only citations; no bare line numbers against moving branches), its current actor-source expression, and its disposition — migrated to `authContext.GetAuditActorUserId()`, replaced by an explicit actor parameter, or EXEMPT with a reason. Known shape: **59 sites total = 58 pattern-1 + 1 pattern-2 writer requiring migration** (`TenantProfileAsStaffService.AddAuditEntry`, whose `args.ActorUserId` traces back to `AssignTenantProfileUserAsStaff` passing `ActorUserId: account.UserId` from `authContext.AccountStaff`). Counting discipline: the construction inside the helper `TenantUserCompanyShared.LogBulkActionAsync` IS one of the 58 — list it ONCE under the helper's symbol; the four `*TenantUserCompaniesForStaff` handlers are CALLERS of that helper, not separate audit sites, and are listed as such. Exempt classes (each with justification in the inventory): `AcceptInvitation` ×2 (anonymous surface, no impersonatable session possible), `CreateStaffProfile` + `UploadOrphanReclaimerHandler` (explicit ids; the job carries no `IRequestAuthContext`), `AuditLogService.BuildAuditLog` (the abstraction factory itself), `ImpersonationService.AddAuditEntry` (staff id arrives as an explicit parameter).

- [ ] **Step 0c (BLOCKER, round 3): MACHINE-CHECKED GUARD, fail-closed, two layers.** Neither layer is optional; they catch different populations:

  1. **Roslyn analyzer in `packages/lint-cs`** (new diagnostic, e.g. `PUBLY0010 ImpersonationVictimAsAuditActorAnalyzer`): flags ANY type when a `CreateAuditLogArgs` receives `UserId:` OR an `AuditLog.CreateEntry` call receives `userId:` from `.AccountTenant.UserId`, `.AccountStaff.UserId`, or a local variable initialized from either — INCLUDING through one dataflow hop into an args-record field (e.g. `ActorUserId: account.UserId` passed into a record whose field later feeds the audit call — the real `SetTenantProfileUserArgs` shape found in round 4). The dataflow-back-to-context rule is REQUIRED, not optional: without it the analyzer catches ZERO of the 54 captured-var sites, since the audit line itself reads only `account.UserId`. Out of scope: `Tests/` and `*.Spec.cs`. UNLESS the argument is wrapped in `authContext.GetAuditActorUserId()` or the enclosing type carries `[SuppressImpersonationActorRule]` (attribute shipped WITH the analyzer; suppression allowed ONLY for the exempt classes enumerated in Step 0b, each carrying a justification comment). Style follows the existing analyzers in that project (`NullForgivingOperatorAnalyzer`, `SessionTokenLoggingAnalyzer`); `TreatWarningsAsErrors` in `Directory.Build.props` turns the diagnostic into a build failure, and `apps/api/PublyApp.Api.csproj` already references `PublyApp.Analyzers.csproj` with `OutputItemType="Analyzer"`.
     **Honest coverage statement (round 4):** with both rules the layer catches all 58 pattern-1 sites and the 1 migrating pattern-2 writer. What it CANNOT catch: a hypothetical THIRD pattern whose actor id arrives from a source outside these shapes (reflection, raw SQL result, an untraced multi-hop chain) — that residual risk is owned by follow-up F5's drift-check discipline and is NOT claimed as covered.
  2. **Reflection guard test co-located with the analyzers' consumers** (`apps/api/Lib/Architecture/AuditAttributionGuard.Spec.cs`, house style of `EndpointPermissionMetadataGuard.Spec.cs`): loads the API assembly, finds every type that (transitively, one level) references `IRequestAuthContext` AND writes audit rows (constructs `CreateAuditLogArgs` OR invokes `AuditLog.CreateEntry`), and asserts none builds the actor id from `AccountTenant.UserId` / `AccountStaff.UserId` / a local or args-field sourced from them while leaving `IRequestAuthContext.IsImpersonation` unread. Catches what syntax analysis misses (helper indirection like `TenantUserCompanyShared.LogBulkActionAsync` — which must migrate to accept the resolved actor id explicitly — and the args-record hop into `TenantProfileAsStaffService.AddAuditEntry`).

  RED proof for the guard itself: temporarily revert ONE migrated site (e.g. `DeletePostForTenant` back to `UserId: account.UserId`) → analyzer diagnostic fires and `dotnet build` fails; reflection spec fails naming file:type; ALSO temporarily repoint `TenantProfileAsStaffService.AddAuditEntry` back at `args.ActorUserId` → BOTH layers fire (pattern-2 proof); restore → green. Record all outputs in `.dump/proof-red.md`.

- [ ] **Step 0d (BLOCKER, round 3; REWRITTEN round 4 for honesty): NAMED GATES that WILL carry the guard — wiring documented for the IMPLEMENTATION PR, not running on this one.** A gate CI does not run protects nothing; equally, a planning PR claiming its gates already execute is lying about a docs-only diff. Verified facts at this tip: the analyzer does NOT exist in the tree (`git ls-tree -r origin/develop -- packages/lint-cs` lists the existing analyzers; no `ImpersonationVictimAsAuditActorAnalyzer.cs`), and this PR's merge-base diff is the single docs file. The two gates below are therefore **gates the implementation PR will rely on, named here so its reviewer can re-check each piece of wiring at THAT tip**:
  1. **Analyzer gate → every API compilation.** Wiring that ALREADY exists (implementation PR changes nothing here): `apps/api/PublyApp.Api.csproj` references `PublyApp.Analyzers.csproj` with `OutputItemType="Analyzer"` + `ReferenceOutputAssembly="false"`; root `Directory.Build.props` sets `TreatWarningsAsErrors=true`; workflow `api-tests.yml` builds the API before running tests and its `paths` filter includes `packages/lint-cs/**`. What the implementation PR must ADD: the analyzer + its `Spec.cs` + the `AnalyzerReleases.Unshipped.md` entry. Reviewer re-check recipe: `git ls-tree` shows the file; a violating diff must fail the build.
  2. **Reflection-spec gate → the full API suite.** `AuditAttributionGuard.Spec.cs` rides `just test-api` / `just ci` (which runs the full API suite — CI itself never does; the mirror is reconciled in `packages/scripts-ts/src/ci-gate-manifest.json` under `api-tests.yml::suite::Run full API test suite`). What the implementation PR must ADD: the spec file, plus paired-RED evidence in ITS PR body showing `just ci` green WITH the spec present.
  This planning PR claims NEITHER gate as currently executing; its own CI is green because docs-only diffs skip the heavy suites.

- [ ] **Step 1: End-to-end HTTP cases for the END route** (in `EndImpersonation.Spec.cs`):

```csharp
[Fact]
public async Task ItShouldReturnOkAndRevokeSessionOverHttp() {
	// staff admin login; create impersonation session via service (fixture scope);
	// POST /staff/impersonations/{id}/end with session token → 200 ApiResponse,
	// Key == "impersonation-ended-success"; sessions row gone; audit row present.
}

[Fact]
public async Task ItShouldReturnUnauthorizedWithoutToken() { ... }

[Fact]
public async Task ItShouldReturnBadRequestForMalformedSessionId() {
	// replace the guid segment with "not-a-guid" → 400 MalformedId.
}

[Fact]
public async Task ItShouldReturnForbiddenForNonAdminWithoutEndGrant() {
	// AccountLevel.User staff with empty-grant profile → 403.
}

[Fact]
public async Task ItShouldAttributeImpersonatedRequestToRealActorInAudit() {
	// Named adversarial spec (round-2 CRITICAL): prove an impersonated request
	// records the REAL staff actor, never the victim.
	// 1) Unit level: an IRequestAuthContext marked IsImpersonation with
	//    ImpersonatingStaffUserId = staffId resolves GetAuditActorUserId() == staffId;
	//    an unmarked context resolves to its own UserId.
	// 2) Flow level: run start → probe → end against the fixture;
	//    open the DB: every audit row written during the flow carries a STAFF userId
	//    (start/end rows name the acting staff explicitly); NO row names the victim V
	//    as UserId. The literal "tenant mutation writes its audit row through the seam"
	//    case lands with the first audited tenant endpoint (#1516).
}

[Fact]
public async Task ItShouldExposeIsImpersonatedToTenantScopeClients() {
	// Banner signal contract (backend half; UI is #1497).
	// ROUND-4 TRANSPORT FIX: the API reads ONE token from X-Session-Token;
	// the s:+t: combined cookie is a front-side construct (shared-ts parse.ts)
	// the API never parses. Therefore:
	// 1) seed the impersonation session via the service helper;
	// 2) present ONLY the impersonation (t:) token in X-Session-Token;
	// 3) GET /auth/scope-auth-data?scope=<tenantId> → 200;
	//    body.IsImpersonated == true;
	//    body.ImpersonationExpiresAt == the session's ImpersonationExpiresAt;
	// 4) repeat with an ordinary login token → IsImpersonated == false.
	// Which cookie half the real front sends on tenant calls is #1497's decision.
}

[Fact]
public async Task ItShouldReturnForbiddenForImpersonatedSessionOnStaffRoutes() {
	// Deny-list enforcement: present the impersonation combined token against a
	// /staff/* route (e.g. staff tenants list) → 403 ResponseKeys.NotAStaffUser,
	// because StaffAuthFilter resolves staff accounts by authContext.UserId —
	// the VICTIM, who has no staff account. An impersonated principal therefore
	// cannot reach DeleteTenantAsStaff, bulk variants, or any staff surface.
}
```

- [ ] **Step 2: Paired RED proof for `.dump/proof-red.md`.** For each new spec family, capture md5 of the mechanism file before mutation, apply the named adversarial mutation, run the new tests → RED, restore, verify md5 unchanged, run again → GREEN:

  1. **Mutation M1 (end path)** — pairs: `ItShouldEndSessionEmittingImpersonationEndedAudit`, `ItShouldRollBackEndWhenAuditInsertFails`. In `EndImpersonationSessionForStaffAsync`, delete the `AddEndAuditEntry(args, session);` line (audit skipped). Expected RED: `ItShouldEndSessionEmittingImpersonationEndedAudit` fails (no audit row); `ItShouldRollBackEndWhenAuditInsertFails` still passes (nothing to roll back is vacuously true — noted in the proof doc).
  2. **Mutation M2 (start path)** — pairs: `ItShouldCreateSessionAndAuditOnSuccess`. In `CreateImpersonationSessionAsync`, remove `AddAuditEntry(...)` similarly → RED.
  3. **Mutation M3 (attribution seam)** — pairs: `ItShouldPopulateImpersonationContextFromSessionData`, `ItShouldAttributeImpersonatedRequestToRealActorInAudit`. In `SessionAuthFilter`, revert the population lines so `IsImpersonation` stays `false` (delete the two assignment lines) → both go RED.
  4. **Mutation M4 (nesting guard)** — pairs: `ItShouldRejectNestedImpersonationAtServiceBoundary` (direct-service leg). Delete the active-impersonation pre-check AND drop the unique index (or the spec asserts BOTH the typed result AND exactly ONE remaining impersonation row for the victim, so either removal alone turns it RED).
  5. **Mutation M5 (route authorization, NEW — closes the "no named mutation" gap on the non-staff-caller family):** remove `.WithPermission([AppPermissions.Staff.Impersonations.START])` from the start route → `ItShouldReturnForbiddenForNonAdminWithoutStartGrant` goes RED (the empty-grant caller gets through to the handler instead of 403). Conversely, `ItShouldPinStaffAuthFilterBoundaryForNonStaffCallers` survives M5 BY DESIGN — it pins `StaffAuthFilter`, whose kill is removing `.WithStaffAuthorization()` from the `/staff/*` group; the plan documents this division so no one mistakes the filter-pin for service-guard coverage.
  6. **Mutation M6 (start-audit victim detail, NEW — closes the round-2 F2 hole):** in the explicit-target creation's `AddAuditEntry(...)`, delete `TargetUserId = resolved.UserId` from `details` → `ItShouldRecordTargetUserIdInStartAuditDetails` goes RED; nothing else in the suite changes. Without M6 + that spec, "the start audit keeps the exact victim" (F2) is proven by nothing.
  7. **Mutation M7 (§3b staff-liveness branch, NEW — closes the round-3 finding that §3b was prose only):** in `SessionAuthFilter.InvokeAsync`, delete the suspended/deleted/unverified check on `sessionData.Session.ImpersonatingStaffUserId` → `ItShouldReturnUnauthorizedWhenImpersonatingStaffIsSuspended` goes RED; nothing else changes. M3 does NOT substitute: it reverts context POPULATION upstream of this branch.
  8. **Mutation M8 (§3b grant-liveness branch, NEW):** delete the `IPermissionService.GetPermissionsAsync` re-check of `staff_impersonations.start` → `ItShouldReturnUnauthorizedWhenStaffLostStartGrant` goes RED; nothing else changes. M7 and M8 pin the two halves of §3b INDEPENDENTLY, so a lane implementing one but not the other ships visibly RED.

  Pairing table (every new spec family names its kill):

| Spec family | Paired mutation |
|---|---|
| `ItShouldEndSessionEmittingImpersonationEndedAudit` / rollback-on-failure | M1 |
| `ItShouldCreateSessionAndAuditOnSuccess` | M2 |
| `ItShouldPopulateImpersonationContextFromSessionData` / `…AttributeImpersonatedRequestToRealActorInAudit` | M3 |
| `ItShouldRejectNestedImpersonationAtServiceBoundary` | M4 (+ unique index as second tripwire) |
| `ItShouldReturnForbiddenForNonAdminWithoutStartGrant` / `…WithoutEndGrant` | M5 |
| `ItShouldPinStaffAuthFilterBoundaryForNonStaffCallers` | remove `.WithStaffAuthorization()` on the group (named here, not numbered) |
| `ItShouldReturnForbiddenWhenTargetUserIsStaffScope` (+ HTTP twin) | remove the `StaffUserRequired` guard from the explicit-target service path (the round-2 reviewer's exact trap) |
| `ItShouldRecordTargetUserIdInStartAuditDetails` | M6 |
| `ItShouldReturnUnauthorizedWhenImpersonatingStaffIsSuspended` | M7 |
| `ItShouldReturnUnauthorizedWhenStaffLostStartGrant` | M8 |
| `ItShouldAssertTheNamedUniqueIndexExistsInDatabase` | drop/rename `ux_sessions_one_active_impersonation_per_user` (paired with `just ci-migration-expand-contract`) |
| `ItShouldExposeIsImpersonatedToTenantScopeClients` | delete the `IsImpersonated` population in `GetScopeAuthData` |

- [ ] **Step 3: Full-suite verification under heavy.sh** (verification policy: unit/spec suites only, focused invocations):

```bash
~/ai-orchestration-playbook/tools/heavy.sh just test-api
```

Quote totals in the PR body. CI does not run this suite.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/Modules/Impersonations .dump/proof-red.md 2>/dev/null || git add apps/api/Modules/Impersonations
git commit -m "test(impersonations): endpoint integration specs + red-proof mutations (#160)"
```

(`.dump/` is gitignored; keep the proof file untracked, reference it from the PR body.)

## Follow-ups from the round-1 review (disposition: fixed-in-plan vs filed)

- **F1 — parallel impersonation of one victim / no uniqueness on (UserId, active):** FIXED IN PLAN. Service-boundary nesting guard (Task 3 Step 2, item 3) + partial unique index `ux_sessions_one_active_impersonation_per_user` (Global Constraint 1) as race backstop + specs `ItShouldRejectNestedImpersonationAtServiceBoundary` and mutation M4.
- **F2 — start audit loses the exact impersonated user:** FIXED IN PLAN. The explicit-target start audit now writes `details.TargetUserId = resolved.UserId` alongside `targetId = tenantId` (Task 4, "Start-audit fix"); spec `ItShouldRecordTargetUserIdInStartAuditDetails` asserts it and is paired with Mutation M6, closing the round-2 finding that no spec caught dropping the field.
- **F3 — `AlreadyEnded` collapses into `NotFound` after the sweep:** CONTRACT CLARIFIED IN PLAN (Task 4 design decision): durable plain-words causes, not a durable status distinction; the 404 copy states the session is not active and may have been revoked or expired. A tombstone/soft-state upgrade, if ever wanted, must not reintroduce soft-delete lifecycle on `sessions` — filed as follow-up lv1 #1519.
- **F4 — end-to-end attribution spec against a real tenant mutation:** the pinned specs prove the seam and its population end-to-end at the HTTP boundary, but NO tenant-surface endpoint persists an audit row today, so a literal "mutate as the victim, read the audit row" spec has no subject until the first audited tenant mutation exists. Filed as follow-up lv1 #1516 (land the e2e attribution spec with that endpoint).
- **F5 (round 4) — attribution-guard drift beyond the two known patterns:** DISPOSITIONED IN PLAN as a discipline, not machinery. The Step 0b inventory commands ARE the drift check: re-run them whenever `audit_logs` gains a new write path; any site appearing OUTSIDE patterns 1–2 (actor id from an untyped source) requires either extending the analyzer's dataflow rules or an explicit exempt-with-justification entry. Kept in-plan rather than filed as an issue because the trigger ("a third pattern appears") is not schedulable work today; the honest residual-coverage statement lives in the Adversarial core section.

## Task 6: Client regeneration + final gates

- [ ] **Step 1:** `just build-api && just generate-client && pnpm --filter front typecheck`. Commit regenerated `packages/client-ts/`. Re-run `just generate-client` a second time; confirm zero git diff; quote both hashes in the PR body. (The banner fields on `GetScopeAuthDataTenant` flow through here — the Kiota client picks up `isImpersonated` / `impersonationExpiresAt` automatically.)
- [ ] **Step 1b (migration gate):** `just db-migrate` applies cleanly on a fresh database and `just ci-migration-expand-contract` passes for `ImpersonationOneActiveImpersonationPerUser` (expand-only, reversible).
- [ ] **Step 2:** `pnpm lint` (repo-wide, exactly what CI runs) — expected green; no front source changed in this lane beyond generated client code.
- [ ] **Step 3:** `just knip` — expected green (no new dependencies).
- [ ] **Step 4:** `pnpm --filter front test` — full front suite green (guards included).
- [ ] **Step 5:** Final commit if anything regenerated drifted:

```bash
git add -A
git commit -m "chore(impersonations): regenerate kiota client (#160)"
```

## Task 7: PR

- [ ] **Step 1:** Write `.dump/pr-body.md`: triage outcome (epic partially delivered; this PR = plan + phase 1 scoping), what/why, RED proof summary, named adversarial mutations (M1–M8), suite totals, the round-2 change summary (identity-attribution seam, adversarial start guards, security core, banner contract, follow-ups F1–F5 with #1516/#1519), `Closes #1500` + `Part of #160` (NOT Closes #160 — phase 2 front-end UI closes the epic), `Model: Ox Alpha via Nous Portal (jcode, stealth/ox-alpha), effort max`, an explicit NOT-VERIFIED enumeration (see the honesty rule), `Unverified until review`.
- [ ] **Step 2:** `gh pr create --base develop --head lane/wt-160 --title "docs(plan): staff impersonation implementation plan (phase 1, #160)" --body-file .dump/pr-body.md`.
- [ ] **Step 3:** Poll `gh pr checks` until every check passes. "no checks reported" > 1 min → CONFLICTING → fetch/rebase keeping both intents → push `--force-with-lease`.
