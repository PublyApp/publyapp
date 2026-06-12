# Roadmap: Handler Contract → Architecture Guards → Lint/Analyzer Framework

> Status: Phase 0 done · Phase 1 done · Phase 2 in progress (PUBLY0001–PUBLY0010 all enforced) · Created 2026-05-23 · Owner: @radandevist
>
> Sequences three open issues into small, interruptible PRs so they can be
> picked off individually.

## Issues covered

| Issue | Title | Role in the chain |
| --- | --- | --- |
| [#431](https://github.com/radandevist/publyapp/issues/431) | Standardize API handler file contract | **Foundation** — defines the contract and renames `Handle{Operation}` → `Handle`. |
| [#357](https://github.com/radandevist/publyapp/issues/357) | Classify & expand architecture enforcement guards | **Cheap enforcement** — reflection/xUnit guards that lock in #431. |
| [#350](https://github.com/radandevist/publyapp/issues/350) | Custom PublyApp lint/analyzer framework | **Deep enforcement** — Oxlint plugin + Roslyn analyzer framework. |

## Sequencing principle

```
#431  ──►  #357  ──►  #350
foundation  cheap lock-in  heavy framework
```

- **#431 first** so there is a clean, consistent contract to enforce.
- **#357 second** because reflection-based guards are cheap, low-risk, and lock
  in the #431 rename. Its *handler-enforcement* guards depend on #431; some of
  its guards are independent and can start earlier.
- **#350 last** because it is a multi-PR framework build that both #357 and the
  #350/#357 addenda explicitly defer the syntax/semantic rules to.

### Dependency reality

- #431 must land before #357 **Wave B** (you rename first, then lock the rename).
- #350 must land before #357's *analyzer-backed* rows (#357 says so explicitly).
- #357 reflection guards (Wave A) and the #350 framework are otherwise
  independent and could be parallelized.

## Codebase facts (as of 2026-05-23)

- Handler files: **152** under `apps/api/Modules/<Domain>/Handlers/<Scope>/`.
- Suffixed `Handle{Operation}` entrypoints to rename: **~98** across 8 domains.
- Endpoint-mapping references to `Handle*`: **100** under
  `apps/api/Modules/<Domain>/Endpoints/`.
- `*.Spec.cs` files referencing handler methods directly: **0** — integration
  tests hit HTTP endpoints, not handler methods. The rename is mechanical and
  low-risk on the test side.
- Existing architecture specs: `apps/api/Lib/Architecture/`
  — `ArchitectureGuard.Spec.cs`, `OpenApiContract.Spec.cs`,
  `ServiceArgsRecordConvention.Spec.cs`.
- Current docs **contradict** #431: `docs/guides/csharp-coding-standards.md:249`
  says *"Use `HandleCreateUser`, NOT just `Handle`"*. Phase 0 reverses this.
- Workspace packages: `packages/{_tsconfig,client-ts,scripts-cs,shared-ts}` —
  the new JS plugin slots in as a sibling.

### Per-domain rename load (#431)

| Domain | `Handle*` methods |
| --- | ---: |
| Users | 30 |
| Profiles | 21 |
| Invitations | 13 |
| Auth | 12 |
| Tenants | 10 |
| SystemNotices | 6 |
| AuditLogs | 4 |
| Permissions | 2 |

---

## Phase 0 — #431 Handler file contract (foundation) ✓ DONE

Define the contract, then apply the rename smallest-domain-first so the pattern
is proven on tiny domains before the large ones.

> **Done.** All `Handle{Operation}` → `Handle` renames landed. Handler-file contract
> (entrypoint `Handle`; HTTP `Body`/`Query`/`Result`/`Response`/`Item`/`*Validator` as
> top-level siblings, not nested; `PUBLY0004` enforces the `Dto`-suffix ban on wire-contract
> types) is documented in `docs/guides/csharp-coding-standards.md` and enforced by the
> analyzer framework. See `docs/guides/lint-rules.md` → PUBLY0004.

| PR | Scope | Verify |
| --- | --- | --- |
| **0.1** | **Docs/contract only.** Rewrite `csharp-coding-standards.md` handler sections (§193–249, 316–334, 590–607 — the §249 `HandleCreateUser` rule is the opposite of the target). Add the handler-file contract (entrypoint `Handle`; HTTP `Body`/`Query`/`Result`/`Response`/`Item`/`*Validator` as top-level siblings, not nested; no `DbContext` in handlers; param order; type-placement rules). Point `AGENTS.md` at the guide. Audit for nested public HTTP contract types and fix any (sample suggests ~none). | doc review; `just build-api` if any code touched |
| **0.2** | Rename `Permissions` (2) | `just build-api` + Permissions specs |
| **0.3** | Rename `AuditLogs` (4) | `just build-api` + AuditLogs specs |
| **0.4** | Rename `SystemNotices` (6) | `just build-api` + SystemNotices specs |
| **0.5** | Rename `Tenants` (10) | `just build-api` + Tenants specs |
| **0.6** | Rename `Auth` (12) | `just build-api` + Auth specs |
| **0.7** | Rename `Invitations` (13) | `just build-api` + Invitations specs |
| **0.8** | Rename `Profiles` (21) — split if large | `just build-api` + Profiles specs |
| **0.9** | Rename `Users` (30) — split if large | `just build-api` + Users specs |

**Per-rename-PR checklist:**

- [ ] Rename `Handle{Operation}` → `Handle` on the public Minimal API delegate.
- [ ] Update the matching endpoint-mapping reference(s).
- [ ] Keep descriptive names on private helpers (e.g. `HandleSuccessAsync`).
- [ ] Preserve behavior and API contract (no signature/route changes).
- [ ] `just build-api`; run that domain's specs.

**Unblocks:** #357 Wave B (handler-enforcement guards).

---

## Phase 1 — #357 Architecture guards (cheap enforcement, reflection/xUnit) ✓ DONE

Extends `apps/api/Lib/Architecture/*.Spec.cs`. Each guard reports concrete
offenders (type/property names), not a generic failure.

> **Done.** Architecture guards implemented in `apps/api/Lib/Architecture/`. Key rules
> (service dependency boundaries, handler naming, permission enforcement) are enforced by
> Roslyn analyzers PUBLY0007 (staff handler service variants) and the architecture spec
> suite. See `docs/guides/lint-rules.md` for the full rule inventory.

### Wave A — independent of #431 (can start in parallel with Phase 0)

| PR | Guard |
| --- | --- |
| **A.1** | Shared discovery helper: assembly/handler/service-type discovery + generated-code exclusion (`client-ts`, OpenAPI, EF migrations, build outputs). |
| **A.2** | Route constants must not use route constraints (`:guid`, `:int`). |
| **A.3** | Refine `ArchitectureGuard.Spec.cs`: no `PatchField<T>` in HTTP wire DTOs (report offending type/property). |
| **A.4** | Generalize `ServiceArgsRecordConvention.Spec.cs` from an issue-specific list into a convention guard (3+ domain params → `{Action}{Domain}Args`), with an explicit allowlist/baseline. |

### Wave B — depends on Phase 0 (#431) landed

| PR | Guard |
| --- | --- |
| **B.1** | Public handler entrypoint methods are named `Handle`, not `Handle*`. |
| **B.2** | Handler classes do not inject/store/parameterize `MainApiDbContext`. |
| **B.3** | Public HTTP contract + validator types are top-level siblings, not nested public types inside handler classes. |
| **B.4** | `AbstractValidator<T>` in handler namespaces targets a top-level `Body`/`Query` type. |
| **B.5** | Handler namespaces match folder path; handler file name matches primary class. |

### Wave C — baseline-then-ratchet (current code may not be clean)

| PR | Guard |
| --- | --- |
| **C.1** | Service dependency boundaries: services depend on DbContext + infrastructure only, not other domain services. Start with baseline/allowlist; ratchet toward zero. |
| **C.2** | Protected staff/tenant endpoints carry permission metadata (`.WithPermission()`); allowlist anonymous/system routes. |
| **C.3** | Handler suffix naming conventions (`*ForStaff`, `*ForTenantAsStaff`, `*ForTenant`, `*Anonymous`). Baseline if not clean. |

### Doc PR

| PR | Scope |
| --- | --- |
| **D.1** | Document the architecture-test-vs-Roslyn classification in `test-conventions.md`; link the syntax/semantic rows to #350. |

**Acceptance (#357):** ≥3 high-signal guards implemented or explicitly
baselined with actionable messages; guards run in the normal API test project;
Roslyn-dependent rules are *not* implemented here.

**Unblocks:** locks #431; defers analyzer-only rules to Phase 2.

---

## Phase 2 — #350 Lint/analyzer framework (deep enforcement, multi-PR)

Two independent tracks. Each goes: **scaffold → test harness → prove loading →
1–2 non-whitespace rules → layout rules → domain rules.** No broad production
enforcement until a rule's target code is clean or exclusions are deliberate.

### JS/TS track (Oxlint plugin)

| PR | Scope |
| --- | --- |
| **JS.1** | Scaffold `packages/lint-ts` (workspace pkg, formerly `packages/oxlint-plugin-publy`) + RuleTester harness + one Oxlint `jsPlugins` CLI fixture. Prove the plugin loads through the existing `pnpm lint` path with **no enforcement**. |
| **JS.2** | First high-signal rule, one per PR — candidate order: `prefer-specific-lodash-imports`, `no-direct-dayjs-in-components`, `no-console-in-source`, `no-raw-mui-textfield-register`, `no-native-html-in-mui-surfaces`, `no-manual-response-message-translation`. |
| **JS.3** | Evaluate ESLint Stylistic via `jsPlugins` for layout rules (`padding-line-between-statements`, `lines-between-class-members`, `no-multiple-empty-lines`); fall back to a narrow `publy/*` rule only if compatibility/perf is poor. |

Keep `oxfmt` unchanged — it stays the formatter; policy checks live in Oxlint.

### .NET track (Roslyn analyzer)

| PR | Scope | Status |
| --- | --- | --- |
| **NET.1** | Scaffold `apps/api/Analyzers/PublyApp.Analyzers` + `PublyApp.Analyzers.Tests`, referenced **analyzer-only** (`OutputItemType=Analyzer`, `ReferenceOutputAssembly=false`), `.artifacts` output via `Directory.Build.props`. Add `DiagnosticIds`/`DiagnosticCatalog`. Prove a trivial analyzer loads at build with no runtime dependency from the API assembly. | ✓ done |
| **NET.2** | `PUBLY0001` — disallow null-forgiving `!` in production C#. Disabled-by-default descriptor; enabled via `.editorconfig` once code is clean. | ✓ shipped + enforced |
| **NET.3** | `PUBLY0002` — disallow `?? throw`. | ✓ shipped + enforced |
| **NET.4** | `PUBLY0003` — disallow `ToLower()`/`ToLowerInvariant()` as comparison/dispatch. | ✓ shipped + enforced |
| **NET.5** | `PUBLY0004` — disallow `Dto` suffix on handler wire-contract types (`Body`/`Query`/`Result`/`Response`/`Item`). | ✓ shipped + enforced |
| **NET.6** | `PUBLY0005` — replace inline FluentValidation chains on `JsonElement` getters with `JsonElementRules.*` helpers. | ✓ shipped + enforced |
| **NET.7** | `PUBLY0006` — cache request DTO getter results in locals when called 2+ times or returning parsing-sensitive values. | ✓ shipped + enforced |
| **NET.8** | `PUBLY0007` — staff handlers must call `*ForStaff*` service method variants. | ✓ shipped + enforced |
| **NET.9** | `PUBLY0008` — prefer `is null` / `is not null` pattern checks over `== null` / `!= null` (expression-tree contexts exempted). | ✓ shipped + enforced |
| **NET.10** | `PUBLY0009` — forbid `TypedResults.Forbid()`; require `TypedProblems.*` (RFC 7807). | ✓ shipped + enforced |
| **NET.11** | `PUBLY0010` — never log session-token values (`X-Session-Token` / `SessionToken`). | ✓ shipped + enforced |
| **NET.12** | Layout rules (`PUBLY01xx`) after framework is stable; prefer built-in `IDE2000`/`IDE0055` where reliable. | planned |

> All shipped PUBLY rules (currently PUBLY0001–PUBLY0010) are enforced via `.editorconfig`
> (`dotnet_diagnostic.PUBLYxxxx.severity = warning`) combined with
> `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` in `Directory.Build.props`.
> Rule details, sources, and spec locations: `docs/guides/lint-rules.md`.

**Per-rule test matrix (both tracks):** valid fixture · invalid fixture (message + location) · generated-code ignored · config enable/disable · code-fix fixture where one exists.

### Closeout

| PR | Scope |
| --- | --- |
| **X.1** | Flip on the analyzer-backed rows from #357 now that the framework exists; close the #350/#357 addenda. |

---

## Cross-cutting conventions

- **One rule / one domain per PR** — small and interruptible.
- A rule is enabled only after existing code is clean **or** scoped exclusions
  are deliberate.
- Generated outputs (`packages/client-ts`, OpenAPI docs, EF migrations, build
  artifacts) are always excluded unless a rule explicitly targets them.
- C# warnings are errors in build, so enabling a Roslyn rule as `warning` in
  `.editorconfig` enforces it.
- No new code in legacy `Modules/{Shared,Staff,Tenant}` unless migrating.

## Open questions (carry from the issues)

- ~~JS plugin package name: `oxlint-plugin-publy` vs `eslint-plugin-publy` vs
  generic `lint-rules`?~~ Resolved: renamed to `packages/lint-ts` (`@org/lint-ts`); `publy/*` rule namespace unchanged.
- Analyzer location permanent at `apps/api/Analyzers/` or later a repo-level
  package if reused beyond the API?
- Analyzer tests under `just test-api` or a separate `just test-analyzers`?
- Layout rules: code fixes from the start, or report-only first?

## Suggested next step

When ready to execute, start with **PR 0.1** (define the contract in docs) — it
is the smallest, unblocks the rename, and reverses the contradicting guidance.
Each phase/PR can then get its own implementation plan as you pick it up.
