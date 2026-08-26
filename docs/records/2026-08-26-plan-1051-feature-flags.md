# Lane 1051p — Feature-flag system (API-owned, typed, SSR-safe, scoped, audited): design + implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** PLAN ONLY — this PR ships the plan document and nothing else. Part of #1051 (the plan PR does not close it). Implementation is a follow-up lane.

## Sources read while writing this plan

Written against the tree at `develop` = `e13ee04a7`; every file:line citation below was RE-VERIFIED against `origin/develop` = `26896f251` on 2026-08-26 (round 2), all PASS.

| Claim | Source |
|---|---|
| Current static front registry + build-time freeze | `apps/front/src/lib/flags.ts` (+ `flags.test.ts`); Docker ARG/ENV pair only for the demo flag in `apps/front/Dockerfile:38-39` |
| The five live flag consumers | `apps/front/src/routes/signup.tsx:68`, `routes/index.tsx:257,284`, `routes/field-validation.tsx:189`, `routes/index.test.tsx:45` |
| Old-front registry retired 2026-08-22 | AGENTS.md; record `docs/records/2026-08-22-review-old-front-marketing-screens.md`; tag `old-front-final` |
| Root `beforeLoad` context is dehydrated with the router (the i18n transport) | `apps/front/src/routes/__root.tsx` (`resolveRootContext` at line 174, consumed by `RootShell` via `Route.useRouteContext`), `createRootRouteWithContext<{ queryClient }>`, SSR-query integration `apps/front/src/router.tsx` (`setupRouterSsrQueryIntegration`) |
| Authed surfaces are CSR; marketing/auth are SSR | `docs/guides/front/conventions.md:277-311` ("Rendering Strategy" + "Server-Function Boundary") |
| Per-account identity keys on `UserAccount.Id`, not `User.Id` | `apps/api/Modules/Users/Entities/UserAccount.cs` (`user_accounts`: `UserId`, nullable `TenantId`, `Scope`, one row per membership) |
| Audit single construction path | `apps/api/Modules/AuditLogs/Entities/AuditLog.cs` (`AuditLog.CreateEntry`, `AuditActions` constants incl. `SocialAccountConnected` precedent for dotted names); `AuditActionsRegistry` auto-discovers constants by reflection (`AuditActionsRegistry.Spec.cs`) |
| `IAuditLogService.LogAsync(LogManyAsync)` shape | `apps/api/Modules/AuditLogs/Services/AuditLogService.cs` (`CreateAuditLogArgs(UserId, Action, TargetId, Details)`) |
| Permission slices discovered by reflection; new slice = new class wired into scope class | `apps/api/Lib/AppPermissions.cs` (`StaffScopePermissions`/`TenantScopePermissions` property lists), `apps/api/Modules/Permissions/Seeders/PermissionSeeder.cs::GetPermissionsPool()` |
| Slice permission pattern + EN/FR translations | `apps/api/Modules/Settings/Permissions/SettingsPermissionsForTenant.cs` |
| Existing codegen tooling home | `packages/scripts-cs/` (PublyApp.Scripts, run through pinned `just` recipes) |
| Rate-limit policy names | `apps/api/Lib/RateLimiting/ApiRateLimitPolicies.cs` (`AnonymousOther`, `AuthenticatedDefault`, `HeavySearchList`, …) |
| Demo-flag e2e enable path TODAY (image build args) | `apps/front/docker-compose.test.yml:218-222` (`args: VITE_FEATURE_FIELD_VALIDATION_DEMO_ENABLED: "true"` on the `front` service), consumed by `.github/workflows/front-e2e.yml:214,227,339,362`; specs that hard-require the route: `apps/front/e2e/field-validation.spec.ts:116-118`, `drawer-description-contrast.spec.ts:579`, `toast-contrast.spec.ts:2416` |
| Server-side env-gated seeding (the replacement lever) | `apps/api/Data/IEntitySeeder.cs:22-24` (`IsDemo`; "Demo seeders are excluded in Production"), enforced at `apps/api/Data/DbContext/AppDbContext.cs:240-244`; e2e API runs `ASPNETCORE_ENVIRONMENT: Testing` (`apps/front/docker-compose.test.yml:123`) where demo seeders run by design (`:4-5`); every demo-route e2e visitor is authenticated (`apps/front/playwright.config.ts:84-86`, `chromium` project storageState) |
| #173 folded design + its gaps | Issue #1051 comments (folded from closed #173) |

One brief correction: the brief's "migration of the two existing static registries" predates the old-front retirement. Only ONE registry exists in this tree today (`apps/front/src/lib/flags.ts`). The old-front flag set died with that app on 2026-08-22; its last state is recorded in `docs/records/2026-08-22-review-old-front-marketing-screens.md`. Migration below covers the surviving front registry only.

---

# Part 1 — Design

**Goal:** Replace build-time feature flags with an API-owned, runtime-resolved system: one typed registry declared once, three override scopes under explicit resolution order, staff CRUD with audit per flip, SSR-safe transport to the front with no client second opinion, fail-safe defaults, dev-only local overrides, and a no-flag-day migration of the four existing static flags.

**Non-goals:** gradual/percentage rollouts, A/B testing, per-project scope (schema leaves room; resolution does not implement it yet), an experimentation platform (#173's built-not-bought constraint stands).

## D1. Registry declared once — TS generated FROM the API's C# registry

**Decision:** C# owns the declaration; TypeScript is generated from it as part of the OpenAPI contract generation pipeline. Unknown or misspelled key = compile error on both sides.

The registry lives in `apps/api/Modules/FeatureFlags/Registry/FeatureFlagRegistry.cs` as a plain static table — every entry carries key, type, default value, description, scopes allowed, and visibility (`Public` vs `Authenticated`). A generator (new recipe in `just`, implemented in `packages/scripts-cs/`, the existing codegen tooling home) emits two artifacts checked into source control:

1. `packages/client-ts/src/featureFlags.g.ts` — a const object of literal keys + defaults + a `FeatureFlagKey` union type, plus a compile-time exhaustiveness map used by the front's typed accessor.
2. A markdown table fragment rendered into the staff UI help text and this doc's appendix via the generator (single source for descriptions).

**Why API→TS and not TS→API:** the API must validate every write against the authoritative set anyway (staff CRUD cannot trust a client-declared list); making the API side the hand-written one means there is exactly one place a human edits, and both generated artifacts regenerate from it. Going the other direction would force the API to parse or import TS at build time — a toolchain dependency the .NET side does not have today. It also matches the existing contract flow: `just build-api && just generate-client` already regenerates `packages/client-ts` from API truth; the flag registry rides the same rail, so CI drift between the two sides fails the same way OpenAPI drift does.

Type discipline without generics sprawl: v1 supports `boolean` flags only. The registry records `"type": "boolean"` per key and the generated TS types values accordingly; extending to string/number later is additive (new type discriminant + narrowing in the accessor), not a migration.

Compile-error proof points:
- Front reads go through `getFlag(flags, 'auth.signupsEnabled')` where the key argument is typed as the generated `FeatureFlagKey` union — a typo fails `tsc`.
- API writes resolve keys through the same C# registry — an unknown key in a handler/service is a compile error (no stringly-typed lookup surface is exported).
- A spec pins the generated artifact to the registry: if someone edits either by hand, `FeatureFlagRegistrySync.Spec` (compares C# registry ↔ committed `featureFlags.g.ts` contents parsed as JSON) goes red until regeneration.

Initial registry content = the four existing front flags, migrated verbatim (same keys, same defaults):

| Key | Default | Visibility | Description |
|---|---|---|---|
| `auth.signups_enabled` | `false` | Public | Whether open signups render/enroll |
| `dev.field_validation_demo_enabled` | `false` | Public | Dev-only scaffolding demo route (Public because its e2e enable is a seeded GLOBAL override that must resolve identically with or without a session — D9/T12e) |
| `marketing.customer_logos` | `false` | Public | Invented customer logos stay hidden until real proof exists |
| `marketing.social_proof` | `false` | Public | Rating + setup claim hidden until user evidence exists |

Naming note: wire keys move to snake_case to match the repo's multi-word wire-format rule (AGENTS.md "wire-format option values … snake_case"). The migration maps old camelCase JS paths to these keys explicitly (Task T12).

Visibility note: the demo flag is declared **Public** — deliberate. Its e2e enable path (D9/T12e) is a seeded GLOBAL override, and global overrides must resolve identically with or without a session; a `Public` declaration keeps one resolution story for every caller. Visibility gates TRANSPORT exposure (what may ship in an anonymous payload), not route authorization: `/field-validation` itself stays unmounted whenever the resolved value is false, in every environment.

## D2. Resolution order — account > tenant > global > declared default, explicit

Resolution for context `(accountId?, tenantId?)`:

1. Start from the **declared default** from the registry.
2. If a global-scope override row exists → it wins.
3. If a tenant-scope override exists for the context's tenant → it wins.
4. If an account-scope override exists for the context's account → it wins.

Later steps fully replace earlier ones (last match wins, not boolean merge) so the order reads top-down and a flip at a narrower scope always has a predictable effect. Absent rows mean "not overridden", never "false" — the default comes from the declaration, not from absence.

**Scoping keys on the right identity:** overrides are keyed by `UserAccount.Id` (account scope) and `Tenant.Id` (tenant scope) — NOT `User.Id`. Memory + `docs/records/2026-01-31-plan-identity-scoped-tenant-cookie.md` confirm the model: `User` is the login identity; `UserAccount` is the membership (one row per user×scope×tenant, nullable `TenantId` for staff). Two memberships of the same human in different tenants are different accounts, and a per-account rollout targets the membership, not the person. The effective-flags endpoint derives the caller's account id server-side from the session + tenant header — the client never supplies one.

Staff evaluation endpoint accepts explicit `tenantId`/`accountId` query params (permission-gated) so staff can preview any scope combination without impersonation.

## D3. Storage — `feature_flag_overrides` table

One table, EF migration `AddFeatureFlagOverrides`:

```
feature_flag_overrides
  id            uuid pk (UUIDv7, BaseAttributes audit columns + IsDeleted soft delete)
  key           text    -- FK-by-convention to the registry (validated in code, see below)
  scope         int     -- enum: Global=10, Tenant=20, Account=30 (matches repo ordinal-style enums like PublicationStatus)
  tenant_id     uuid?   -- required when scope=Tenant, null otherwise
  account_id    uuid?   -- required when scope=Account, null otherwise
  enabled       bool    -- the override value
  updated_by    uuid    -- last actor (audit trail remains in audit_logs)
```

Constraints (all in the migration): filtered unique index on `(key, scope)` where `scope = Global`; on `(key, scope, tenant_id)` where `scope = Tenant AND tenant_id IS NOT NULL`; on `(key, scope, account_id)` where `scope = Account AND account_id IS NOT NULL` (Postgres NULL-distinct trap — same pattern as the `ux_user_accounts_*_active` indexes documented on `UserAccount`). CHECK constraints enforce tenant_id/account_id presence exactly when the scope demands it. Index on `(scope, key)` serves the resolver's hot read.

No FK from `key` to anything (it references a compile-time registry, not a table); `tenant_id`/`account_id`/`updated_by` get real FKs. Deleting a tenant/account hard-blocks nothing here: rows follow the referenced entity's existing deletion flow — the resolver ignores rows whose tenant/account is deleted (join filters `IsDeleted`), and a cleanup sweep is out of scope until data volume asks for one (stated, deliberate).

Seeding: NO seed rows. Defaults live in the registry alone; the table holds ONLY overrides. An absent row is semantically "use declared default" (D2), which keeps the table tiny and makes "what did we override?" a trivially answerable question.

## D4. API endpoints

New domain module `apps/api/Modules/FeatureFlags/` (domain-first layout per `docs/guides/api-module-structure.md`):

**Caller-facing (effective flags):**
- `GET /feature-flags/effective` — anonymous-reachable; returns the full resolved map `{ [key]: boolean }` plus a `revision` hash. Context derivation: session token if present → account/tenant ids; anonymous → no scope rows apply (global+defaults only). This is what makes marketing-page gating work pre-auth (the gap #173's design missed — flagged in the issue comments).
- Response includes `resolvedAtUtc` and per-key `source` (`default | global | tenant | account`) so the staff UI can display *why* a flag resolved the way it did.

**Staff management (all under `/staff/feature-flags`, permission-gated, rate-limited):**
- `GET /staff/feature-flags` — registry listing: key, type, description, default, visibility, allowed scopes.
- `GET /staff/feature-flags/effective?tenantId=&accountId=` — resolved map for ANY context (preview; permission-gated; params validated as GUIDs, malformed → 400 per route-parameter conventions).
- `GET /staff/feature-flags/overrides?key=&scope=&tenantId=&accountId=` — list stored overrides (cursor-paginated, keyset on `(created_at, id)`, CSV-free scalar filters).
- `PUT /staff/feature-flags/overrides` — body `{ key, scope, tenantId?, accountId?, enabled }`; upsert. Returns 200 with the resulting effective snapshot + old/new pair actually written; 404 unknown tenant/account; 422 unknown key/scope mismatch (e.g. accountId present with scope=Tenant).
- `DELETE /staff/feature-flags/overrides/{id}` — remove an override (falls back to next scope down).

Route naming follows kebab-case backend convention; constants nested under `Routes.FeatureFlags.{ForStaff.Root="/feature-flags", Effective="/effective", Overrides="/overrides"}` in a new partial `Routes.FeatureFlags.cs` mirroring `Routes.Settings.cs`.

Permissions: new slice `FeatureFlagPermissionsForTenant` is NOT created — flags are platform-level, so the slice is **staff-only**: `FeatureFlagPermissionsForStaff : ISlicePermissions` with `VIEW` (`staff.feature_flags.view`) and `MANAGE` (`staff.feature_flags.manage`), wired into `StaffScopePermissions` (one property line), auto-discovered by `PermissionSeeder`'s reflection pool, EN+FR translations like `SettingsPermissionsForTenant`. Route-level enforcement via `.WithPermission([AppPermissions.Staff.FeatureFlags.VIEW|MANAGE])`.

Rate limiting: effective (anonymous-reachable) → `ApiRateLimitPolicies.AnonymousOther`; staff reads → `HeavySearchList`; staff writes → `AuthenticatedDefault`. All three exist in `ApiRateLimitPolicies.cs` today — no new policy quartet.

**Validation:** FluentValidation validators using `JsonElementRules.*` extensions per validator conventions; handler bodies use `JsonElement` DTOs; wire types carry no `Dto` suffix; handler entrypoints named `Handle`.

## D5. Audit — every flip recorded with actor, when, old/new

Two new `AuditActions` constants in `AuditLog.cs` (auto-picked-up by `AuditActionsRegistry`):
- `feature_flag.enabled = "feature_flag.enabled"`
- `feature_flag.disabled = "feature_flag.disabled"`

Written via `IAuditLogService.LogAsync(CreateAuditLogArgs(...))` in the SAME transaction as the override write (the service adds the entry before `SaveChangesAsync`, following the `CreateEntry` shared-path doc comment). Payload details JSON: `{ key, scope, tenantId?, accountId?, oldValue, newValue, source: "staff_ui" }`. TargetId = the override row id. Actor = session user id (staff), timestamp = row `CreatedAt`. DELETE of an override logs `feature_flag.disabled`-style fallback event too — modeled as its own pair? No: delete logs `feature_flag.overridden_default_restored`? Simpler and honest: delete logs `feature_flag.disabled` **only when the effective value actually changes** (i.e. the deleted override was winning); otherwise no audit row is emitted for a non-effective cleanup. Stated rule: **audit entries record effective-value changes, not row churn.**

Reads are not audited (consistent with the rest of the log's mutation-only policy).

## D6. Caching + invalidation

Three layers, each with an explicit bound:

1. **Per-request memoization (API):** the resolver service is scoped; within one HTTP request all lookups hit one DB round-trip (single query loading all rows for the context — the table is small; no per-key queries). No cross-request cache on the API by default.
2. **Short TTL (front server):** the root `beforeLoad` fetch caches the payload for `FEATURE_FLAGS_TTL_MS = 60_000` (module-level Map keyed by context fingerprint: anonymous | tenant:<id> | staff). Within TTL, SSR requests reuse the cached map; past TTL they refetch. Bound stated: after a flip, the worst-case staleness a visitor can observe is TTL (60 s) + their already-rendered page lifetime until next navigation/refresh. No push invalidation channel — deliberately rejected (a SignalR/websocket fanout for 60-second-stale-tolerant data is complexity without a payoff; revisit only if a flag needs sub-minute propagation, which none of the current four do).
3. **Explicit bust on write:** the PUT/DELETE response returns the new revision hash; the staff UI refetches its own views immediately. Server-side bust: the front cache entry stores the fetched `revision`; a staff flip does NOT reach the front server directly (different process), so the TTL is THE bound — stated honestly rather than pretending cross-process invalidation exists. What the bust guarantees: the flipping operator sees their change instantly (their browser refetches); everyone else sees it within TTL.

No stale flag after a flip beyond TTL: guaranteed by construction (TTL is the maximum age of any served map; there is no SWR-style serve-stale-while-revalidate layer).

## D7. Transport to the front — resolved server-side in root `beforeLoad`, dehydrated with router state

The root `beforeLoad` (`resolveRootContext` in `__root.tsx`) already builds a `RootRouteContext` (locale/namespaces/resources) that TanStack Start serializes into the HTML for the client hydration — proven transport, zero new machinery. Flags ride it:

- Extend `RootRouteContext` with `featureFlags: ResolvedFeatureFlags` (the generated-type map + sources + revision).
- Server branch (`typeof document === 'undefined'`): call the API's `/feature-flags/effective` with the request's session cookie forwarded (anonymous when absent), through a small server-only helper living beside the i18n loader (`src/server/feature-flags.ts`) — NOT through `createServerFn` (conventions forbid server fns as application-data proxies; this is a frontend-server concern like i18n resource loading, and it never touches session-token material beyond forwarding the incoming cookie header server-side).
- Client branch (`loadClientRootContext` path): consume the dehydrated context as-is. **No client second opinion:** the browser never re-fetches flags on hydration; `getFlag()` reads only the dehydrated map. A long-lived SPA tab keeps its landing snapshot for the session — acceptable and stated (authed CSR surfaces remount through navigation and pick up fresh context; a hard refresh always refetches). No flash of wrongly-gated content because the first paint already has final values.
- Fail-safe (D8) applies identically on both branches, so SSR output and hydrated state can never disagree.

Consumption API: `useFeatureFlag('marketing.social_proof')` (typed accessor over route context) + a non-hook `isFeatureEnabled(context.featureFlags, '…')` for loaders/non-component code. Both accept only the generated key union.

Authed CSR surfaces: the root context is still resolved (it is the root), but authed pages that need flags beyond the root snapshot may also read them from the standard TanStack Query cache — the same dehydrated payload warms a `['feature-flags', revision]` query entry during hydration, giving authed pages the typed hook without a second network call.

## D8. Fail-safe — declared defaults, no throw, one warning

If the effective-flags fetch throws, times out (explicit 5 s timeout via AbortSignal), or returns an unparseable body: use the generated defaults map for EVERY key, mark `source: 'default'` everywhere, set `degraded: true` on the payload, and emit exactly ONE `logger.warn('[feature-flags] falling back to declared defaults')` per process per TTL window (dedup'd, not per request — no log flood during an outage). Nothing throws into `beforeLoad`; the page renders gated surfaces per defaults. The staff UI additionally shows a "showing declared defaults (API unreachable)" banner when `degraded` is true, satisfying the transparent-failure-causes owner rule.

Partial responses are not a thing: the endpoint always returns the complete map (registry-driven), so there is no half-populated state to reason about.

## D9. Local override — `VITE_FEATURE_*`, dev-only, loud in prod build

Developers keep `VITE_FEATURE_SIGNUPS_ENABLED=true` style env forcing WITHOUT touching shared state:

- Read in the front server env layer (`src/lib/env.ts` pattern): `VITE_FEATURE_<SNAKE_KEY>=true|false` maps onto the generated key union (mapping generated alongside the registry artifacts so renames keep working).
- Wins ONLY when `import.meta.env.DEV` is true (dev server). In a production build, the variable is ignored at runtime AND the production build emits a LOUD warning ("VITE_FEATURE_X set in a production build — ignored") at build time when detected, so a leaked dev override cannot silently ship.
- Precedence: local dev override > everything (including API overrides) — it is a developer machine affordance, never deployable.
- **Environment precedence (stated rule):** `VITE_FEATURE_*` dev-server override > API-resolved value > declared default. The API-resolved value carries the environment dimension SERVER-SIDE: what differs between local/dev, the e2e Testing stack, and production is WHICH OVERRIDE ROWS EXIST IN THE DATABASE the API booted against — Testing seeds fixture overrides through a demo-gated seeder (T12e), Development and Production start from declared defaults and change only through audited staff CRUD (D4–D5). After T12d there is NO build-time flag input left anywhere: the four container images are byte-identical across environments by construction, and the compose `build.args` era is dead.
- Documented in `.env.example` comment block (the committed template) with the exact naming rule.

## D10. Staff UI — list + toggle per scope, shows effective value

New staff page `apps/front/src/routes/authed/staff/feature-flags.tsx` (registered in `routes.ts`, i18n namespace `staff-feature-flags`, DataTable patterns from `authed/staff/audit-logs.tsx`):

- Registry table: key, description, default, and the caller's CURRENT context effective value + source badge (`global | tenant | account | default`).
- Scope selector: evaluate as (a) platform/global view, (b) specific tenant picker, (c) specific account within tenant. Selection drives the effective-view query.
- Toggle action per row per scope: opens a confirm dialog showing OLD value → NEW value for THAT scope; submit calls PUT; optimistic refetch of the effective view; toast on success/failure through the standard `getFailureMessage(toApiFailure(error))` path (never manual translation).
- Override list drawer: stored overrides for a key with delete (fallback-to-parent-scope) actions, showing who/when from the audit-backed fields.
- Gating: page requires `staff.feature_flags.view`; toggles require `staff.feature_flags.manage` (server-side 403 surfaced via the standard failure path — no front permission hook exists yet, same caveat as the D3 plan documented; UI hides nothing pre-emptively).
- Degraded banner per D8.

## D11. Migration — absorb the four static flags, no flag day

Order matters; each step ships green independently:

1. Land registry + storage + endpoints (nothing consumes them yet).
2. Land front transport + typed accessors (still nothing consumes them).
3. Flip consumers ONE AT A TIME, least-risky first (order per Tasks T12a–c): `index.tsx` ×2 (marketing), `signup.tsx` (signups_enabled), `field-validation.tsx` (demo). Each consumer swap is its own commit with its test updated (`index.test.tsx` mocks the context instead of `FEATURES`).
4. Delete `apps/front/src/lib/flags.ts` + `flags.test.ts` + the Docker ARG/ENV pair (`apps/front/Dockerfile:38-39`) + the compose `build.args` block (`apps/front/docker-compose.test.yml:218-222`); the e2e demo route is kept alive by the T12e seeded override (landed FIRST); grep proves zero remaining `VITE_FEATURE` readers except the dev-override loader itself.

Behavior preservation notes: the demo flag keeps its special property (route unmounted entirely when off) — the route guard now consults the flag map instead of the frozen constant. Marketing flags were false in every released image anyway (no Docker ARG existed), so runtime-default false is strictly MORE capable, not a behavior change. Signups stays default-false; ops can now turn it on without a rebuild, which is the entire point.

Rollback: each consumer swap is independently revertible; the static registry deletion lands last, after e2e evidence on the PR.

## D12. Observability

- Staff UI shows the full effective map per context (D10) — inspectable state.
- Every flip is an audit-log row visible in the existing staff audit-logs page (filterable by action constants) — who/when/old/new.
- One structured warning line on degradation (D8) — outage-visible without noise.
- The `revision` field on every payload gives support a cheap "which flag-state did you have?" handle for bug reports.

## Decisions summary (alternatives rejected)

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Registry ownership | C#, generate TS | TS as source (generate C#) | API validates writes authoritatively anyway; .NET has no TS-import toolchain; rides the existing OpenAPI regeneration rail so drift fails CI like contract drift |
| Scope identity | `UserAccount.Id` | `User.Id` | Membership ≠ person (tenant-cookie record); same human in 2 tenants = 2 accounts; targeting is per-membership |
| Storage | Single overrides table, no seed rows | Per-scope tables; seeded defaults | Absent row = default keeps table minimal; defaults live in the one declaration |
| Transport | Root beforeLoad context (i18n rail) | Client fetch post-hydration; per-route loaders | Proven dehydration path; zero flash; anonymous marketing pages need it pre-session (the #173 gap); no client second opinion |
| Cache | 60 s TTL + write-response revision | Push invalidation (SignalR); Redis | Sub-minute staleness tolerance for all four flags; no infra ask; honest bound instead of imaginary cross-process bust |
| Fail mode | Declared defaults + degraded banner + dedup'd warning | Throw; partial maps | Flag outage must not take the app down (issue requirement); owner transparent-failure rule |
| Local override | VITE_FEATURE_*, DEV-only, prod-build warning | DB-backed local profiles | Zero-setup, matches muscle memory from the static era, cannot leak (build-time warning) |
| Permissions | Staff-only VIEW/MANAGE slice | Tenant self-service flags | Flags are platform decisions; tenant-facing scoping is consumption, not administration |

---

# Part 2 — Tasks (bite-sized, TDD)

Global task rules:

- One task = one commit; message prefix `feat|test|docs|chore(flags): …`; push after every commit.
- RED→GREEN: every code task starts with its failing spec (or compile-level failing assertion), named in the step.
- Heavy commands (`dotnet test`, front suites) run under `~/ai-orchestration-playbook/tools/heavy.sh`, focused filters first; never > 20 min under the lock.
- No e2e stack locally (captain verification policy 2026-08-23): CI runs front-e2e on the PR and that is the evidence.
- "api-check" = `just build-api` + `just ci-quality-dotnet`.
- Analyzers PUBLY0001–0008 are errors: guard clauses, no `?? throw`, no `!`, no `ToLower()` dispatch, cached `JsonElement` getters, `*ForStaff*` service variants for staff reads, braces always, ≤100-char lines.
- After any endpoint change: `just build-api && just generate-client && pnpm --filter front typecheck`.

## Task T0 — Plan commit (this file)

- [x] Design section committed (`edbb6563e`).
- [x] Tasks section committed (this commit).

## Task T1 — Registry + generator (the one declaration)

**Files:** [new] `apps/api/Modules/FeatureFlags/Registry/FeatureFlagRegistry.cs` (+ `.Spec.cs`), [new] `packages/scripts-cs/**/GenerateFeatureFlagTypes*.cs` wired as a `just generate-flags` recipe, [new] `packages/client-ts/src/featureFlags.g.ts` (committed artifact), [mod] root `justfile` recipe list.

- [ ] **Step 1 (RED):** `FeatureFlagRegistry.Spec`: asserts (a) all four initial keys present with exact defaults (`auth.signups_enabled=false`, `dev.field_validation_demo_enabled=false`, `marketing.customer_logos=false`, `marketing.social_proof=false`); (b) keys are unique + kebab/snake-shaped (`^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`); (c) every entry has non-empty EN description + allowed-scope set + visibility. Run focused filter under heavy.sh → FAIL (registry empty). GREEN by writing the registry table with the four entries. Commit NOT yet — T2 commits T1+T2 together if the generator needs the registry shape frozen first; otherwise standalone `feat(flags): typed feature-flag registry (single C# declaration)`.
- [ ] **Step 2:** generator emits `featureFlags.g.ts` from reflection over the registry (same reflection pattern `PermissionSeeder.GetPermissionsPool()` uses): const object with literal keys, per-key `{ default, visibility }`, exported `FeatureFlagKey` union, and `FEATURE_FLAG_DEFAULTS`. Header comment: GENERATED — do not edit.
- [ ] **Step 3 (sync proof, RED then GREEN):** `FeatureFlagRegistrySync.Spec` parses committed `featureFlags.g.ts` as text, extracts key/default pairs, asserts equality with the C# registry. RED until the artifact is generated + committed; proves hand-edits to either side fail CI.

## Task T2 — Entity + migration

**Files:** [new] `apps/api/Modules/FeatureFlags/Entities/FeatureFlagOverride.cs`, [new] `apps/api/Migrations/<ts>_AddFeatureFlagOverrides.cs` (+ `.Spec.cs`), [mod] `apps/api/Data/DbContext/AppDbContext.cs` (`DbSet<FeatureFlagOverride> FeatureFlagOverride` next to `DbSet<AuditLog>` line ~111).

- [ ] **Step 1:** entity per D3 (BaseAttributes, INoTenantEntity-style global access like AuditLog, scope enum `FeatureFlagScope { Global=10, Tenant=20, Account=30 }`). Filtered unique indexes exactly as D3 specifies (Postgres NULL-distinct pattern documented on `UserAccount`).
- [ ] **Step 2:** `just db-add AddFeatureFlagOverrides && just db-migrate`. Migration spec asserts: three filtered unique indexes exist by name; CHECK constraints enforce tenant/account id presence per scope; table is empty post-migration (no seeds — doctrine).
- [ ] **Step 3:** `heavy.sh just ci-migration-expand-contract` green (expand-only). Commit `feat(flags): FeatureFlagOverride storage — scoped overrides, filtered uniques, no seeds`.

## Task T3 — Resolver service (resolution order)

**Files:** [new] `apps/api/Modules/FeatureFlags/Services/IFeatureFlagResolver.cs` + `FeatureFlagResolver.cs` (+ `.Spec.cs`).

- [ ] **Step 1 (RED):** resolver spec on ApiFixture: seed overrides at all scopes for one key; assert resolution order account > tenant > global > default for contexts: anonymous (default/global only), tenant member (tenant wins over global), account row wins over tenant; deleted-tenant rows ignored; absent rows fall through to declared default; single DB round-trip per Resolve call (query-count assertion via fixture listener or EF log capture — pick the cheapest provable mechanism).
- [ ] **Step 2 (GREEN):** `Task<ResolvedFlagMap> ResolveAsync(ResolveArgs(Guid? TenantId, Guid? AccountId), ct)`; one query loading candidate rows `(scope, key)` filtered by context; merge in memory per D2 order; returns map + per-key source + revision hash (sha256 over sorted key=value pairs).
- [ ] **Step 3:** green under heavy.sh focused filter. Commit `feat(flags): resolver — account > tenant > global > declared default, explicit sources`.

## Task T4 — Effective endpoint (anonymous-reachable) + staff preview

**Files:** [new] `apps/api/Modules/FeatureFlags/Handlers/Anonymous/GetEffectiveFeatureFlags.cs` (+ Spec), [new] `.../Handlers/Staff/GetEffectiveFeatureFlagsForStaff.cs` (+ Spec), [new] `.../Endpoints/FeatureFlagEndpoints.cs`, [new] `Routes.FeatureFlags.cs`, [mod] `apps/api/Program.cs` (map call beside existing groups).

- [ ] **Step 1 (RED):** anonymous spec: GET effective without session → full map of declared defaults + any GLOBAL overrides seeded; session+tenant-header request → tenant overrides applied; response carries `revision` + per-key `source` + `resolvedAtUtc`; malformed GUID query param on staff variant → 400; staff variant accepts `tenantId`/`accountId` params and reflects that combination; staff route 403 without `staff.feature_flags.view`.
- [ ] **Step 2 (GREEN):** handlers orchestrate only (no DbContext): resolve account/tenant ids from auth context server-side; wire routes with `.WithPermission([AppPermissions.Staff.FeatureFlags.VIEW])` (staff) / anonymous group (public) and rate-limit policies `AnonymousOther` / `HeavySearchList`.
- [ ] **Step 3:** specs green; `just build-api` green (contract change). Commit together with T5's permission slice if ordering prefers it — see T5 note.

## Task T5 — Staff permissions slice

**Files:** [new] `apps/api/Modules/FeatureFlags/Permissions/FeatureFlagPermissionsForStaff.cs`, [mod] `apps/api/Lib/AppPermissions.cs` (one property on `StaffScopePermissions`: `public FeatureFlagPermissionsForStaff FeatureFlags { get; } = new();`).

- [ ] **Step 1 (RED):** extend an existing permissions-discovery spec OR add `FeatureFlagPermissions.Spec`: `AppPermissions.Staff.FeatureFlags.VIEW.Key == "staff.feature_flags.view"`, `MANAGE.Key == "staff.feature_flags.manage"`, both carry EN+FR translations. RED until the slice exists.
- [ ] **Step 2 (GREEN):** slice class mirroring `SettingsPermissionsForTenant` shape (staff variant). Reflection seeding picks it up automatically — assert via the seeder pool test if one exists, else the slice spec suffices plus one integration assertion that a fresh DB seeds both keys.
- [ ] **Step 3:** green; commit `feat(flags): staff.feature_flags view/manage permissions`. If T4 landed before this, re-run its 403 spec now green-with-permission (assign permission to test role in fixture helper, following existing permission-test helpers).

## Task T6 — Override CRUD (upsert + delete) with audit

**Files:** [new] `apps/api/Modules/FeatureFlags/Handlers/Staff/UpsertFeatureFlagOverrideForStaff.cs` (+ Spec), [new] `.../DeleteFeatureFlagOverrideForStaff.cs` (+ Spec), [new] `.../FindFeatureFlagOverridesForStaff.cs` (+ Spec), [mod] `apps/api/Modules/AuditLogs/Entities/AuditLog.cs` (two constants after `SocialAccountProjectsSet`), endpoints extended from T4 file.

- [ ] **Step 1 (RED):** upsert spec: PUT new override → row created, audit `feature_flag.enabled|disabled` written in SAME transaction (assert both row + audit exist or neither — force a failure case), details JSON carries key/scope/ids/oldValue/newValue, TargetId=override id; PUT over existing → update, old value captured in audit; unknown key → 422 stable errors key; scope/id mismatch → 422; unknown tenant/account → 404; 403 without MANAGE; cross-check `AuditActionsRegistry.Spec` still passes (reflection auto-pickup).
- [ ] **Step 2 (RED):** delete spec: delete winning override → effective falls back to parent scope AND audit row records the effective change; delete non-winning override → NO audit row (D5 rule: audit records effective changes, not row churn).
- [ ] **Step 3 (RED):** find-overrides spec: keyset pagination `(created_at, id)`, filters key+scope, cursor validation, snake_case query params.
- [ ] **Step 4 (GREEN):** implement all three handlers + validators (`JsonElementRules.*`, top-level sibling wire types, no `Dto` suffix) + service methods using `*ForStaff*` naming for staff reads; write path goes through `IAuditLogService.LogAsync` before `SaveChangesAsync`. Rate limiting: writes `AuthenticatedDefault`, read `HeavySearchList`.
- [ ] **Step 5:** all green under heavy.sh; api-check; commit `feat(flags): staff override CRUD — audited flips, old/new captured, keyset list`.

## Task T7 — Front generated types + typed accessors

**Files:** [mod] `packages/client-ts/src/featureFlags.g.ts` (extend with accessor helpers IF they live client-side; keep pure data otherwise), [new] `apps/front/src/lib/feature-flags.ts` (+ `feature-flags.test.ts`) — `useFeatureFlag(key)` hook + `isFeatureEnabled(map, key)` pure fn, both keyed on generated union.

- [ ] **Step 1 (RED):** unit tests: typo'd key fails TYPECHECK (`pnpm --filter front typecheck` is the red/green oracle — include a `// @ts-expect-error` case asserting a bad literal is rejected); hook returns the map value from provided context; pure fn handles missing map (returns declared default).
- [ ] **Step 2 (GREEN):** implement accessors reading route-context payload only (no fetch logic here). Commit `feat(front): typed flag accessors over generated registry`.

## Task T8 — Transport: beforeLoad resolution + dehydration + fail-safe

**Files:** [new] `apps/front/src/server/feature-flags.ts` (server-only fetch helper, cookie-forwarding, 5 s timeout, TTL cache keyed by context fingerprint, dedup'd warn), [mod] `apps/front/src/routes/__root.tsx` (extend `RootRouteContext` + both branches of `resolveRootContext`/`loadClientRootContext`), [new] `apps/front/src/server/feature-flags.test.ts`, [mod] root-route context tests if any exist.

- [ ] **Step 1 (RED):** helper unit tests (node env): success → parsed map cached under fingerprint; second call within 60 s TTL hits cache (fetch mock call-count 1); failure → defaults map + `degraded:true` + exactly ONE warn across N calls; timeout abort honored; client branch consumes dehydrated context verbatim (no fetch mock called).
- [ ] **Step 2 (GREEN):** implement helper + root wiring. SSR HTML must contain final values (assert via existing SSR test pattern if present; else component test asserting `useRouteContext().featureFlags` populated).
- [ ] **Step 3:** `pnpm --filter front typecheck && pnpm --filter front exec vitest run src/server/feature-flags.test.ts` green. Commit `feat(front): flags resolved in root beforeLoad, dehydrated — no client second opinion, fail-safe defaults`.

## Task T9 — Dev local overrides (`VITE_FEATURE_*`)

**Files:** [mod] `apps/front/src/lib/feature-flags.ts` (apply dev overrides at accessor boundary when `import.meta.env.DEV`), [mod] `.env.example` (comment block documenting naming rule), [new] vite-config-level prod-build warning if feasible (else a `pnpm --filter front build` postbuild grep script wired into package.json), [+test].

- [ ] **Step 1 (RED):** unit tests: DEV mode env `VITE_FEATURE_MARKETING_SOCIAL_PROOF=true` overrides dehydrated false; PROD simulation (`DEV:false`) ignores env; mapping covers all four keys (rename-safe: derived from generated artifacts).
- [ ] **Step 2 (GREEN):** implement; document in `.env.example`. Prod-build warning: script greps built output/env presence and fails loud — decide exact mechanism during implementation, keep it out of runtime code. Commit `feat(front): VITE_FEATURE_* dev-only local overrides, loud if leaked to a prod build`.

## Task T10 — Staff UI page

**Files:** [new] `apps/front/src/routes/authed/staff/feature-flags.tsx` (+ `feature-flags.test.tsx`, `_list-search-params.ts`), [new] `apps/front/src/lib/query/staff-feature-flags.ts` (+ test), [new] i18n `apps/front/src/i18n/locales/en/staff-feature-flags.json` + `fr/…` (identical shape), [mod] `apps/front/src/routes.ts` (register `/staff/feature-flags`), [mod] `apps/front/src/lib/i18n.namespaces.ts` (namespace registration), [regen] Kiota client.

- [ ] **Step 1:** contract first: `just build-api && just generate-client && pnpm --filter front typecheck` (after T6).
- [ ] **Step 2 (RED):** page tests: renders registry rows with effective value + source badge; scope switch refetches with params; toggle opens confirm dialog showing OLD→NEW; submit calls mutation + invalidates effective queries; degraded banner when payload.degraded; URL state round-trip (`scope_id`, `tenant_id` snake_case); i18n parity asserted by existing namespace coverage test.
- [ ] **Step 3 (GREEN):** implement page + query module mirroring `authed/staff/audit-logs.tsx` patterns (DataTable, cursor pagination where lists need it, drawers `_`-prefixed). Toasts via standard failure path.
- [ ] **Step 4:** `pnpm --filter front typecheck && pnpm --filter front exec vitest run src/routes/authed/staff/feature-flags.test.tsx && pnpm --filter front check:design-system && just react-doctor` green. Commit `feat(front): staff feature-flags page — effective values per scope, audited toggles`.

## Task T11 — Observability close-out

- [ ] Verify + document: audit-log staff page filters by the two new action constants (no code expected — constants flow through `AuditActionsRegistry` automatically; assert once in a spec that both keys appear in `AuditActionsRegistry.All`). Revision surfaced in staff UI footer of the page (small addition to T10 if missed). Commit `chore(flags): observability — registry assertions, revision visible`.

## Task T12 — Consumer migration (one commit each) + static registry deletion

Order chosen so the least-risky consumer flips first:

- [ ] **T12a:** `routes/index.tsx` marketing flags → `useFeatureFlag`/context read (SSR surface; values arrive pre-hydration). Update `index.test.tsx` mocks. Commit `refactor(front): marketing flags move to runtime resolution (#1038 candidates unblocked)`.
- [ ] **T12b:** `signup.tsx` signups gate → same swap. Commit `refactor(front): signup gate moves to runtime resolution`.
- [ ] **T12c:** `field-validation.tsx` demo route guard → same swap (route stays fully unmounted when off). Commit `refactor(front): field-validation demo gate moves to runtime resolution`.
- [ ] **T12d (flag-day-free deletion):** delete `apps/front/src/lib/flags.ts`, `flags.test.ts`, the Docker ARG/ENV pair (`apps/front/Dockerfile:38-39`), AND the compose `build.args` block feeding it (`apps/front/docker-compose.test.yml:218-222`) — the replacement enable path is T12e, landed BEFORE or WITH this commit so the e2e suite never loses the route; `git grep VITE_FEATURE apps/front/src` returns ONLY the dev-override loader and `git grep VITE_FEATURE_FIELD_VALIDATION_DEMO_ENABLED` returns NOTHING anywhere; full front suite + typecheck + build green. Commit `chore(front): static flag registry + build-time demo-flag plumbing deleted — runtime system is sole source`.

### Task T12e — e2e enable path for the demo route (server-side, replaces compose build args)

Why: the three e2e suites that `goto('/field-validation')` (`apps/front/e2e/field-validation.spec.ts:116-118`, `drawer-description-contrast.spec.ts:579`, `toast-contrast.spec.ts:2416`) hard-assert `field-validation-title` visible. They run in the authed `chromium` project (`storageState: STAFF_ADMIN_STORAGE_STATE`, `apps/front/playwright.config.ts:84-86`) against the REAL API container under `ASPNETCORE_ENVIRONMENT=Testing` (`docker-compose.test.yml:123`). Today's enable lever is a front-image BUILD arg (`docker-compose.test.yml:218-222`), which T12d deletes — and whose failure mode is exactly the trap the r1 review flagged: with the ARG gone, compose's leftover `args:` key becomes a silent no-op, the image builds with the flag off, the route renders `View404`, and the `front-e2e` job reds. Replacement: turn the flag on SERVER-SIDE, per environment, using the repo's existing demo-fixture gating.

**Files:** [new] `apps/api/Modules/FeatureFlags/Seeders/FeatureFlagOverrideDemoSeeder.cs` (+ `.Spec.cs`). Nothing else: `IEntitySeeder` implementations are reflection-discovered and run during EF seeding (same discovery path as `PermissionSeeder`).

- [ ] **Step 1 (RED):** `FeatureFlagOverrideDemoSeeder.Spec`: (a) `IsDemo == true` on the seeder type — the exact switch the `AppDbContext` production filter reads (`apps/api/Data/IEntitySeeder.cs:22-24`, filter at `AppDbContext.cs:240-244`; the existing `SeederGateProbeSpec` already proves that filter's Production branch end-to-end by asserting demo rows stay absent under Production, so a correctly-flagged seeder inherits that proof); (b) seeds EXACTLY ONE row: `(key = 'dev.field_validation_demo_enabled', scope = FeatureFlagScope.Global, enabled = true)`; (c) idempotent — a second run inserts nothing (backed by the filtered unique index from T2).
- [ ] **Step 2 (GREEN):** implement the seeder; `Order` after the permission/user seeders its rows depend on; `updated_by` follows the demo-seed actor convention the other Testing fixtures use.
- [ ] **Step 3 (both-directions proof):** OFF-side: extend `apps/front/src/routes/field-validation.test.tsx` (today it mocks the flag TRUE and only exercises the ON side) to assert the route resolves to `View404` when the resolved map carries `false` for the key — the unit-level shape of "not in production". ON-side in the real stack: proven by the EXISTING CI specs listed above (any regression reds them loudly); per the captain verification policy that stack runs in CI front-e2e (4/4 shards on the PR), never locally. NOT-in-production: doubly guaranteed — the seeder physically cannot run there (`IsDemo` filter) AND the declared default is `false` (D1), so a production DB holds no winning row.
- [ ] **Step 4:** focused API suites green + api-check. Commit `feat(flags): Testing-only seeded global override keeps /field-validation e2e-reachable without image build args`.

Net effect: the four container images stay byte-identical across environments; the flag state that differs is DATA (which override rows exist in the boot database), matching the D9 environment-precedence rule.

- [ ] Rollback story: each of T12a–c independently revertible; deletion last; T12e's seeder is independently revertible (remove the class + delete the single seeded row; no schema involvement).

## Task T13 — Gates + delivery (implementation lane, not this PR)

- [ ] Focused API suites (FeatureFlags/AuditLogs/Permissions) under heavy.sh; then ONE full `pnpm --filter front test`; api-check; `just ci-migration-expand-contract`; `just ci-front`. The edited `apps/front/docker-compose.test.yml` and the T12e seeder are validated by CI's own front-e2e run (never booted locally — captain policy 2026-08-23): a missing demo route or a broken seeder reds those shards.
- [ ] e2e: add tags per `docs/guides/e2e-tags.md` vocabulary to a new spec exercising flip-in-staff → observe-on-marketing (CI runs it; do NOT boot the local stack).
- [ ] PR body refresh; tracking note on #1051 (plan location, implementation lane pointer).

## Proofs this plan promises (mapped to requirements)

| Requirement (issue #1051) | Proof |
|---|---|
| Runtime evaluation | T6 PUT changes effective value without rebuild — integration spec + e2e |
| One source of truth | T4/T7: API resolves, front never computes; sync spec pins registry↔generated artifact (T1) |
| Typed + shared | T1 generated union; T7 `@ts-expect-error` typo proof; C# registry compile-checked writes |
| SSR-safe | T8: dehydrated context, first-paint final values, no flash; no client refetch |
| Scoping explicit | T3 spec enumerates the full order incl. fallbacks; D2 documents it |
| Fail-safe | T8: defaults + `degraded` + single dedup'd warning; nothing throws |
| Local override | T9: DEV-only wins, prod-build loud warning |
| Observable + audited | T6 audit rows (same-txn), T10 staff UI, T11 registry assertions |
| Demo route e2e-reachable in the Testing stack, unreachable in prod | T12d/T12e: compose build args deleted; `IsDemo`-gated seeder plants the global override under Testing only; existing CI specs assert the route visible; component test pins `View404` when off |

## Anything in the brief that turned out wrong

- "Two existing static registries": `apps/old-front` was retired 2026-08-22; only `apps/front/src/lib/flags.ts` survives. Plan migrates one registry (D11).
- Brief said settings/audit modules would show a reusable "settings writer": there is no Settings *service* — Settings module is handlers-only; audit writing goes through `IAuditLogService`, cited correctly above.

## Unverified until implementation/CI

- Exact TanStack Start serialization of added `RootRouteContext` fields (expected: automatic, same as i18n resources — verified pattern, but size limits untested with real payloads).
- Generator ergonomics inside `packages/scripts-cs` (recipe name, invocation point relative to `generate-client`).
- Whether the anonymous effective endpoint needs a dedicated rate-limit policy once real traffic numbers exist (starts on `AnonymousOther`).
