# React Compiler

The React Compiler runs automatically via `@vitejs/plugin-react` 6.1 with the
Rust-based `oxc-transform-react` backend (`compiler: true` in
`apps/front/vite.config.ts`). It memoises components and hooks at build time,
replacing the need for hand-written `useMemo`/`useCallback` for purely
performance-driven memoisation — see the rules in
[`conventions.md`](conventions.md#react-compiler).

This page is the standing inventory of what the compiler **skips** in a real
production build, with a decision per file, plus the artifact guard that proves
the compiler ran.

## The artifact guard (`check:react-compiler`)

`pnpm --filter front check:react-compiler`
(`apps/front/scripts/guards/check-react-compiler.mts`) asserts on the **built output**
in `apps/front/dist/client/assets`, not on source code:

1. The compiler's cache runtime chunk (`assets/compiler-runtime-<hash>.js`) is
   emitted. Rolldown only emits it when at least one module was compiled, so
   its absence means zero compilation.
2. The count of compiled modules (chunks embedding the
   `react.memo_cache_sentinel` symbol) is at or above a pinned floor.

The floor is **exactly 80 %** of the measured baseline from the build that
introduced this guard (#1234): baseline 90 modules, floor 72. It is a pinned
literal in the script, not derived from whatever build it inspects — a guard
that re-derives its own threshold cannot detect the regression it exists to
catch. Re-measure with `node scripts/guards/check-react-compiler.mts --measure`,
update `MEASURED_BASELINE`, and explain it in the PR when the real count moves
deliberately.

The guard is wired like `check:design-system`: it runs as part of
`pnpm --filter front test`, as an explicit step of `just ci-front`, and as an
explicit `.github/workflows/front-ci.yml::supply-chain` step right after
"Build front" (reconciled in `scripts/ci-gate-manifest.json`). Its unit tests
live in `scripts/guards/check-react-compiler.test.mts`.

### Adversarial proof (2026-08-23)

Switching `vite.config.ts` to `viteReact({ compiler: { compilationMode:
'annotation' } })` with zero `"use memo"` annotations and rebuilding:

```
React Compiler artifact guard FAILED (MISSING_RUNTIME).
  runtime chunk : NOT FOUND
  compiled mods : 0
  required floor: 72 (80% of measured 90)
```

Every other gate stayed green on that build; only this guard went red. The
config was reverted immediately after the proof.

## Skip inventory (production build, 2026-08-25, post-rebase)

Measured on this lane's fresh `pnpm --filter front build` after the #1264
follow-ups landed **and** the branch rebased onto the current develop, which
now carries #1305 (QueryDisplay PR 2), #1310 (`publy/no-iife` extraction) and
#1314 (staff-user edit refs out of render): **13 diagnostics across 9 files**,
against **97 successfully compiled client modules** (pinned floor 72).
Duplicate diagnostics for one file are collapsed.

#1264 resolved the queued follow-ups: `useWatch()` in `_create-post-drawer`, a
shared [`useLanguageKeyedZodResolver`](../../../apps/front/src/lib/hooks/use-language-keyed-zod-resolver.ts)
hook replacing the resolver-on-language-change suppression family (7 files),
collapse of both latest-callback ref patterns, state-based known-profile-names
flow in the big forms, and preserve-memo drops. The rebase itself moved the
needle both ways, recorded here so the next pass starts from truth:

- **Fixed elsewhere:** `staff-users/$userId-edit.tsx` now compiles outright —
  #1314 replaced the component-level mechanism with module-level snapshots
  written outside render, removing even the submit-closure ref taint item 4 of
  #1264 had worked around. `$tenantId-edit.tsx`'s remaining Refs diagnostic
  stopped firing after #1305 restructured the page around QueryDisplay, and
  one of `_assign-members-drawer`'s two suppressions went quiet in the same
  restructuring. `__root.tsx` produces no diagnostic (the location write was
  already effect-wrapped); the earlier inventory listed it in error and the
  row is dropped.
- **Regressed elsewhere:** #1305's ladder migration reinstated try/finally in
  three action handlers whose #1234 rewrites had made them compile:
  `staff-users/$userId.tsx` (suspend/reactivate + delete dialog-close
  cleanup), tenant `users.tsx` (`performAction`), and tenant
  `users/$userId.tsx` (remove). All three skip again; re-queued as
  follow-ups, out of this PR's scope.
- **Previously unlisted:** `_profile-edit-details-drawer.tsx` carries a
  documented `exhaustive-deps` suppression on its open-transition reset
  effect; the diagnostic predates this refresh but was missing from the
  earlier inventory.
Line numbers drift; treat them as of this writing.

Decision vocabulary: **acceptable skip** = leave it (the pattern is load-bearing
or the fix costs more than the skip); **rewrite now** = done in #1234;
**fixed** = resolved on this or another lane after #1234; **follow-up** =
queued for a future pass (#1264 is closed; its remaining work lives here and
in the compiler issue tracker).

| File | Pattern | Decision |
| --- | --- | --- |
| `src/components/table/data-table.tsx` | suppression ×2 (`exhaustive-deps` on breakpoint-keyed effects), incompatible library (`useReactTable()`) | **acceptable skip ×3.** TanStack Table is on the compiler's incompatible-library list (`useReactTable()` returns functions that cannot be memoized safely); the suppressions carry documented reset-semantics rationale. Rewriting means replacing the table foundation. |
| `src/components/table/offset-pagination.ts` | suppression (`resetKeys` variable-length spread) | **acceptable skip.** Documented static-shape rationale; a rewrite would trade a working pagination primitive for compiler eligibility. |
| `src/components/table/use-row-selection.ts` | suppression ×2 (`visibleKey` stable-key effects) | **acceptable skip.** Same table-family rationale. |
| `src/routes/authed/staff/invitations/new.tsx` | — (was ref access during render ×3) | **fixed.** #1264 moved the known-names map and redirect timer into state/effect folds; #1305/#1310 later restructured the page (QueryDisplay ladder, IIFE extraction) without regressing it. Now compiles. |
| `src/routes/authed/staff/invitations/table-columns.tsx` | — (was try/finally) | **rewritten in #1234.** Cleanup hoisted after the try/catch. Now compiles. |
| `src/routes/authed/staff/profiles-new.tsx` | — (was ref access during render: `hasSavedRef` read) | **fixed in #1264.** The nav guard reads `formState.isDirty` directly; after a successful save the guard is re-armed synchronously via `reset()` before navigating. Now compiles. |
| `src/routes/authed/staff/staff-users/$userId-edit.tsx` | — (was ref access during render ×5 + a tainted submit closure) | **fixed.** Item 4 of #1264 removed the five render-time reads; develop's #1314 then replaced the mechanism wholesale with module-level snapshots written outside render, which also untainted the submit closure. Now compiles. |
| `src/routes/authed/staff/staff-users/$userId.tsx` | try/finally ×2 (suspend/reactivate + delete handlers close their dialogs in `finally`) | **follow-up (regressed).** Rewritten in #1234; #1305's QueryDisplay ladder migration reinstated the `finally` blocks, so the component skips again. Needs the hoist-cleanup pass redone. |
| `src/routes/authed/staff/staff-users/_change-email-dialog.tsx` | — (was resolver suppression) | **fixed in #1264** via the shared language-keyed resolver hook. Now compiles. |
| `src/routes/authed/staff/tenants-new.tsx` | — (was resolver suppression) | **fixed in #1264** via the shared language-keyed resolver hook. Now compiles. |
| `src/routes/authed/staff/tenants/$tenantId-edit.tsx` | — (was render-time ref read + resolver suppression) | **fixed.** The resolver suppression went in #1264; the remaining Refs diagnostic stopped firing after #1305 restructured the page around QueryDisplay. Now compiles. |
| `src/routes/authed/staff/tenants/$tenantId/invitations.tsx` | — (was preserve-memo on `handleRevoke` + columns chain) | **fixed in #1264.** Manual `useCallback`/`useMemo` wrappers dropped; handlers are plain functions and the compiler caches per value. Now compiles. |
| `src/routes/authed/staff/tenants/$tenantId/users.tsx` | try/finally (`performAction` clears the pending action in `finally`) | **follow-up (regressed).** Same #1234 → #1305 story as the staff-user detail page. Skips again; queued. |
| `src/routes/authed/staff/tenants/$tenantId/users/$userId-edit.tsx` | — (was resolver suppression) | **fixed in #1264** via the shared language-keyed resolver hook. Now compiles. |
| `src/routes/authed/staff/tenants/$tenantId/users/$userId.tsx` | try/finally (remove handler clears `pendingRemove` in `finally`) | **follow-up (regressed).** Same #1234 → #1305 story. Skips again; queued. |
| `src/routes/authed/staff/tenants/$tenantId/_invite-user-drawer.tsx` | — (was resolver suppression) | **fixed in #1264** via the shared language-keyed resolver hook. Now compiles. |
| `src/routes/authed/staff/tenants/$tenantId/profiles/$profileId/_assign-members-drawer.tsx` | suppression (`rowAccountIdsKey` stable-key effect) | **acceptable skip.** Documented joined-key rationale; a second suppression stopped firing after #1305's QueryDisplay restructure. |
| `src/routes/authed/staff/tenants/$tenantId/profiles/_profile-edit-details-drawer.tsx` | suppression (`exhaustive-deps` on the open-transition reset effect) | **acceptable skip.** Deliberate re-seed keyed on open/profile-id so a refetch cannot discard an in-progress draft (commented as such). Newly listed: the diagnostic predates this refresh but the earlier inventory omitted it. |
| `src/routes/authed/staff/tenants/$tenantId/profiles/_profile-permissions-tab.tsx` | suppression (`grantedSignature` stable key) | **acceptable skip.** Documented signature-key rationale. |
| `src/routes/authed/tenant/posts/$postId/edit.tsx` | — (was try/finally) | **rewritten in #1234.** Now compiles. |
| `src/routes/authed/tenant/posts/_create-post-drawer.tsx` | — (was incompatible library: `watch()` read during render) | **fixed in #1264.** Subscribes with `useWatch()` instead of calling `watch()` in render. Now compiles. |
| `src/routes/accept-invitation.tsx` | — (was throw-in-try + try/finally) | **rewritten in #1234.** Now compiles. |

Rewrites landed in #1234 (9 files, all now compile): staff-user detail suspend/
delete handlers, tenant-user details membership/remove handlers, tenant users
`performAction`, both invitation-revoke flows (staff detail + tenant list),
the invitations table revoke action, accept-invitation submit, and post-edit
submit — each hoisting its `finally` cleanup onto every exit path — plus the
invitation copy-link flow, which no longer throws from inside `try/catch`.
#1264 resolved every follow-up it queued. Three of those handlers have since
regressed under #1305 and are queued again (rows above); three further files
were fixed outright by other lanes (#1305/#1314 restructures). Net today:
13 skips across 9 files, 97 compiled modules.

## Skip patterns the compiler reports

| Diagnostic | Meaning | Typical fix |
| --- | --- | --- |
| `(BuildHIR::lowerStatement) Handle TryStatement with a finalizer ('finally') clause` | The component contains `try { … } finally { … }`. | Hoist the `finally` body onto every exit path of the guarded block (what #1234 did). |
| `(BuildHIR::lowerStatement) Support ThrowStatement inside of try/catch` | A `throw` appears inside a guarded block. | Record the failure instead of throwing, or throw outside the guarded region. |
| `Cannot access refs during render` | A `ref.current` is read or written in render scope. | Move ref work into effects/handlers; use state when render needs the value. |
| `React rule suppression prevents optimization` | An `eslint-disable-next-line react-hooks/*` comment opts the function out (the compiler refuses to compile code that disabled a Rules-of-React check). | Remove the suppression and satisfy the rule. For the recurring "zod resolver rebuilt on language change" family, the follow-up replaces the suppression pattern wholesale. |
| `Existing memoization could not be preserved` | Manual `useMemo`/`useCallback` deps disagree with what the compiler infers. | Drop the manual memoisation (preferred under the compiler) or align deps exactly. |
| `Use of incompatible library` | A library API returns values the compiler cannot safely memoise (`useReactTable()`, RHF `watch()`). | Isolate the call, or accept the skip until upstream support lands. |

None of these fail the build; the compiler degrades gracefully by skipping
that specific component or hook. That grace is exactly why the artifact guard
above exists.

## Sourcemaps (`[SOURCEMAP_BROKEN]` warnings)

Production builds emit ~465 `[SOURCEMAP_BROKEN]` warnings shaped like
"Sourcemap is likely to be incorrect: a plugin (vite:react-compiler) was used
to transform files, but didn't generate a sourcemap for the transformation"
(the issue text counted 5 because CI logs truncate). Cause, verified by reading
the plugin source (`@vitejs/plugin-react` 6.1, `createReactCompilerPlugin`):

- In annotation mode the plugin pre-filters modules with
  `/['"]use memo['"]/` and only invokes the compiler on matches, so unannotated
  files pass through untouched and no sourcemap question arises.
- In our full-compilation mode the plugin must run the transform on **every**
  candidate module to learn whether the compiler will skip it. When the
  compiler skips, oxc returns no map while the plugin still returns transformed
  code (JSX lowering still applied), and rolldown warns `SOURCEMAP_BROKEN`.
- One warning is emitted per skipped module per environment (the 13
  client-graph skips inventoried above plus SSR-side candidates ≈ the 494
  warnings observed on the 2026-08-25 build).

This is upstream-shaped (plugin + oxc emitting an identity map for
skipped-but-JSX-lowered modules would silence it); no local config removes it
without disabling either the compiler or sourcemaps. Consequence today: source
maps through compiled-and-skipped boundaries may be less precise. Tracked for
upstream follow-up in the #1234 follow-up issue.

## Related

- [`conventions.md`](conventions.md#react-compiler) — the rules (no new manual
  memoisation; Rules of React are load-bearing).
- [Local CI gate](../local-ci-gate.md) — where `check:react-compiler` sits in
  `just ci-front`.
