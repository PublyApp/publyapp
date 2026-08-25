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
(`apps/front/scripts/check-react-compiler.mjs`) asserts on the **built output**
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
catch. Re-measure with `node scripts/check-react-compiler.mjs --measure`,
update `MEASURED_BASELINE`, and explain it in the PR when the real count moves
deliberately.

The guard is wired like `check:design-system`: it runs as part of
`pnpm --filter front test`, as an explicit step of `just ci-front`, and as an
explicit `.github/workflows/front-ci.yml::supply-chain` step right after
"Build front" (reconciled in `scripts/ci-gate-manifest.json`). Its unit tests
live in `scripts/check-react-compiler.test.mjs`.

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

## Skip inventory (production build, 2026-08-23, post-rewrite)

Measured on this lane's `pnpm --filter front build` after the cheap rewrites
below landed: **36 diagnostics across 20 files**, against 90 successfully
compiled client modules. Duplicate diagnostics for one file are collapsed.
Line numbers drift; treat them as of this writing.

Decision vocabulary: **acceptable skip** = leave it (the pattern is load-bearing
or the fix costs more than the skip); **rewrite now** = done in #1234;
**follow-up** = queued in [#1264](https://github.com/PublyApp/publyapp/issues/1264).

| File | Pattern | Decision |
| --- | --- | --- |
| `src/components/table/data-table.tsx` | suppression ×2 (`exhaustive-deps` on breakpoint-keyed effects), incompatible library (`useReactTable()`) | **acceptable skip ×3.** TanStack Table is on the compiler's incompatible-library list (`useReactTable()` returns functions that cannot be memoized safely); the suppressions carry documented reset-semantics rationale. Rewriting means replacing the table foundation. |
| `src/components/table/offset-pagination.ts` | suppression (`resetKeys` variable-length spread) | **acceptable skip.** Documented static-shape rationale; a rewrite would trade a working pagination primitive for compiler eligibility. |
| `src/components/table/use-row-selection.ts` | suppression ×2 (`visibleKey` stable-key effects) | **acceptable skip.** Same table-family rationale. |
| `src/routes/__root.tsx` | ref access during render (`locationRef.current = location`) | **acceptable skip.** Deliberate latest-value ref so the session-invalidation backstop reads the location without resubscribing per navigation (commented as such). Moving it into an effect would resubscribe the channel on every navigation. |
| `src/routes/authed/staff/invitations/new.tsx` | ref access during render ×3 (`knownProfileNamesRef` read during render; timeout ref) | **follow-up.** The render-time Map read can become state + effect; needs care around the redirect-timeout cleanup. |
| `src/routes/authed/staff/invitations/table-columns.tsx` | — (was try/finally) | **rewritten in #1234.** Cleanup hoisted after the try/catch. Now compiles. |
| `src/routes/authed/staff/profiles-new.tsx` | ref access during render (`hasSavedRef` read) | **follow-up.** Convert to state or move the read behind an event handler. |
| `src/routes/authed/staff/staff-users/$userId-edit.tsx` | ref access during render ×5 (form-hydration refs: `hasSavedRef`, `knownProfileNamesRef` Map copy + `rememberStaffProfileNames` during render) | **follow-up.** The render-time `knownProfileNamesRef.current` copy is the blocker; it needs a redesign of how known profile names flow into option building. |
| `src/routes/authed/staff/staff-users/$userId.tsx` | — (was try/finally ×2) | **rewritten in #1234.** Dialog-close cleanup hoisted onto every exit path. Now compiles. |
| `src/routes/authed/staff/staff-users/_change-email-dialog.tsx` | suppression (`resolver` useMemo rebuilds on language change) | **follow-up.** Part of the shared "zod resolver memoised on `i18n.language` with a suppression" family below. |
| `src/routes/authed/staff/tenants-new.tsx` | suppression (same resolver-on-language-change family) | **follow-up.** Same family. |
| `src/routes/authed/staff/tenants/$tenantId-edit.tsx` | suppression (same resolver family) | **follow-up.** Same family. |
| `src/routes/authed/staff/tenants/$tenantId/invitations.tsx` | preserve-memo (`handleRevoke` useCallback deps vs inferred), finally clause inside the callback body | **follow-up.** Dropping the manual `useCallback`/`useMemo` wrappers here would let the compiler take over, but the component also feeds columns through manual memoisation; do it together. |
| `src/routes/authed/staff/tenants/$tenantId/users.tsx` | preserve-memo (`onUserSessionExpired` empty-deps `useCallback`) | **follow-up.** Drop the manual memoisation and let the compiler infer dependencies. |
| `src/routes/authed/staff/tenants/$tenantId/users/$userId-edit.tsx` | suppression (resolver family) | **follow-up.** Same family. |
| `src/routes/authed/staff/tenants/$tenantId/users/$userId.tsx` | — (was try/finally) | **rewritten in #1234.** Now compiles. |
| `src/routes/authed/staff/tenants/$tenantId/_invite-user-drawer.tsx` | suppression (resolver family) | **follow-up.** Same family. |
| `src/routes/authed/staff/tenants/$tenantId/profiles.tsx` | ref access during render ×4 + preserve-memo (`openEditDrawerRef` latest-callback pattern) | **follow-up.** The "latest callback in a ref" indirection exists to keep handlers stable; under the compiler it can collapse to plain functions. Needs its own careful pass. |
| `src/routes/authed/staff/tenants/$tenantId/profiles/$profileId/_assign-members-drawer.tsx` | suppression ×2 (documented reset-key rationales) | **acceptable skip.** Both suppressions document deliberate narrower-trigger semantics. |
| `src/routes/authed/staff/tenants/$tenantId/profiles/_profile-edit-details-drawer.tsx` | suppression ×2 (resolver family + draft-protection effect) | **follow-up** (resolver half); draft-protection half acceptable. |
| `src/routes/authed/staff/tenants/$tenantId/profiles/_profile-form-drawer.tsx` | suppression (resolver family) | **follow-up.** Same family. |
| `src/routes/authed/staff/tenants/$tenantId/profiles/_profile-permissions-tab.tsx` | suppression (`grantedSignature` stable key) | **acceptable skip.** Documented signature-key rationale. |
| `src/routes/authed/tenant/posts/$postId/edit.tsx` | — (was try/finally) | **rewritten in #1234.** Now compiles. |
| `src/routes/authed/tenant/posts/_create-post-drawer.tsx` | incompatible library (`useForm().watch()` read via `methods.watch('body')`) | **follow-up.** Subscribe with `useWatch()` instead of calling `watch()` in render; small but touches form wiring. |
| `src/routes/accept-invitation.tsx` | — (was throw-in-try + try/finally) | **rewritten in #1234.** Now compiles. |

Rewrites landed in #1234 (9 files, all now compile): staff-user detail suspend/
delete handlers, tenant-user details membership/remove handlers, tenant users
`performAction`, both invitation-revoke flows (staff detail + tenant list),
the invitations table revoke action, accept-invitation submit, and post-edit
submit — each hoisting its `finally` cleanup onto every exit path — plus the
invitation copy-link flow, which no longer throws from inside `try/catch`.

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
- One warning is emitted per skipped module per environment (~36 skips in the
  client graph plus SSR-side candidates ≈ the observed ~465).

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
