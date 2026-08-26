# Lane 1051p — Feature-flag system (API-owned, typed, SSR-safe, scoped, audited): design + implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** PLAN ONLY — this PR ships the plan document and nothing else. Part of #1051 (the plan PR does not close it). Implementation is a follow-up lane.

## Sources read while writing this plan

Every load-bearing claim below was verified against the tree at `develop` = `e13ee04a7`:

| Claim | Source |
|---|---|
| Current static front registry + build-time freeze | `apps/front/src/lib/flags.ts` (+ `flags.test.ts`); Docker ARG/ENV pair only for the demo flag in `apps/front/Dockerfile:38-39` |
| The five live flag consumers | `apps/front/src/routes/signup.tsx:68`, `routes/index.tsx:257,284`, `routes/field-validation.tsx:189`, `routes/index.test.tsx:45` |
| Old-front registry retired 2026-08-22 | AGENTS.md; record `docs/records/2026-08-22-review-old-front-marketing-screens.md`; tag `old-front-final` |
| Root `beforeLoad` context is dehydrated with the router (the i18n transport) | `apps/front/src/routes/__root.tsx` (`resolveRootContext` at line 174, consumed by `RootShell` via `Route.useRouteContext`), `createRootRouteWithContext<{ queryClient }>`, SSR-query integration `apps/front/src/router.tsx` (`setupRouterSsrQueryIntegration`) |
| Authed surfaces are CSR; marketing/auth are SSR | `docs/guides/front/conventions.md` "Rendering Strategy"; `createServerFn` boundary rules same file lines ~283-310 |
| Per-account identity keys on `UserAccount.Id`, not `User.Id` | `apps/api/Modules/Users/Entities/UserAccount.cs` (`user_accounts`: `UserId`, nullable `TenantId`, `Scope`, one row per membership) |
| Audit single construction path | `apps/api/Modules/AuditLogs/Entities/AuditLog.cs` (`AuditLog.CreateEntry`, `AuditActions` constants incl. `SocialAccountConnected` precedent for dotted names); `AuditActionsRegistry` auto-discovers constants by reflection (`AuditActionsRegistry.Spec.cs`) |
| `IAuditLogService.LogAsync(LogManyAsync)` shape | `apps/api/Modules/AuditLogs/Services/AuditLogService.cs` (`CreateAuditLogArgs(UserId, Action, TargetId, Details)`) |
| Permission slices discovered by reflection; new slice = new class wired into scope class | `apps/api/Lib/AppPermissions.cs` (`StaffScopePermissions`/`TenantScopePermissions` property lists), `apps/api/Modules/Permissions/Seeders/PermissionSeeder.cs::GetPermissionsPool()` |
| Slice permission pattern + EN/FR translations | `apps/api/Modules/Settings/Permissions/SettingsPermissionsForTenant.cs` |
| Existing codegen tooling home | `packages/scripts-cs/` (PublyApp.Scripts, run through pinned `just` recipes) |
| Rate-limit policy names | `apps/api/Lib/RateLimiting/ApiRateLimitPolicies.cs` (`AnonymousOther`, `AuthenticatedDefault`, `HeavySearchList`, …) |
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
| `dev.field_validation_demo_enabled` | `false` | Authenticated | Dev-only scaffolding demo route |
| `marketing.customer_logos` | `false` | Public | Invented customer logos stay hidden until real proof exists |
| `marketing.social_proof` | `false` | Public | Rating + setup claim hidden until user evidence exists |

Naming note: wire keys move to snake_case to match the repo's multi-word wire-format rule (AGENTS.md "wire-format option values … snake_case"). The migration maps old camelCase JS paths to these keys explicitly (Task T12).

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
3. Flip consumers ONE AT A TIME: `signup.tsx` (signups_enabled), `index.tsx` ×2 (marketing), `field-validation.tsx` (demo). Each consumer swap is its own commit with its test updated (`index.test.tsx` mocks the context instead of `FEATURES`).
4. Delete `apps/front/src/lib/flags.ts` + `flags.test.ts` + the Docker ARG/ENV pair for the demo flag (grep proves zero remaining `VITE_FEATURE` readers except the dev-override loader itself).

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
