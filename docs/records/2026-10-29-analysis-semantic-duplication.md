# 2026-10-29 analysis — TypeScript/JavaScript semantic duplication inventory (DUP-SURVEY-1)

**Scope.** `apps/front/src`, `apps/front/e2e`, `apps/front/scripts`, `packages/shared-ts/src`,
`packages/scripts-ts/src`, `packages/lint-ts/src`. `apps/api` (C#) is **out of scope** for this
packet — it is invisible to the JS tools and deserves its own pass.
`packages/client-ts` is generated; its clones are excluded by construction.

**Question.** Where does this repository express the *same meaning* twice? Not where does it contain
the same characters twice. A clone-block report answers the second question only, and the second
question is the uninteresting one: generated code, test fixtures and two screens that legitimately
share a table shell all produce clone blocks and none of them is debt.

## Method — leads, then judgement

Nothing below is a tool's conclusion. The mechanical passes only produced *candidates*, and every
candidate was opened and read before it was classified. Four lead generators were used:

1. **Repeated exported names** — every `export type|interface|const|function|class` in the six
   roots, grouped by name across files (1250 files, 26 196 declarations, 34 exported names that
   appear in ≥2 files).
2. **Repeated declaration shapes** — the same `type`/`interface` body after comment, whitespace and
   member-order-insensitive normalisation (15 shape groups shared by ≥2 files).
3. **Repeated function bodies** — the same statement sequence in ≥2 files, with the helper-name
   families `is*`/`get*`/`parse*`/`normalize*`/`format*`/`build*` checked by hand.
4. **`npx --yes fallow@3.37.0 dupes --near --no-cache --format json`** — 325 clone groups, 297 after
   dropping generated `packages/client-ts`, read as *questions*: each file-set was asked "is this one
   meaning twice, or two meanings that rhyme?".

The judgement the tools cannot make is the one that matters, and it went in three directions:

- **the dependency already exists** — `apps/front` depends on `@org/shared-ts`; a copy is unfounded,
  an import is not;
- **the two copies are two screens with different lives** — staff audit-log columns and tenant
  activity columns render the same rows and *deliberately* differ (one links and acts, one is
  read-only); aliasing them would couple two product decisions;
- **a later change re-added what an earlier one had** — the clearest instance is the error-view
  pair in `C1` below, where `#1318`'s giant-component split re-created a component `#1234`'s work
  had already extracted.

Class definitions and default verdicts are the ones in the packet brief:

| Class | Meaning | Default verdict |
|---|---|---|
| **A — duplicated type** | the same type/interface/alias declared in ≥2 places | merge into one home |
| **B — duplicated pure helper** | the same function body (or trivially renamed) in ≥2 places | merge into one module |
| **C — mirrored component** | a component copied across routes/scopes, drifting already | merge only if the drift is not intentional |
| **D — duplicated constant/config** | the same list/map/regex repeated | merge into one source |
| **E — coincidental similarity** | looks alike, means different things | keep, say why |

## Inventory at a glance

37 families, classified as follows. "Fixed" means changed in this packet's UI/TS commit (class A
only); everything else is deliberately inventory-only.

| Class | Families | Fixed here | Deferred | Kept (intentional / by decision) |
|---|---|---|---|---|
| A — duplicated type | 7 | **4** | 2 | 1 (`A4`, owner decision) |
| B — duplicated pure helper | 8 | 0 | 8 | 0 |
| C — mirrored component | 6 | 0 | 3 | 3 |
| D — duplicated constant/config | 6 | 0 | 5 | 1 (absorbed by A1) |
| E — coincidental similarity | 10 | 0 | 0 | 10 |
| **Total** | **37** | **4** | **18** | **15** |

Weight, not count, is what matters: `B1` (20 copies of one failure classifier), `D1` (1178
identical translation keys per language, twice) and `B2` (28 copies of one trim helper) are worth
more than the other 34 entries combined. They are ranked accordingly below.

---

## A — duplicated types

### A1 — the tenant-users search-param module existed twice · **FIXED**

| | |
|---|---|
| Files | `apps/front/src/routes/authed/staff/tenants/$tenantId/_users-list-search.ts` (**deleted**) vs `_users-search-params.ts` |
| Duplicated | `KnownTenantUserStatus` (`:22`/`:23`), `KnownTenantUserLevel` (`:30`/`:31`), `TenantUsersListSearchParams` (`:34`/`:35`), `TenantUsersListSearchParamInput` (`:39`/`:46`), `TenantUsersListWireParams` (`:124`/`:40`) — plus the five helpers that go with them (`parseTenantUserStatusFilter`, `serializeTenantUserStatusFilter`, `parseTenantUserLevelFilter`, `serializeTenantUserLevelFilter`, `parseTenantUsersListSearchParams`, `serializeTenantUsersListSearchParams`), and a second `normalizeString`. |
| What it means | Two modules for one thing: the tenant-users list's URL-state contract. `_users-search-params.ts` was written from the earlier file (same constants, same parse order, same serialise order, `parseCsvFilter` factored out of the two identical loops) and both stayed alive because they acquired different consumers: the route imports `_users-search-params`, the filter menu and the only test imported `_users-list-search`. Neither is a fork with its own intent — the surviving module is a *refactor* of the deleted one. |
| Verdict | **merge** |
| Single home | `_users-search-params.ts` (same directory, existing file) |
| Fix | `KNOWN_TENANT_USER_STATUSES` / `KNOWN_TENANT_USER_LEVELS` exported from the surviving module; its re-derived `type TableSearchParamInput = Parameters<typeof parseTableSearchParams>[0]` replaced by the real import from `~/lib/url-state/table-search-params`; `_users-filter-menus.tsx` repointed; the deleted module's test moved verbatim to `_users-search-params.test.ts` (import specifier only, no assertion touched) and passes against the survivor — which is the proof the two modules meant the same thing. |
| Risk | Low. The 9 moved tests pass unchanged, `pnpm --filter front typecheck` is green, and the route (`users.tsx`) was already on the survivor. Behaviour change would require the two `parseCsvFilter` implementations to disagree; they do not (same trim, same lower-case, same allow-list, same de-duplication). |

### A2 — the tenant-user update body declared twice · **FIXED**

| | |
|---|---|
| Files | `apps/front/src/routes/authed/staff/tenants/$tenantId/users/_edit-schema.ts:45` (`TenantUserEditPayload`) vs `apps/front/src/lib/query/staff-tenant-users.ts:111` (`StaffTenantUserUpdateInput`) |
| What it means | The form builds the body that the mutation sends. Both declarations list `tenantId`, `userId`, `firstName?`, `lastName?`, `avatarUrl?`, `accountLevel?`. There is exactly one wire body here, so there should be exactly one type: the mutation's input. `buildTenantUserEditPayload` already returned a value the mutation accepts structurally, which is why nobody noticed. |
| Verdict | **merge** |
| Single home | `~/lib/query/staff-tenant-users` (`StaffTenantUserUpdateInput`) — already imported by the route that calls the mutation |
| Fix | `export type TenantUserEditPayload = StaffTenantUserUpdateInput;` with the import. |
| Risk | Low. Structural identity is total (same six members, same optionality, same nullability), so no call site changed shape. `accountLevel` stays `string | null` on both sides — the form's `'Admin' \| 'User'` enum narrows into it, never the reverse. |

### A3 — the table query-variables contract declared three times · **FIXED**

| | |
|---|---|
| Files | `apps/front/src/lib/query/staff-users.ts:36` (`StaffUsersQueryVariables`), `apps/front/src/lib/query/tenant-posts.ts:32` (`TenantPostsQueryVariables`), `apps/front/src/lib/url-state/table-search-params.ts:3` (`TableSearchParams`) |
| What it means | All three are `{ q?, sortId?, sortOrder?, cursor?, size? }`. `TableSearchParams` is the *named* concept and already the home four route-level search-param modules import; the two query modules re-typed it because their third `build*QueryOptions` generic needed a local name. Same meaning, three declarations, zero added fields — the classic place where the fourth field gets added to two of the three. |
| Verdict | **merge** |
| Single home | `~/lib/url-state/table-search-params` (`TableSearchParams`) |
| Fix | `export type StaffUsersQueryVariables = TableSearchParams;` and the same for `TenantPostsQueryVariables`; the now-unused `SortOrder` imports dropped. |
| Risk | Low. Identical shape; the guard test that pins list-query classification still sees the same three generic arguments. `TenantPostsQueryVariables` is intersected with `{ tenantId: string }` at one call site (`tenant-posts.ts:228`) — unchanged. |

### A4 — the audit-row contract declared twice · **KEPT (owner decision)**

Classified as a duplicated type and merged in this packet's first pass, then **reverted**: the two
declarations are deliberately distinct. Full entry is the `K1` table below.

### A5 — the named-profile resolution row declared twice · **FIXED**

| | |
|---|---|
| Files | `apps/front/src/routes/authed/staff/tenants/$tenantId/_invite-user-form-state.ts:54` (`ProfileNameResolution`) vs `apps/front/src/lib/query/staff-tenant-profiles.ts:1158` (`ResolveTenantProfileNameResolution`) |
| What it means | The drawer hands the mutation's result straight to `applyProfileResolutions(rows, resolutions: ProfileNameResolution[])`. One producer, one consumer, one shape (`name`, `profileId: string | null`, `reason: 'not-found' \| 'ambiguous' \| null`). |
| Verdict | **merge** |
| Single home | `~/lib/query/staff-tenant-profiles` (`ResolveTenantProfileNameResolution`) — the producer's declaration |
| Fix | `export type ProfileNameResolution = ResolveTenantProfileNameResolution;`. The local name is kept because two test files and the drawer import it from the form-state module; only the duplicate *body* is gone. |
| Risk | Low. `import type` is erased, so the pure form-state module gains no runtime dependency on the query module. |

### A6 — the JSON value type has three homes and no owner · **DEFER**

| | |
|---|---|
| Files | `apps/front/src/lib/testing/untyped-node-json.ts:11` (`JsonValue`) + `:19` (`JsonObject`); `packages/scripts-ts/src/json-value.ts:15` (`JsonValue`) + `:28` (`JsonObject`); `apps/front/e2e/helpers/tenant-account-fixture.ts:319` (`type JsonObject = Record<string, unknown>`) |
| What it means | "A value that came from JSON" — the same meaning, declared three times with three levels of strictness. This is the packet's motivating example and it is *not* a coincidental collision: `untyped-node-json.ts` and `json-value.ts` are the same union (the scripts copy adds `readonly`), and the scripts copy's doc comment explains the exact lint pressure (`no-unknown-parameters`, `no-unsafe-dictionary-type`) that pushed it into existence independently. |
| Verdict | **defer** |
| Single home (to create) | `packages/shared-ts/src/types/json-value.types.ts` — the only package both consumers can reach; its `./*` export map makes `@org/shared-ts/types/json-value.types` importable from `apps/front` **today**, once the file exists |
| Why defer | The home does **not** exist today, and `packages/scripts-ts` has **no** `@org/shared-ts` dependency at all (its devDependencies are `yaml`, `@types/node`, `vitest`). Fixing only the `apps/front` side would leave three declarations where there are three now, plus a new shared file that one consumer uses — a worse ratio than the defect. |
| Cost to fix | ~12 lines in `shared-ts`; `apps/front` imports it (0 dependency change); `apps/front/e2e` imports it (0 dependency change, but `readJson`'s `Record<string, unknown>` becomes the stricter `JsonObject`, so the fixture's field readers must be re-checked — they narrow with `typeof`, so this is expected to hold); `packages/scripts-ts` needs `"@org/shared-ts": "workspace:*"` added as its **first** workspace dependency, or keeps its copy and the duplication survives. Recommendation: do the whole family in one packet, accept the workspace dep, and re-run `just ci-drift` afterwards. |
| Risk if merged wrongly | The strict union rejects `undefined`, `Date` and class instances that `Record<string, unknown>` accepted; the e2e fixture passes a Kiota `response.json()` payload, which is plain JSON, so the narrowing is sound — but it must be verified by `pnpm --filter front typecheck` (the e2e tree is inside the main program, per `check-typecheck-coverage.mts`). |

### A7 — the translate-callback type declared twice · **DEFER**

| | |
|---|---|
| Files | `apps/front/src/routes/_reset-password-form-schemas.ts:5` (`Translate`), `apps/front/src/routes/authed/staff/_tenant-form-shared.ts:6` (`TranslateFn`) |
| What it means | Both are the narrowed i18next `t`: `(key: string, options?: Record<string, unknown>) => string`. Every Zod schema factory in the front takes one. |
| Verdict | **defer** |
| Single home (to create) | `apps/front/src/lib/i18n/translate.ts` — `lib/i18n` is the existing i18n module tree and is importable from both route trees |
| Why defer | No such module exports it today; the two copies live in two unrelated route trees, so "import one from the other" would be a route→route edge, which the front conventions avoid. |
| Cost to fix | ~4 lines + two import swaps + one call-site rename. Must **not** absorb `apps/front/src/lib/hooks/use-language-keyed-zod-resolver.ts:8`'s `Translate = (key: string) => string` — that one is narrower by intent (no interpolation options), listed as `E5`. |

---

## B — duplicated pure helpers

Ranked by cost of leaving them.

### B1 — `isProblemStatus` ×11 and `getFailureDescription` ×9 · **DEFER (highest-value B)**

| | |
|---|---|
| Files | `routes/authed/staff/_staff-user-error-views.tsx:13,:29` · `routes/authed/staff/staff-users/_user-details-error.tsx:13,:29` · `routes/authed/staff/tenants/$tenantId/_tenant-details-shell.tsx:42,:58` · `routes/authed/staff/tenants/$tenantId/users/_details-error-views.tsx:15,:31` · `routes/authed/staff/tenants/$tenantId/users/_edit-error-views.tsx:14,:30` · `routes/authed/staff/tenants/$tenantId/profiles/$profileId/_members-error-views.tsx:15,:31` · `routes/authed/staff/tenants/$tenantId/profiles/$profileId/_details-error-views.tsx:15` (description only) · `routes/authed/staff/profiles/$profileId/_detail-views.tsx:17,:33` · `routes/authed/staff/profiles/$profileId/_users-page-states.tsx:14,:30` · `routes/authed/staff/invitations/$invitationId.tsx:56` · `routes/authed/staff/audit-logs/$logId.tsx:35` · `routes/authed/staff/tenants/$tenantId/profiles/$profileId/_profile-details-error-classifier.ts:5` |
| What it means | One policy — "which RFC 7807 problem maps to not-found / malformed-id / forbidden / generic" — re-typed into every staff error surface. `isProblemStatus` is 10 lines and identical in all 11; `getFailureDescription` is 8 lines and identical in all 9. The bodies are character-identical apart from formatting, which is what makes this the most mechanically provable B in the repo. |
| Why it drifted into 11 copies | Each surface was extracted at a different time for a different react-doctor rung (#1234, #1318, #1417, #1530); none of the extractions could see the others because the helper is module-private (`const`, not exported). |
| Verdict | **merge** |
| Single home | `apps/front/src/lib/api-failure/problem-status.ts` (new *file* in the existing `lib/api-failure` concept — `toApiFailure` in `@org/shared-ts/lib/api-failure/to-api-failure` is the input type, so a shared-ts home is also defensible; front-only keeps the `~/` import shallow) |
| Fix sketch | Export both from one module; delete 20 local declarations; keep each surface's own translation keys and fallback strings at the call site (they are the part that legitimately differs). |
| Risk | Low mechanically, but review must confirm that the `getFailureDescription` in `_details-error-views.tsx` really is the same policy (it is `detail ?? fallback`, same as the rest). No behaviour change: same `toApiFailure` call, same short-circuit on `kind !== 'problem'`. |
| Note | `@org/shared-ts` already exports the *predicate* `isProblemFailure` (`lib/api-failure/types.ts:49`) and a translating `getFailureMessage` (`lib/api-failure/to-api-failure.ts:337`). Neither is what these 20 copies want: the copies take `unknown` and a status, and they deliberately return the server's `detail` **without** translating. That difference is why "just use `getFailureMessage`" is not the fix. |

### B2 — the trim-or-absent helper, 28 times · **DEFER**

| | |
|---|---|
| Files | 26 `normalizeString` declarations + 2 in-file variants. Full list: `lib/query/{auth,needs-reconnect-accounts,tenant-account-profile,tenant-settings-general,tenants-for-picker,staff-jobs,staff-tenants,tenant-publish-targets,staff-profile-users,staff-audit-logs,tenant-publications,tenant-scheduled-publications,staff-users,staff-tenant-users,staff-profiles,staff-tenant-profiles,tenant-posts,staff-global-tenant-users,staff-invitations,staff-tenant-invitations,tenant-projects,staff-tenant-activity}.ts`; `routes/authed/staff/invitations/list-helpers.ts:38`; `routes/authed/staff/audit-logs/_list-search-params.ts:26`; `routes/authed/staff/jobs/_list-search-params.ts:36`; `routes/authed/staff/tenants/$tenantId/_users-search-params.ts:51`; plus `trimStringOrUndefined` **and** `trimIfString` in `lib/url-state/table-search-params.ts:13,:87`. |
| What it means | "Trim; treat empty as absent." One meaning, three absence conventions (`undefined`, `null`, and `undefined`-narrowed-to-`string|null`), re-implemented in 28 files. The two variants inside `table-search-params.ts` are the same function twice *in one file*, one of which has a narrower parameter type. |
| Verdict | **merge** |
| Single home | `packages/shared-ts/src/utils/string.utils.ts` (existing module, importable from front today) — one `trimToUndefined(value: unknown): string \| undefined` plus a `trimToNull` wrapper for the API-boundary callers |
| Fix sketch | Add the two helpers to `string.utils.ts`; replace 28 local declarations with imports; `table-search-params.ts`'s two private copies go too. Mechanical, ~26 one-line import swaps, no call-site changes. |
| Risk | Medium only because of volume: the three absence conventions must be mapped explicitly per call site (a blind import swap that turns `null` into `undefined` can change a Kiota request body's presence). Do it module by module, not one commit. |

### B3 — the CSV row parser, twice, byte-identical · **DEFER**

| | |
|---|---|
| Files | `apps/front/src/routes/authed/staff/tenants-new-helpers.ts:46-118` and `apps/front/src/routes/authed/staff/tenants/$tenantId/_invite-user-form-state.ts:114-186` |
| What it means | The character-scanning CSV parser (quoted fields with embedded commas, `""` escapes, CRLF and LF) for "import members from a file". Two entry points — create-tenant and invite-users — each grew their own importer, each parser is **1047 bytes, character-identical**. Verified by extracting both bodies and comparing: `identical: True`. |
| Verdict | **merge** |
| Single home | a shared importer module, e.g. `apps/front/src/lib/import/csv.ts` (the sibling `parseCsv`/`CsvParsedRow` types in `tenants-new-helpers.ts` move with it) |
| Fix sketch | Move `parseCsvRows` (and `parseCsv`) to one module; both callers import it. The two callers' *row* shapes stay where they are — only the tokenizer is shared. |
| Risk | Low. The parser is pure and already identical; the risk is that one caller relies on a subtle behaviour the other does not test. Both existing test files (`tenants-new-helpers` coverage lives in the tenants-new route tests, `_invite-user-form-state.test.ts`) already pin the behaviour, so the shared version is covered twice. |

### B4 — `referencedAliasName` in two lint rules · **DEFER**

| | |
|---|---|
| Files | `packages/lint-ts/src/anti-slop/rules/no-unknown-returns.ts:15` and `packages/lint-ts/src/anti-slop/rules/no-unknown-type-aliases.ts:4` |
| What it means | The same 10-line alias-resolution helper (unwrap `TSParenthesizedType`, accept bare `TSTypeReference` with no type arguments) copy-pasted between the "unknown return" and "unknown alias" rules. |
| Verdict | **merge** |
| Single home | `packages/lint-ts/src/anti-slop/shared/` — the directory already exists and already holds `lexical-type-parameters.ts`, imported by both rules' siblings |
| Fix sketch | Move the function to `shared/referenced-alias.ts`; two import swaps. |
| Risk | Low, and it is the *kind* of duplication that becomes a correctness bug: if one rule learns to unwrap a new node type and the other does not, the two anti-slop rules disagree about the same file. |

### B5 — the "padding reason" policy, duplicated between its generator and its enforcement · **DEFER**

| | |
|---|---|
| Files | `packages/scripts-ts/src/check-ci-drift.ts:45` (`minimumReasonLength`), `:54` (`maxFillerBlockLength`), `:65` (`fillerResidueLength`), `:108` (`isFiller`) vs `packages/scripts-ts/src/gen-reason-ref.ts:18`, `:29`, `:72`, `:174` |
| What it means | `gen-reason-ref.ts` regenerates the reference fingerprints that `check-ci-drift.ts` enforces, and it must compute the same reason fingerprint. It therefore copies the enforcement's constants and its two most intricate functions (the repetition-residue scan). The generator does not import the checker; they are kept in sync by hand. |
| Verdict | **merge** |
| Single home | `packages/scripts-ts/src/reason-policy.ts` (new module inside an existing package, imported by both) |
| Fix sketch | Extract `minimumReasonLength`, `maxFillerBlockLength`, `fillerResidueLength`, `isFiller`, `hashReason`; both scripts import them. |
| Risk | Medium and worth naming: this is the *guard* for the CI-gate reasons, so a careless extraction changes what "a real reason" means and could silently re-pin 700+ reasons. Extract without touching the algorithm, then run `just ci-drift` and `pnpm test:ci-drift` and confirm `reason-guard-ref.json` is unchanged. |

### B6 — the workflow `uses:` scanner, duplicated across two supply-chain guards · **DEFER**

| | |
|---|---|
| Files | `packages/scripts-ts/src/check-actions-pinned.ts:386-396` vs `packages/scripts-ts/src/check-actions-pins.ts:361-357` (the two files are 396 and 697 lines; the whole workflow-walk, local-action resolution, symlink containment and cycle handling is present twice) |
| What it means | One job — "enumerate every `uses:` reference in `.github/workflows` + `.github/actions`, following local composite actions, cycle-safe, real-path contained" — performed by two guards. They differ only in *what they assert* about each reference (40-hex pinning vs SHA↔`# vX.Y.Z` binding). The second file's own header says "mirrors the sibling guard", which is an acknowledgement, not a design. |
| Verdict | **merge** |
| Single home | `packages/scripts-ts/src/action-references.ts` (shared scanner) + two thin guards |
| Fix sketch | Extract the file-set walk, `uses:` line scanner, local-action resolver and cycle guard; each guard keeps its assertion and its allow-list. |
| Risk | Medium-high, and the reason to defer: these are supply-chain guards whose *scan surface* must stay identical, but their test suites pin different acceptance rules, and `check-actions-pinned.ts` is referenced by name in `ci.yml` (`:305`) and in the gate manifest's reasons. Extract mechanically, keep both CI invocations, and re-run both test files. |

### B7 — the form-error mapper declared twice · **DEFER**

| | |
|---|---|
| Files | `apps/front/src/routes/authed/staff/_tenants-new-submit.ts` vs `apps/front/src/routes/authed/staff/tenants/_tenantId-edit-submit.ts` |
| What it means | The create-tenant and edit-tenant submit handlers split Zod issues into `fieldErrors` + one de-duplicated `rootMessage`, with the same "fallback when nothing mapped" rule. 84 cloned lines, and the two differ only in the field-name guard they pass in. |
| Verdict | **merge** |
| Single home | a `buildFieldErrorSummary(messages, isKnownField, fallback)` helper next to the existing tenant form helpers (`routes/authed/staff/_tenant-form-shared.ts`) |
| Fix sketch | Parameterise the field guard; both submit handlers call it. |
| Risk | Low; both call sites already take the guard as a type predicate, so the signature is natural. |

### B8 — the guard-script scaffold (`walk`, exit-on-missing-tree, finding formatter) · **DEFER (low value)**

| | |
|---|---|
| Files | `apps/front/scripts/guards/check-e2e-shared-constants.mts`, `check-column-type-imports.mts`, `check-shared-ts-import-paths.mts`, `check-typecheck-coverage.mts` (and the `formatFinding` pair at `check-column-type-imports.mts:275` / `check-shared-ts-import-paths.mts:209`) |
| What it means | The same recursive source-file collector and "cannot report compliance for a tree I never read" exit path, re-written per guard. |
| Verdict | **defer** — not because it is hard, but because consolidating it is *bespoke-guard infrastructure work* (see AGENTS.md's bespoke-guard admission rule) and would touch four guards whose own tests pin their output strings. |
| Single home if done | `apps/front/scripts/guards/_shared/source-tree.mts` |
| Risk | Low value, non-zero review cost. Rank last. |

---

## C — mirrored components

### C1 — the staff-user error view, extracted twice · **DEFER (merge suggested)**

| | |
|---|---|
| Files | `routes/authed/staff/_staff-user-error-views.tsx:42` (`StaffUserErrorViews`) vs `routes/authed/staff/staff-users/_user-details-error.tsx:39` (`StaffUserDetailsError`) |
| What it means | Same three-branch view (not-found/malformed-id → forbidden → generic retry), same translation keys, same test ids, same markup. The only differences are `onClick={() => onRetry()}` vs `onClick={onRetry}` and the component name. `git log` settles the history: `_staff-user-error-views.tsx` came from `#1234`'s React-Compiler work, `_user-details-error.tsx` from `#1318`'s `no-giant-component` rung — **the later extraction re-created what the earlier one had already extracted**, because it looked at the route file, not at the route's directory. This is the packet owner's "someone re-added what the other already had" instance, and it is the highest-value C. |
| Verdict | **merge** (deferred to a follow-up: the two route files that consume them are 2 lines each, but the components' test ids are pinned by different specs, so the merge needs a `testId` prop and both specs re-run) |
| Single home | `routes/authed/staff/_staff-user-error-views.tsx` (the earlier file; `staff-users/_user-details-error.tsx` is the duplicate) |
| Fix sketch | Delete `_user-details-error.tsx`; import `StaffUserErrorViews` from `../_staff-user-error-views` in `staff-users/$userId-edit.tsx` (three call sites); decide whether the test id follows a prop or is left as the surviving component's. |
| Risk | Low; both components render the same thing today. The `onClick` difference is cosmetic (both call the callback). |

### C2 — `ProfileDetailsLoading` ×3 and `ProfileDetailsError` ×2 · **DEFER (merge suggested)**

| | |
|---|---|
| Files | `routes/authed/staff/profiles/$profileId/_detail-views.tsx:44,:86` · `routes/authed/staff/profiles/$profileId/_users-page-states.tsx:41,:83` · `routes/authed/staff/tenants/$tenantId/profiles/$profileId/_details-error-views.tsx:25` (loading only) |
| What it means | The first two live in the **same directory** and export the same two component names with the same bodies; the only differences are `data-testid` and one is `max-w-5xl`. Two files exist because two route files (`$profileId.tsx` and `users.tsx`) each needed their states extracted for `no-multi-component-file`, and each extracted from its own file. The third copy is the tenant-scoped twin. |
| Verdict | **merge** (deferred; needs a `testId`/width prop) |
| Single home | `routes/authed/staff/profiles/$profileId/_detail-views.tsx` for the two staff-global copies; the tenant one stays separate (different route scope, different i18n namespace — but see the note) |
| Fix sketch | `_users-page-states.tsx` keeps only `MissingProfileView` (which genuinely differs: it has the whole not-found layout) and imports loading/error from `_detail-views`; pass test id + max-width. |
| Risk | Low mechanically; the review question is whether the two screens' test ids must stay distinct — they must, so the merge takes props rather than deleting the distinction. |

### C3 — the incomplete-payload views declared twice · **DEFER (merge suggested)**

| | |
|---|---|
| Files | `routes/authed/staff/tenants/$tenantId/users/_details-error-views.tsx:107` and `:122` vs `routes/authed/staff/tenants/$tenantId/users/_edit-error-views.tsx:133` and `:114` |
| What it means | `MissingTenantUserPayloadView` and `TenantDetailsIncompleteView` are two verbatim copies each (198 and 248 normalised bytes), in the same directory, for the details and edit screens of the same resource. |
| Verdict | **merge** |
| Single home | `_details-error-views.tsx` (or a small `_user-error-views.tsx`); the edit file imports them |
| Fix sketch | Two imports, two deleted declarations; the edit file keeps its own `TenantUserEditLoading`/`TenantUserEditError`. |
| Risk | Very low — same directory, same test ids. |

### C4 — `_profile-edit-details-drawer.tsx` ×2 · **KEEP (with a B follow-up)**

| | |
|---|---|
| Files | `routes/authed/staff/profiles/$profileId/_profile-edit-details-drawer.tsx` (368 lines) vs `routes/authed/staff/tenants/$tenantId/profiles/_profile-edit-details-drawer.tsx` (397 lines) |
| Why keep | The drift is *intentional and structural*: different mutations (`useUpdateStaffProfileMutation` vs `useUpdateStaffTenantProfileMutation`), different invalidation (`invalidateStaffProfiles` vs `invalidateAllStaffTenantScopes`), different resolver (`zodResolver` + `useMemo` vs `useLanguageKeyedZodResolver`), different card-style derivation, and the tenant copy takes a `tenantId`. The comment in the staff copy records the mirroring as a decision (`#819`). Merging them would need a scope abstraction — exactly the "new abstraction invented to silence a number" the packet forbids. |
| But | The Zod schema factory `buildProfileEditDetailsSchema(t)` **is** duplicated (same 5 fields, same max-lengths, same messages) and the PATCH omit/set/clear rule is duplicated with it. That part is a genuine B: extract the schema + the dirty-field → null/undefined mapping into one shared module (`~/lib/profiles/profile-edit-details-schema.ts`), leave the two components alone. |

### C5 — audit-log columns vs tenant-activity columns · **KEEP**

| | |
|---|---|
| Files | `routes/authed/staff/audit-logs/_audit-log-columns.tsx` vs `routes/authed/staff/tenants/$tenantId/_tenant-activity-columns.tsx` |
| Why keep | Same rows (`A4` now formalises that), deliberately different product surfaces: the staff table links each row to its detail page, renders row actions and action-category pills; the tenant activity table is read-only, has no detail route and no actions. The 195 cloned lines are the shared cell-rendering *style*, not a shared contract. Merging would require a `canAct` flag threaded through six columns to save nothing. The row *types* are deliberately separate too (`A4` / `K1`); the columns are not. |

### C6 — the tenant detail tabs (`activity.tsx`, `invitations.tsx`, `usage.tsx`) · **KEEP**

| | |
|---|---|
| Files | `routes/authed/staff/tenants/$tenantId/{activity,invitations,usage}.tsx` |
| Why keep | Three sibling tabs behind one shell. The 87-line clone is the shell usage + table wiring, and the shell itself (`_tenant-details-shell.tsx`) is already the shared home — the pages are the *callers*, which is what a shell is for. Merging them would be merging three routes into one parameterised route, which the router config deliberately does not do. |

---

## D — duplicated constants and config

### D1 — the `common` i18n catalogue exists twice, forked, and only one copy is loaded · **DEFER (highest-value finding in this survey)**

| | |
|---|---|
| Files | `apps/front/src/i18n/locales/{en,fr}/common.json` vs `packages/shared-ts/src/lib/i18n/json/common.{en,fr}.json` |
| Measurement | en: front 1383 keys, shared 1365, **1178 identical keys with 0 value differences**; 205 keys only in front, 187 only in shared. fr: same numbers (1383 / 1365 / 1178). |
| What it means | The same translation catalogue in two places. `apps/front/src/i18n/locales/en.ts` builds its bundle from shared `zod` and shared `response-message` — and its **own** `common`. `lib/i18n/backend.ts:21` says why in passing: pulling shared `common` in "would pull shared `common` into every namespace chunk". So shared's `common` is loaded by nobody at runtime; it survives as 1365 keys of type-source and test fixture, 1178 of which are the front's own copy verbatim. The 187 shared-only keys are the interesting residue: they are auth/marketing copy (`sign-in`, `forgot-password`, `verify-email`, …) that front moved into its `auth` namespace — the fork is historical, not intentional. |
| Verdict | **defer** — this is a data-ownership decision, not a mechanical dedupe |
| Single home (recommended) | front's `apps/front/src/i18n/locales/{en,fr}/common.json`; shared-ts keeps `zod` and `response-message` only |
| Fix sketch | 1) Triage the 187 shared-only keys: each is either dead or belongs to front's `auth`. 2) Strip `common` from shared's locale barrels (and from `Resource`/`LooseResource`). 3) Re-run `pnpm --filter front test` — the i18n key-coverage guard (`src/lib/i18n/key-coverage.test.ts`) and the response-message parity test will name anything that actually needed the shared copy. |
| Risk | Medium-high, because three test files import the shared barrel for fixtures (`layout-error-boundary.test.tsx`, `mutation-feedback-architecture.test.ts`, `field.test.tsx`, `staff-jobs.test.ts`) and would need to switch to the front bundle. Do it behind the key-coverage guard, which is precisely the guard built to catch a missing key. |
| Why it is worth doing | 1178 × 2 languages of duplicated copy is the largest single duplication in the tree, and it is the one most likely to rot: a translator edits one copy and the app keeps rendering the other. |

### D2 — `I18N_NAMESPACES`: same name, two meanings, one duplicated list · **DEFER**

| | |
|---|---|
| Files | `apps/front/src/lib/i18n/namespaces.ts:27` (`['common','zod','response-message',…16]` tuple) vs `packages/shared-ts/src/lib/constants.ts:426` (`{COMMON:'common',ZOD:'zod',RESPONSE_MESSAGE:'response-message'}` map) |
| What it means | Not the same type — one is the full namespace list, the other a key/value map of the three global names. But front's `GLOBAL_I18N_NAMESPACES` (`namespaces.ts:3`) repeats those three values verbatim, and shared-ts's map exists only to name them. |
| Verdict | **defer** (it belongs with D1 — same decision about who owns the namespace list) |
| Single home | shared-ts's map stays the naming source; front derives `GLOBAL_I18N_NAMESPACES` from it (`Object.values(I18N_NAMESPACES)`), keeping the tuple's order pinned by a test |
| Risk | Low mechanically, but `z.enum(I18N_NAMESPACES)` depends on the tuple's literal order and on `as const`; deriving must preserve both (a `readonly ['common','zod','response-message']` literal, not a spread of `Object.values` typed as `string[]`). Deferred because D1 changes the same files. |

### D3 — the email regex, four times · **DEFER**

| | |
|---|---|
| Files | `routes/authed/staff/tenants-new-helpers.ts:42` (`EMAIL_REGEX`), `routes/authed/staff/tenants/$tenantId/_invite-user-form-state.ts:60` (`EMAIL_REGEX`, exported), `apps/front/e2e/helpers/tenant-account-fixture.ts:49` (`EMAIL_PATTERN`), and the same pattern inlined in `apps/front/e2e/helpers/tenant-account-fixture.ts:166,:305` uses |
| What it means | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, four times, under three names. The e2e copy is the dangerous one: a spec validating with its own regex keeps passing when production's rule changes — the exact failure mode `check-e2e-shared-constants.mts` was written for (`SESSION_TOKEN_HEADER_KEY`). |
| Verdict | **defer** (the guard's own admission rule says a new shared constant in `shared-ts` should be the home, and the guard already scans for exactly this) |
| Single home | `packages/shared-ts/src/lib/constants.ts` (or `utils/validation.utils.ts`), imported by both front modules and by the e2e helper |
| Fix sketch | Export `EMAIL_PATTERN` from shared-ts; four import swaps; the guard then keeps it from being re-declared. |
| Risk | Very low. Note the e2e helper is a `.ts` file in the main front program, so the import is free. |

### D4 — the Vitest config, duplicated between the main and proofs runners · **DEFER**

| | |
|---|---|
| Files | `apps/front/vitest.config.ts:32-45` vs `apps/front/vitest.proofs.config.ts:27-40` |
| What it means | `resolve.alias` (`~` → `./src`) and the `ssr.noExternal` bundling list (Kiota serializers, lodash, winston, shared/client packages) repeated verbatim, with the comment "Keep in sync with ssr.noExternal in vite.config.ts" pointing at a *third* copy in `vite.config.ts`. Three lists that must agree, kept in agreement by prose. |
| Verdict | **defer** |
| Single home | a shared `apps/front/vitest.shared.ts` (or a `packages/_tsconfig`-style fragment) exporting `alias` + `noExternal`; all three configs import it |
| Fix sketch | One exported const pair, three imports. |
| Risk | Low, but the proofs config is pinned by the CI step "Verify paired red proofs"; changing it means running that step, not just `pnpm --filter front test`. |

### D5 — the account-level and status option lists, five declarations · **DEFER**

| | |
|---|---|
| Files | `routes/authed/staff/invitations/list-helpers.ts:21` (`['admin','user']`), `routes/authed/staff/tenants/$tenantId/_invitation-toolbar-filters.tsx:21` (same array, same name), `routes/authed/staff/staff-users/_edit-schema.ts:3` (`['Admin','User']`) and `:4` (`['Active','Suspended']`), `routes/authed/staff/tenants/$tenantId/users/_edit-schema.ts:7` (`['Admin','User']`, exported) |
| What it means | The account-level domain (admin/user) exists in lowercase-URL form twice and PascalCase-wire form twice; the user status domain (Active/Suspended) once. The backend names them once; the front names them five times, in two case conventions. |
| Verdict | **defer** (it pairs naturally with the `list-helpers`/`_invitation-toolbar-filters` merge, which is a separate route extraction) |
| Single home | `packages/shared-ts/src/lib/constants.ts` — lower-case wire values plus the PascalCase display mapping, as the API contract owner |
| Fix sketch | Export the arrays (and the case mapping) once; five imports; the `KNOWN_INVITATION_ACCOUNT_LEVELS`/`EDIT_ACCOUNT_LEVEL_OPTIONS` names become aliases. |
| Risk | Low, but the case split is load-bearing (URL filters are lowercase, form values and wire bodies are PascalCase) — a merge that collapses the two cases breaks either the URL or the payload. |

### D6 — `KNOWN_TENANT_USER_LEVELS` / `KNOWN_TENANT_USER_STATUSES` · **absorbed by A1**

Both constants were declared in the deleted module and in the surviving one; A1 leaves exactly one
declaration each, now exported.

---

## E — coincidental similarity (keep, with the reason)

| # | Files | Why it is *not* duplication |
|---|---|---|
| E1 | `apps/front/src/i18n/locales/en.ts:38` and `packages/shared-ts/src/lib/i18n/locales/en.ts:12` — both `LooseResource = ToPrimitive<…>` | Same name, same *pattern*, different resource trees (front's bundle is the app's superset; shared's is the shared-only subset). Merging them is D1's decision, not a type alias. |
| E2 | `packages/scripts-ts/src/ci-lane-result.ts:36` and `check-ci-gate-aggregation.ts:47` — both `StepEvidence` | Same name, **different types**: the lane result carries `outcome`/`exit_code`/`signal`; the aggregation carries `StepResult & {id, execution}`. Two layers of the same CI pipeline. Worth a rename (`AggregatedStepEvidence`), not a merge — the shapes are genuinely different. |
| E3 | `routes/authed/staff/_profile-columns.tsx:17` and `routes/authed/staff/profiles/$profileId/_users-columns.tsx:14` — both `buildColumns` | Different tables (profiles list vs profile members), different column sets, different row types. Only the `ColumnDef` shape rhymes. |
| E4 | `apps/front/scripts/run-e2e-front.mts:195` and `packages/scripts-ts/src/review-launcher.ts:107` — both `runCommand` | Async `spawn` with a signal-tree escalation vs `spawnSync` with timeout + secret redaction. Same name, incompatible contracts. |
| E5 | `routes/authed/staff/_staff-permission-options.ts:3` (`StaffPermissionOption`) and `_staff-profile-options.ts:3` (`StaffProfileOption`) | Identical `{value,label,description?}` shape, unrelated domains (permissions vs profiles). A generic `SelectOption` would be the abstraction the packet forbids; the two lists never meet. |
| E6 | `lib/query/tenant-scheduled-publications.ts:27` (`type ScheduledPublicationStatus`) and `routes/authed/tenant/posts/_scheduled-publication-display.tsx:27` (`const ScheduledPublicationStatus` component) | A type alias and a React component that happen to share a domain name. Different namespaces; no import conflict. |
| E7 | `lib/query/staff-tenant-invitations.ts:20` and `lib/query/staff-tenant-users.ts:41` — `*QueryVariables` with identical 9 fields | Two resources whose filter sets happen to coincide today (status + level + table). Aliasing them would make an invitation-only filter silently appear on the users table. Keep them separate; the coincidence is not a contract. |
| E8 | `invitations/list-helpers.ts:34,149` vs `tenants-list-helpers.ts:24,65` — `*ListSearchParamInput` / `*ListWireParams` with identical bodies | Same reasoning as E7 at the URL-state layer: `status` means invitation status in one and tenant status (`active`/`suspended`/`deleted`) in the other. The shared part is `TableSearchParams`, which is already shared. |
| E9 | The 78 `Route` imports in `routes/**` and the 4 `main` declarations in `scripts/guards/*` | Framework entry-point names. Not duplication. |
| E10 | `lib/query/mutation-invalidation.guard.test.ts:936,1279` — `StaffUsersQueryVariables` / `StaffAuditLogsQueryVariables` | These are **template-literal fixture sources** for the list-query classifier guard, deliberately different from production (a flat `{cursor,size}` and a 3-field fake). Importing the real types would disable the guard's independence. |
| E11 | `routes/authed/staff/tenants-new-helpers.ts:42`'s regex vs the e2e helper's | Counted under D3, not E: same meaning, duplicated value. |

---

## K — kept by decision (not coincidental similarity)

### K1 — `TenantActivityRow` vs `StaffAuditLogRow` · **KEPT (owner decision, 2026-10-29)**

| | |
|---|---|
| Files | `apps/front/src/lib/query/staff-tenant-activity.ts:20` (`TenantActivityRow`) vs `apps/front/src/lib/query/staff-audit-logs.ts:41` (`StaffAuditLogRow`) |
| What it means | Both are the mapped form of the same Kiota model today — `toTenantActivityRows(items: AuditLogListItem[])` and `toStaffAuditLogRows(...)` map the same seven fields, and the tenant activity table renders audit entries filtered to one tenant. Structurally one row contract. |
| Verdict | **keep** — the owner's decision: *"the two names are seams — the tenant-activity screen and the staff audit-log screen call different endpoints, and one shared type would either force a change in both places or, worse, silently hide the divergence when only one endpoint changes shape. Three lines of alias are not worth coupling two API seams."* |
| Consequence | Both declarations stay, each mapping `AuditLogListItem` today. The declaration in `staff-tenant-activity.ts` carries a comment recording the decision so it is not re-merged by the next duplication sweep. |
| Risk of the *keep* | The two row contracts can drift silently, which is the cost the owner accepted. It is bounded: both mappers take `AuditLogListItem`, so a shape change at the model level breaks both at compile time; only a hand-edit to one of the two declarations can drift unnoticed, and either screen's column/test would then disagree with its own mapper. |

## The three non-type duplications worth the most

1. **D1 — the forked `common` translation catalogue.** 1178 identical keys per language, declared
   twice, with only one copy loaded at runtime. Fix sketch: make `apps/front`'s `common.json` the
   single home, strip `common` from `packages/shared-ts`'s locale barrels, triage the 187 shared-only
   keys against front's `auth` namespace, and let `src/lib/i18n/key-coverage.test.ts` prove nothing
   went missing.
2. **B1 — `isProblemStatus` ×11 + `getFailureDescription` ×9.** One RFC 7807 classification policy
   copy-typed into every staff error surface because the helper is module-private and each extraction
   ran in a different react-doctor rung. Fix sketch: export both from
   `apps/front/src/lib/api-failure/problem-status.ts` and delete 20 local declarations; each surface
   keeps its own fallback strings and translation keys.
3. **C1 — the staff-user error view, extracted twice, 95 % identical.** `#1234`'s
   `_staff-user-error-views.tsx` already existed when `#1318`'s giant-component split produced
   `_user-details-error.tsx` from the route file. Fix sketch: delete the later file, point the three
   `staff-users/$userId-edit.tsx` call sites at the earlier one, thread the one differing test id as
   a prop.

Honourable mention: **B2** (28 copies of "trim or absent") is the most *mechanical* win in the
repository and should probably ride along with the next packet that touches `lib/query`.

## What this survey does not cover

- **`apps/api` (C#)** — out of scope by instruction; the Roslyn-side duplications are invisible to
  every tool used here.
- **`packages/client-ts`** — generated; excluded. Generated clones are not debt.
- **Route-file page mirrors.** The fallow pass showed five near-identical staff list pages
  (279 cloned lines: `invitations/index.tsx`, `profiles.tsx`, `tenants/$tenantId/profiles.tsx`,
  `tenants/$tenantId/users.tsx`, `tenants.tsx`). I read two of them: they share the page shell, the
  table wiring and the export-selected wiring, and differ in columns, filters and actions. They are
  *sibling* pages using a shared shell, which is the intended design — but the shell usage is not
  factored out either, so a follow-up survey that starts from `components/table/` should measure
  whether a `ListPage` composition point would remove those 279 lines honestly or just move them.
- **Coverage is a sample, not a proof.** 26 196 declarations and 297 clone groups were triaged
  mechanically; roughly 40 files were opened and read in full. Classes B and D are where an
  unread family most plausibly hides.

## Gates run for the class-A commit

- `npx oxlint --quiet .` — **0 errors**, 1290 files. The warning total is 592, unchanged from the
  base commit (the deleted module contributed 0 warnings, and every touched file lints clean), so
  the warning delta is 0. Warnings were not chased, per the brief.
- `pnpm --filter front typecheck` — green (`tsc --noEmit`, `tsconfig.server.json`,
  `tsconfig.js-surfaces.json` + the typecheck-coverage guard: 3 configs / 83 artefacts present).
- `pnpm --filter front exec vitest run` on every touched module's spec:
  `_users-search-params.test.ts` (9), `users/_edit-schema.test.ts`, `_invite-user-form-state.test.ts`,
  `tenants/$tenantId/activity.test.tsx`, `users.test.tsx` — 116 tests, all green.
- `pnpm --filter @org/shared-ts typecheck` and `pnpm --filter @org/shared-ts test` — untouched by
  this packet but run because the packet brief requires them.
- No `oxlint-disable` added. No test edited to make a fix pass: the only test touch is the moved
  search-params spec's import specifier (assertions untouched), and it is the *proof* that the
  deleted module was a duplicate rather than a fork.
- **Post-review re-run** (after reverting `A4` to two distinct declarations by owner decision):
  `pnpm --filter front typecheck` green, `npx oxlint --quiet .` 0 errors, and
  `tenants/$tenantId/activity.test.tsx` + `users.test.tsx` green — the revert restores the exact
  pre-packet declaration and touches no behaviour.
