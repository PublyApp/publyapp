# Fallow vs knip: a read-only measurement on this repository

Date: 2026-10-28. Analysis, not a decision. No product, config, dependency or CI change was
made; the only committed file is this record.

Subject: [fallow](https://fallow.tools/docs/) 3.37.0 (Rust binary distributed on npm) measured
against the tooling this repo already has — knip 6.43.0 with its repo-specific
[`knip.ts`](../../knip.ts), oxlint 1.89.0 with the `complexity` ceilings in
[`.oxlintrc.json`](../../.oxlintrc.json), and the custom Oxlint/Roslyn rules under
`packages/lint-ts` and `packages/lint-cs`.

## The three owner wishes

1. **Duplication** — the repo has **no duplication tool** today (jscpd was removed; only a
   historical mention survives in `packages/scripts-ts/src/ci-gate-removals.json`).
2. **Health / complexity** — enforced only through oxlint's `complexity` rule, whose ceilings are
   `60` for `apps/front/src/**`, `90` for tests, `125` elsewhere.
3. **Architecture boundaries** — enforced through a handful of hand-written guards and the
   `publy/*` Oxlint rules, never by a generic layering tool.

## Method

- Worktree `lane/fallow-measure` at develop `03d1edb3c`. Linux x64, Node 24.19.0, pnpm 10.13.1.
- Dependencies installed locally (`pnpm install --frozen-lockfile --ignore-scripts`, 25.7 s) so
  that knip's and fallow's resolution conditions are the same. Knip cannot be measured fairly
  without `node_modules`; a git-clean tree, a warm pnpm store.
- Every fallow invocation ran **read-only** through `npx --yes fallow@3.37.0 …`. Nothing was added
  to `package.json`, no fallow config was created, no workflow or justfile recipe was touched, no
  guard was disabled.
- Timings are `/usr/bin/time` wall-clock on this machine, single run each unless stated. Peak RSS
  from the tools' own `ru_maxrss`.
- `--no-cache` on every subcommand run so the numbers are cold and comparable; the cache itself is
  measured separately (bare runs, cold and warm).
- **Telemetry disabled explicitly, three ways**: (a) fallow's default is already off — verified
  with `fallow telemetry status` → `Telemetry: off (default)`; (b) an explicit decision was then
  recorded with `npx fallow telemetry disable`, which writes `~/.config/fallow/telemetry.json`,
  after which status reads `Telemetry: off (user_config)` / `Explicit decision: yes`; (c) every
  analysis exported `FALLOW_TELEMETRY=off`. No `FALLOW_TELEMETRY=inspect` payload was captured and
  no network reporting was observed; that is fallow's own reported state, not an independent
  packet-level proof (see Limits).
- `npx fallow --version` reported `fallow 3.37.0` and `verified: yes … fallow 3.37.0 signed`.

## Runtime and footprint, measured

| Command | Wall clock | Peak RSS | Exit |
| --- | --- | --- | --- |
| `pnpm exec knip` (as CI runs it) | **24.4 s** | 648 MB | 0 — 0 findings, 29 hints |
| `pnpm exec knip --include exports,types,files` | 49.3 s | — | 0 — 0 findings, 29 hints |
| `fallow dead-code --no-cache` | **7.4 s** | 197 MB | 1 — 67 findings |
| `fallow dead-code --type-aware --no-cache` | 10.0 s | 578 MB | 1 — 64 findings |
| `fallow dupes --no-cache` (default `mild`) | **3.8 s** | 194 MB | 0 — 6.72 % |
| `fallow dupes --mode strict --no-cache` | 2.1 s | 194 MB | 0 — identical to `mild` |
| `fallow health --hotspots --no-cache` | **4.6 s** | 233 MB | 0 — 552 above threshold |
| `fallow architecture --no-cache` | 2.6 s | 192 MB | 1 — 1 cycle |
| `fallow` (bare = dead-code + dupes + health), cold | 12.2 s | 299 MB | 0 — see below |
| `fallow` bare, warm cache | 2.1 s | 264 MB | 0 |
| `pnpm exec oxlint --quiet .` (baseline) | 19.9 s | 2.0 GB | 0 — 0 errors over 1,291 files |
| `pnpm exec oxlint -f json .` (same run, warnings kept) | 9.5 s | — | 0 — 592 diagnostics, **all warnings, 0 from `complexity`** |

First `npx fallow --version` took 14.4 s (cold npm cache, package fetch); the binary itself starts
in milliseconds, so the runtimes above are analysis time, not install time.

Two things worth flagging in that table before any recommendation:

- **`fallow` bare does not enforce its own gates in JSON output.** On this green-ish tree the bare
  run observed `67` error-severity findings and `552` health findings and **still exited 0**:
  `[W] gates … failed, but bare fallow does not enforce them in --format json. To exit 1 on them,
  pass --fail-on-issues.` A CI step wired as `npx fallow --format json` would be a step that can
  never fail.
- **The cache is real and lives in the repo.** Without `--no-cache`, fallow wrote
  `.fallow/` (20 MB: `graph-cache.bin`, `cache.bin`, `churn.bin`) into the worktree root. It
  ships its own `.fallow/.gitignore` containing `*`, so `git status` stays clean and the repo's
  `.gitignore` needs no change — but 20 MB of untracked state appears on every clone that runs it.
  The 12.2 s → 2.1 s cold-to-warm difference is what that cache buys.

## Wish 1 — duplication: net-new capability

There is no duplication tool to compare against, so this section measures fallow alone.

Default mode (`mild`, which fallow resolves from `.fallowrc` absence — confirmed via
`fallow config`, which reports `"mode":"mild","minTokens":50,"minLines":5,"minOccurrences":2`):

| Metric | `mild` (default) | `strict` | `weak` |
| --- | --- | --- | --- |
| Files analysed | 833 | 833 | 833 |
| Lines in corpus | 163,600 | 163,600 | 163,600 |
| Duplicated lines | 10,988 | 10,988 | 16,004 |
| Duplication % | **6.72 %** | 6.72 % | 9.78 % |
| Clone groups | 238 | 238 | 341 |
| Clone families | 173 | 173 | 243 |
| Clone instances | 569 | 569 | 833 |

`--mode strict` produced a **byte-identical group set** to the default: same 238 fingerprints,
same 6,627 grouped lines. Only `weak` moved. Whatever `strict` changes, this corpus has no case
that distinguishes it from `mild` — so "the strict number" in this record is not evidence that
strict works, only that it produced nothing different here.

**Top 5 groups by spread** — every one of them is the generated Kiota client,
`packages/client-ts`, which the repo treats as an output artifact and never hand-edits:

| # | Spread | Lines | Instances | Where |
| --- | --- | --- | --- | --- |
| 1 | 10 | 32 | 2 | `packages/client-ts/src/staff/profiles/item/permissions/item/index.ts:51-82` ↔ `…/staff/tenants/item/profiles/item/permissions/item/index.ts:51-82` |
| 2 | 10 | 19 | 2 | `…/staff/profiles/item/users/assignmentResolution/index.ts:38-56` ↔ `…/staff/tenants/item/profiles/item/users/assignmentResolution/index.ts:38-56` |
| 3 | 8 | 27 | 2 | `…/staff/profiles/item/permissions/index.ts:43-69` ↔ `…/staff/tenants/item/profiles/item/permissions/index.ts:43-69` |
| 4 | 8 | 22 | 2 | `…/staff/profiles/item/users/index.ts:73-94` ↔ `…/staff/tenants/item/profiles/item/users/index.ts:76-97` |
| 5 | 8 | 19 | 4 | `…/staff/{tenantUsers,tenants/item,tenants/item/users/item,users/item}/reactivate/index.ts:36-54` |

**Top 5 families by duplicated lines** — this is where the actionable work is:

| Duplicated lines | Groups | Files |
| --- | --- | --- |
| 269 | 6 | `apps/front/src/routes/authed/staff/profiles/$profileId/_profile-edit-details-drawer.tsx` ↔ `…/tenants/$tenantId/profiles/_profile-edit-details-drawer.tsx` |
| 260 | 3 | `packages/scripts-ts/src/check-ci-drift.ts` ↔ `packages/scripts-ts/src/gen-reason-ref.ts` |
| 168 | 3 | `packages/scripts-ts/src/check-actions-pinned.ts` ↔ `packages/scripts-ts/src/check-actions-pins.ts` |
| 142 | 3 | `apps/front/src/routes/authed/staff/_staff-user-error-views.tsx` ↔ `apps/front/src/routes/authed/staff/staff-users/_user-details-error.tsx` |
| 125 | 1 | `apps/front/src/routes/authed/staff/invitations/new.tsx` ↔ `apps/front/src/routes/authed/staff/profiles-new.tsx` |

**Distribution** (instance-lines = `line_count × instances`, total 16,080 — note this is a
different denominator from fallow's 10,988 unique duplicated lines, and is used only to say *where*
duplication concentrates):

| Tree | Instance-lines | Share |
| --- | --- | --- |
| `apps/front` | 12,787 | 79.5 % |
| `packages/scripts-ts` | 1,136 | 7.1 % |
| `packages/lint-ts` | 1,032 | 6.4 % |
| `packages/client-ts` (generated) | 882 | 5.5 % (17 groups) |
| `packages/shared-ts` | 225 | 1.4 % |
| `apps/api` | 18 | 0.1 % |

By file kind: CSS-only groups = 130 instance-lines (0.8 %) — the single largest group by line
count is the `@font-face` block in `apps/front/src/styles/app.css` duplicated three times
(22 lines × 3); test-only groups = **0**. No group mixes generated and hand-written files.

Reading: the headline 6.72 % is honest but needs exclusions before it is actionable. Excluding the
generated client and the `app.css` font declarations, the report is essentially "48 route files
under `apps/front/src/routes` repeat error-view and drawer shapes, and three pairs of
`packages/scripts-ts` guards are near-copies".

## Wish 2 — health / complexity: a real gap, but the thresholds do not line up with this repo

`fallow health --hotspots` on the same tree:

- 1,459 files, 23,838 functions, 379,513 LOC; **average cyclomatic 1.8, p90 cyclomatic 3**,
  maintainability 91.8 ("good").
- Default thresholds: **cyclomatic 20, cognitive 15, CRAP 30, unit size 60**.
- **552 functions above threshold** (162 critical, 130 high, 260 moderate); **1,160 functions
  above 60 LOC**.

The worst entries in the "large functions" list are real, and they are worth seeing:

| File | Symbol | Lines |
| --- | --- | --- |
| `apps/front/scripts/guards/check-zindex-guard.mts:881` | `scanZIndexFile` | 3,246 (file is 5,286) |
| `apps/front/src/components/ui/drawer-form.test.tsx:10060` | `describe("drawer surface flex chain guard (#990)")` | 3,164 (file is 13,223) |
| `apps/front/src/styles/drawer-description-contrast.test.ts:3509` | `describe(…)` | 2,037 (5,545) |
| `packages/lint-ts/src/publy/func-style-config.test.ts:689` | `describe(…)` | 1,526 (2,214) |
| `apps/front/e2e/toast-contrast.spec.ts:246` | `readBrowserPaint` | 1,136 (3,449) |

I checked the top two spans against the files on disk: the files really are 5,286 and 13,223 lines,
so the spans are not a parser artefact — this repo does contain functions and `describe` blocks
thousands of lines long.

**Overlap with the oxlint ceilings: none, by construction.** The repo's lint gate is green today:
`pnpm lint` runs `oxlint --quiet .` (errors only), and the full run is **0 errors, 592 warnings**
over 1,291 files — with **`complexity` contributing 0** of them, at error severity, which means the
ceilings are not binding on any function in the tree. The ceilings are 60 (`apps/front/src`), 90
(tests), 125 (everything else); fallow's default gate is 20. Any function between 21 and 60 is
reported by fallow and invisible to oxlint. So:

- fallow measures dimensions the repo does **not** enforce at all: function size in LOC, cognitive
  complexity, CRAP score.
- but 552 findings at threshold 20 is not "552 problems" — it is "the repo's ratified ceilings are
  3-6× looser than fallow's defaults". Adopting the gate as shipped means a red CI on day one, on
  code the owner already decided is acceptable.
- the two tools cannot contradict each other today because they never operate in the same band.

Hotspots (churn × complexity, 521 files over 6 months) are dominated by the same artifact as the
duplication report — #1 is `packages/client-ts/src/models/index.ts` (score 50.0, 46 commits, 182
fan-in), the generated client. #2 `packages/scripts-ts/src/check-ci-gate-structure.ts` (27.5) and
#3 `apps/front/src/routes/authed/tenant/posts/$postId/edit.tsx` (24.3) are the first genuinely
reviewable entries.

## Wish 3 — architecture boundaries: fallow's model cannot express this repo's rules

Unconfigured, fallow reports **0 boundary violations** (it has nothing to check) on an
`architecture` run of 2.6 s. Its only architecture finding on this tree is the one circular
dependency that `dead-code` also reports:
`apps/front/scripts/guards/check-design-system-runner-probe.mts` ↔
`check-design-system.test.mts`.

Its model, read from `fallow config-schema` (`BoundaryConfig` → `BoundaryZone`, `BoundaryRule`,
`BoundaryCoverageConfig`, `BoundaryCallsConfig`, plus presets `layered` / `hexagonal` /
`feature-sliced` / `bulletproof`):

- **zones** = named groups of **file-path globs** (`patterns`, `autoDiscover`, `root`);
- **rules** = `{ from: zone, allow: [zones], allowTypeOnly: [zones] }` — an import allow-list
  between zones;
- **coverage** = `requireAllFiles` plus `allowUnmatched` globs;
- **calls** = per-zone `forbidden` `{ from, callee }` banned-call rules.

Mapped against what the repo actually enforces today:

| Existing rule | Mechanism | Expressible in fallow? |
| --- | --- | --- |
| `publy/no-package-src-import` (`@org/client-ts/src/…`, `@org/shared-ts/src/…` banned) | Oxlint, **module-specifier** match | **No.** Both specifiers resolve to the same file, so a path-zone model cannot tell them apart. |
| `check-shared-ts-import-paths` (a `shared-ts` module must have exactly one front-reachable path) | ts-morph, re-export graph | **No.** It is about re-export creating a second resolvable path, not about which zone is imported. |
| `check-server-static-imports` (named import must exist in the installed `srvx/static`) | AST + live `import()` | **No.** Needs the runtime module surface. |
| `check-column-type-imports` (specific type names banned from `@tanstack/react-table`) | ts-morph, symbol level | **No.** Symbol-level, not zone-level. |
| `check-utility-boundaries` (`Intl`/`navigator.clipboard` only in two canonical files) | ts-morph, real global symbol resolution | **Partially.** `calls.forbidden` can name a callee per zone, but it matches the written name, not the resolved global symbol, and cannot reproduce the guard's synthetic `globals.d.ts` resolution. |
| `check-e2e-shared-constants` (no re-declaring a constant `shared-ts` exports) | AST declaration comparison | **No.** |
| "front must not import API sources" | **structural**: `apps/front` has no dependency on `apps/api`, and `apps/api` contains no TS modules — verified: no front file *imports* `apps/api`, the three textual occurrences are comments citing API files | Nothing to add; there is no TS edge to rule on. |

So fallow **fully expresses none** of the repo's existing TS boundary rules and only roughly
approximates one (`check-utility-boundaries`, and only for a callee spelled exactly as written).
It would add exactly one thing the repo does not have: **generic zone layering**
("`apps/front/src/routes/**` may import `.../lib/**` but not another route's `_parts`",
"`packages/shared-ts` may not import `apps/front`"). That is a real, currently unenforced class of
rule — but it is a new policy, not a port of an existing one, and it is the cheapest part of
fallow to lose.

## Dead code — where fallow stands against knip

`pnpm exec knip` is **green on this commit**: exit 0, **0 findings**, 29 configuration hints. That
zero is the product of a 232-line `knip.ts` (17 declared entry paths/globs for runtime-discovered
files plus the dynamically extracted guard set, 6 scoped `ignoreIssues` file+issue-type pairs, 2
`ignoreDependencies`, 1 directory `ignore`).

`fallow dead-code` on the same tree: **76 total issues = 67 error-severity + 9 warn**, namely
24 unused files, 17 unused exports, 21 unused types, 1 unused dependency, 3 unused class members,
1 circular dependency (`cascade_hidden: 2`), plus 9 warn-level "unused dependency overrides" (all
CVE-fix overrides in the root `package.json`, which the tool itself labels *"may target a
transitive dependency"* — not usable as findings).

### The 24 "unused files": 21 are files knip.ts already declares, 3 are not

| Disposition | Count | Files |
| --- | --- | --- |
| Explicitly declared as `entry` in `knip.ts` | 14 | `apps/api/run-dev.mjs`; `apps/front/deploy/request-counter/server.mjs`; the four `e2e/helpers/*` targets; `scripts/e2e-compose-env.contention-harness.mts`; `scripts/generate/generate-route-tree.mts`; `scripts/generate/generate-suppression-inventory.mts`; `scripts/run-e2e-front.signal-harness.mts`; `src/components/table/column-distribute.typecheck.ts`; `src/components/ui/drawer-guard-tmp-dir.cjs`; `tools/ci/node-24-type-stripping.mts`; `vitest.proofs.config.ts` |
| Covered by knip's `packages/scripts-ts` entry pattern `src/*.ts` | 4 | `src/_review-launcher.fixture.ts`, `src/deploy-images.ts`, `src/gen-reason-ref.ts`, `src/review-front.ts` |
| Inside knip.ts's directory `ignore` (`packages/lint-ts/src/anti-slop/**`) | 2 | `src/anti-slop/effect/index.ts`, `src/anti-slop/effect/rules/no-service-constructor-imports.ts` |
| knip's own config file | 1 | `knip.ts` |
| **Not explained by knip's config** | **3** | `apps/front/scripts/ci/compose-startup.test.mts`; `apps/front/tools/ci/node-24-type-stripping.test.mts`; `apps/front/tools/ci/node-24-type-stripping-lib.mts` |

Those last three are the only genuinely new dead-code signal, and they split two ways:

- `compose-startup.test.mts` — **fallow false positive.** Knip treats `*.test.mts` as an entry;
  fallow does not see the reference because it lives in `apps/front/package.json`'s
  `ciNonVitestCommandInventory` array (a command inventory the guard scripts parse), not in a
  `scripts.*` value. The file is run by CI.
- `node-24-type-stripping.test.mts` — **likely a true positive that knip structurally cannot
  report.** Nothing runs it: not in the justfile, not in `.github/workflows/*`, not in
  `apps/front/package.json`, and `apps/front/vitest.config.ts`'s `include` list does not reach
  `tools/ci/`. Knip's automatic test-entry classification keeps it quiet.
- `node-24-type-stripping-lib.mts` — true positive by transitivity: its only importer is the
  unrun test above.

### The 38 unused exports/types: mostly "over-exported", not dead

I measured each of the 38 names by textual reference count across `apps/` and `packages/`
(`*.ts|*.tsx|*.mts|*.cts`). Seven occur exactly once — the definition itself:

| Name | File | Reading |
| --- | --- | --- |
| `isTransparentColor`, `STACKED_TOAST_COUNT`, `ToastStackSlot` | `apps/front/e2e/helpers/toast-contrast-shared.ts` | dead, in a test-only helper knip does not report exports for |
| `TestStringArrayMap` | `apps/front/src/lib/testing/test-label-map.ts` | dead, same reason (file imported only by `*.test.tsx`) |
| `getThisFilePath`, `getHasInteractiveTerminal` | `packages/scripts-ts/src/review-launcher.ts` | dead, in a file knip declares as an entry |
| `isPopulatedObjectExpression` | `packages/lint-ts/src/anti-slop/shared/dictionary-types.ts` | vendored upstream, inside the directory the repo deliberately excludes |

The other 31 are used **inside their own module** (or as a generic argument) and merely carry an
unnecessary `export` — e.g. `makeRunGh` (defined and called at `review-launcher.ts:542`),
`resolveByPull` (`review-worktree.resolve.ts:318`). Knip does not report this class by design
(`includeEntryExports` defaults to false for entry files) and does not report exports in test-only
files.

### And the same blind spot, twice over

The four findings that `knip.ts` documents, at length, as **false positives** are reproduced
identically by fallow:

| Finding | Where knip.ts says it is a false positive |
| --- | --- |
| `buildTenantActivityQueryParameters`, `tenantActivityQueryOptions` | `ignoreIssues['src/lib/query/staff-tenant-activity.ts']` — "self-consumption false positive: knip does not trace the chain across the `buildStaffQueryOptions()`/`useQuery()` generic boundary" |
| `BulkUnassignStaffProfileUsersInput` | `ignoreIssues['src/lib/query/staff-profile-users.ts']` — "knip cannot trace the type through the `build*()` generic" |
| `CopyAttribution` | `tools/vite/check-context-chunk-isolation.mts` entry comment — a type-probe target whose exports are type-only |

So on the type-generic boundary, fallow is **not better than knip; it is the same**. Enabling
fallow's opt-in type-aware mode (`--type-aware`, which loads the separate `fallow-type-aware`
companion; 10.0 s / 578 MB vs 7.4 s / 197 MB) removed **only the 3 unused class members** and left
all 24 files, 17 exports, 21 types and the 4 findings above untouched. Its own `_meta` reports
`completeness: partial`, `reason_code: dynamic-member-access`.

### What knip's "0" actually means (probe evidence)

To avoid reading knip's zero as "nothing is dead", I temporarily added unused symbols to four
places, plus one orphan file, ran knip, and reverted everything (`git status` clean afterwards):

| Probe | knip result | Interpretation |
| --- | --- | --- |
| unused const in `apps/front/src/components/ui/avatar-initials.ts` | **reported** (`Unused exports (1)`, exit 1) | knip's export analysis is live in `src/` |
| unused const in `apps/front/e2e/helpers/toast-contrast-shared.ts` | not reported | exports of test-only files are out of knip's reporting |
| unused interface in `apps/front/src/lib/testing/test-label-map.ts` | not reported | same (file imported only by tests) |
| unused const in `packages/scripts-ts/src/review-launcher.ts` | not reported | declared entry → exports exempt |
| orphan file `apps/front/e2e/helpers/__probe-orphan-file.ts` | **reported** (`Unused files (1)`) | `e2e/` *is* in knip's graph; it is the export reporting that differs |

Knip's zero is a **policy** result, not a clean tree — and fallow's 67 is what that same tree looks
like under a policy with no entries, no issue-type suppressions, and no test-entry exemption. The
part that is genuinely new signal is 2 files (one unrun test and its library) plus 6 dead
over-exports.

## The bilingual blind side: what fallow cannot cover at all

This repo is TS/JS **and** C#/.NET. fallow analyses TypeScript/JavaScript only. Its own workspace
discovery on this tree says so in passing — it warns that `apps/*` matched `apps/apphost`,
`packages/lint-cs` and `packages/scripts-cs` with no `package.json`, so `apps/apphost`, all of
`apps/api` and both `*-cs` packages are outside its analysis. Of the three wishes, on the C# side:

| Wish | C# coverage today | Covered by fallow? | Plausible counterpart |
| --- | --- | --- | --- |
| Duplication | **none** (no tool; the removed jscpd was TS-only) | **No** | A `.cs` run of any CPD-style duplicate detector, or a house Roslyn analyzer hashing syntax subtrees. Nothing in `packages/lint-cs` does this today. |
| Health / complexity | **none.** `.editorconfig` has 88 `dotnet_diagnostic` entries and not one of them is `CA1502` (cyclomatic), `CA1505` (maintainability) or `CA1506` (class coupling); the only CA15xx present is `CA1507` (use `nameof`) | **No** | Enable `CA1502`/`CA1505` as **warnings** in `.editorconfig`, or add a house analyzer next to the existing ones. Caution: `Directory.Build.props` sets `TreatWarningsAsErrors=true`, so a new warning severity fails every build immediately — it must be introduced with a scoped/no-warn ratchet, not as a sibling of the current settings. |
| Architecture boundaries | **partially** — `packages/lint-cs` ships `PublyApp.Analyzers`, 12 Roslyn analyzers (`NullForgivingOperatorAnalyzer`, `StaffHandlerServiceVariantAnalyzer`, `DtoSuffixHandlerContractAnalyzer`, `EqualityNullCheckAnalyzer`, `CoalesceThrowAnalyzer`, `TypedResultsForbidAnalyzer`, `SessionTokenLoggingAnalyzer`, `ExplicitMemberAccess`, `ToLowerForComparisonAnalyzer`, `InlineFluentValidationChainAnalyzer`, `UncachedBodyGetterAnalyzer`, `EndpointRateLimitAnalyzer`), each with a co-located `*.Spec.cs` and a catalogue in `DiagnosticCatalog.cs` | **No** | Those analyzers already are the C# counterpart for house-specific architecture rules — the same shape fallow's `calls.forbidden` would take, but symbol-resolved and test-pinned. Generic zone layering on the C# side would need a new zone analyzer; nothing today enforces it. |
| Dead code (context) | **partially** — `IDE0051`/`IDE0052` (unread private members) and `IDE0005` (unused using) are warnings and, via `TreatWarningsAsErrors`, build failures. Nothing reports unused public API, unused files or unused dependencies | **No** | A Roslyn analyzer over `SymbolUsageInfo`, or a `dotnet` equivalent of knip. This is the largest uncovered surface of the four. |

So of the three owner wishes, **all three remain uncovered on the C# side under fallow**, and only
one of them (boundaries) has a partial existing counterpart — the Roslyn suite in
`packages/lint-cs`, which would need extending rather than replacing. The sizes, measured on this
commit: **1,080 `.cs` files** (`apps/api`, `apps/apphost`, `packages/*-cs`) against **1,455
TypeScript/JavaScript source files** — 43 % of the repo's source files are invisible to fallow, and
they include the API, where the business logic lives.

## Recommendation, per wish

| Wish | Verdict | Measured cost | Maintenance cost |
| --- | --- | --- | --- |
| **Dead code** (knip's job) | **Keep as is — keep knip.** | knip 24.4 s / 648 MB, currently green. fallow 7.4 s / 197 MB, 67 findings. | Replacing knip means porting 232 lines of `knip.ts` — including the regex that extracts guard entry points from `apps/front/package.json` and the 6 scoped `ignoreIssues` — into a fallow config, and then still needing entries for the 21 runtime-discovered paths fallow flagged. That is a second config to keep truthful, for a 3× speed win and 2 real findings. Not worth it. |
| **Duplication** | **Add fallow alongside.** | 3.8 s / 194 MB standalone; ≈2 s incremental inside a warm bare run. | +1 pinned devDependency (`fallow` 3.37.0: 1.8 MB unpacked main package, `detect-libc`, 8 platform binary packages + `fallow-type-aware`), +1 root config with exclusions (`packages/client-ts`, the `app.css` font block), +1 CI step, +1 failure mode (a percentage threshold). In this repo that step is not free: any new `check:`/`verify:` script must route through `apps/front/scripts/run-guarded.mts` (enforced by `check-guard-coverage.mts`) and must be reconciled with `packages/scripts-ts/src/ci-gate-manifest.json` or `just ci-drift` fails. |
| **Health / complexity** | **Keep as is for gating; add fallow health only as an advisory tool, never a gate.** | oxlint 19.9 s / 2.0 GB with **0 errors and 0 `complexity` findings** at ceilings 60/90/125. fallow 4.6 s / 233 MB with 552 findings at threshold 20. | As a gate it costs a threshold policy decision (re-cut 20/15/30/60 to something above the repo's ratified 60/125) plus a new CI step. As an advisory it costs nothing but a recipe and does surface real facts — 1,160 functions over 60 LOC, a 3,246-line `scanZIndexFile` — that nothing else reports today. Its hotspot list needs `packages/client-ts` excluded before it is readable. |
| **Architecture boundaries** | **Keep as is.** | fallow `architecture` 2.6 s, 0 boundary violations unconfigured, and it cannot express any of the 7 rules in the mapping table above. | Configuring zones would buy one new rule class (generic layering) at the cost of a second boundary system alongside the guards that already fail loud and are test-pinned. Not justified by this measurement. |

One-line summary: **fallow is not a knip replacement.** On this tree it is a duplication tool
(the only thing here that has no incumbent) with an advisory complexity report and a boundary
model that this repo's rules do not fit into.

## Honest limits of this measurement

1. **One commit, one machine, one day.** Every runtime is a single cold run on a warm pnpm store on
   a 12-thread Linux box. CI is a different machine with a cold store; none of these numbers should
   be read as CI timings.
2. **Runtimes are noisy, including the incumbent's.** Two knip runs on the identical tree, with no
   cache flag on either, took 24.4 s and 49.3 s; two oxlint runs took 19.9 s and 9.5 s. I did not
   isolate the cause (likely OS page cache and tsgolint's own state). All timing deltas carry up to
   ±2× noise; the 3× claim in the table is "fallow is faster", not "fallow is 3.29× faster".
3. **I initially misread oxlint.** My first baseline was `oxlint --quiet`, which suppresses warnings;
   it reported "0 diagnostics" and hid **592 warnings**. The corrected numbers (0 errors, 592
   warnings, 0 from `complexity`) are what the record uses. The mistake is exactly the failure mode
   this measurement set out to avoid in others, so it is disclosed rather than quietly fixed.
4. **I mutated the measurement target to prove knip works.** Five probe files/exports were added
   and reverted; the tree is clean. Three of the five experiments are single observations of a
   behaviour I infer, not a reading of knip's source or docs: I did **not** establish the exact
   mechanism by which knip suppresses exports in test-only files (my working explanation is a
   test-entry classification plus `includeEntryExports: false`, but that is inference from the
   probes).
5. **The "21 of 24 files are already declared" claim is a grep of `knip.ts`, not a knip
   resolution.** I did not run knip with those entries removed, and I did not run
   `fallow migrate knip` to see how much of the 21 a fallow config would need. It is possible a
   single fallow `entry` glob (e.g. the `dynamicGuards` mechanism) would cover several of them more
   cheaply than knip does — unmeasured.
6. **`--mode strict` is not evidence.** It returned exactly the default's output (identical
   fingerprints). I could not make it differ; either the modes coincide on this corpus or the flag
   did not apply. The strict row is reported for completeness, not as a result.
7. **The duplication percentage has two denominators in this record.** fallow's headline
   `6.72 %` is its own `duplicated_lines / total_lines`; my per-tree distribution uses
   `line_count × instances` (16,080), which double-counts repeated instances. They are labelled,
   but they are not the same quantity and the shares should not be summed with the percentage.
8. **Health was not cross-validated.** I did not compare fallow's cyclomatic values against
   oxlint's for the same functions; oxlint reporting 0 at ceiling 60 only *bounds* fallow's 552 at
   threshold 20 — it does not confirm fallow's counter agrees with oxlint's (implementations differ
   even in the same metric family). Fallow's `hotspots` churn window is git-derived and hard-coded
   to 6 months here; it changes with date, so that table is not reproducible later.
9. **No type-aware duplication or health run.** `--near`, `--cross-language`, `--mode semantic` and
   `similar-code` were not exercised; only `--type-aware` on dead-code, which moved 3 findings.
10. **No regression test of fallow's gates.** I did not inject a genuine duplicate, an oversized
   function or a boundary violation to confirm each gate fires. I confirmed only knip's gate (probe
   above) and that fallow's bare JSON mode does *not* fire without `--fail-on-issues`.
11. **Telemetry "off" is fallow's own report.** I verified the status at three points
    (default, after `telemetry disable`, and with `FALLOW_TELEMETRY=off` per run) and observed no
    payload inspection, but I did not capture network traffic to prove no datagram left the host.
12. **Cost of a second tool is undercounted.** I did not measure the CI wall-clock cost of the new
    guard wrapper, the `ci-gate-manifest.json` reconciliation or the justfile recipe — I only
    observed, from `AGENTS.md` and `check-guard-coverage.mts`, that they are mandatory here.
13. **Nothing was migrated.** `fallow migrate knip`, `fallow init`, `fallow agent`, `fallow hooks`
    and `fallow fix` were deliberately not run — each writes a config, a Git hook or agent
    wiring, which this measurement is forbidden to leave behind.

## Constraint compliance

- Only this file is committed. No `package.json` change, no fallow config, no CI or justfile change,
  no guard disabled.
- Zero `oxlint-disable` added. `pnpm exec oxlint -f json .` reports **0 errors** (592 warnings) on
  the tree; the only added file is this Markdown record, and oxlint does not lint Markdown. The
  brief's `npx oxlint <changed files>` = 0 errors is therefore satisfied trivially and also
  tree-wide.
- No `fallow-ignore` suppression marker was added either: the 67 findings are recorded as measured,
  not silenced.
- `npx fallow` ran offline-capable through the local npm cache after a single cold fetch; no network
  was required for any analysis, and every run used the read-only commands listed above.
