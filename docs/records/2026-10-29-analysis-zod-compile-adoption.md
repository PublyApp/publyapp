# zod's native `compile()` adopted where it is free, and the construction win that mattered

Date: 2026-10-29. Analysis + adoption record for ZOD-COMPILE-1
([#1903](https://github.com/PublyApp/publyapp/issues/1903), follow-up to
[#2258](https://github.com/PublyApp/publyapp/pull/2258)). Supersedes nothing; extends
[`2026-10-29-analysis-zod-compiler-evaluation.md`](2026-10-29-analysis-zod-compiler-evaluation.md),
which refused the third-party `zod-compiler` package and pointed at `z.compile()` as the honest
alternative. No dependency added, no build plugin, no lint suppression.

Owner decision this record implements: adopt zod's **own** `z.compile()` (present in the already
installed zod 4.6.7) rather than the third-party package — while respecting the two facts the
evaluation established: the dominant cost is **schema construction inside render bodies**, and
compiling an individual small schema can be slower than interpreting it.

## Verdict in one paragraph

The construction half is where the win was, and it is now gone: **eleven** schemas (and the
resolvers around them) that were rebuilt inside render bodies — or inside a per-call helper — are
built once per language, or once per module. `z.compile()` is adopted at exactly the two sites where
it costs nothing at all: the two per-request payload schemas in `src/server/i18n-locale.ts`.
It is **refused** everywhere else, for three measured reasons: the form resolvers reach zod through
`parseAsync`, which bypasses the compiled fast path by design (compiling them is 7 % _slower_); the
browser is under a CSP that forbids `new Function`, so compiled code can never run there; and a
module-scope `compile()` call in any client-reachable module ships **+30.2 kB** of never-executable
JS, measured.

## Method

Real repo modules, not reproduced schemas (the evaluation had to reproduce them; this does not).
The two front modules under test (`_settings-general-schema.ts` + `tenant-organization-profile-fields.ts`,
and `lib/server/auth-actions.ts`) were bundled with esbuild and run in plain Node 24.19.0, so the
numbers carry the app's real imports rather than a hand-copied chain. Best of 7 rounds × 20 000
iterations after 5 000 warm-up calls, `performance.now()`. One machine (the same host the evaluation
used); absolute nanoseconds move with load, the ratios are what the argument rests on. Harness not
committed.

Two separate measurements, kept separate on purpose:

- **construction** — what a render body paid per render before, and what it pays now;
- **validation** — what a keystroke/submit/request pays once the schema exists.

## 1. Hoists: construction out of the render body

`general.tsx` was the named example (`resolver: zodResolver(getSettingsGeneralSchema(t))` in the
component body). It was not alone: **eight** call sites rebuilt a schema and its resolver on every
render, two passed an inline arrow as the `useLanguageKeyedZodResolver` factory (defeating that
hook's own memo), and the email helper rebuilt a schema on every call.

| #   | Before — built inside a render body / a call                                                                          | After — where it is built now                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | `routes/authed/tenant/settings/general.tsx:93` — `zodResolver(getSettingsGeneralSchema(t))`                           | `useLanguageKeyedZodResolver(getSettingsGeneralSchema, ['settings','common'])` — once per language |
| 2   | `routes/authed/tenant/settings/_discord-connect-drawer.tsx:54`                                                        | `useLanguageKeyedZodResolver(getSchema, 'settings')`                                               |
| 3   | `routes/authed/tenant/settings/_mastodon-connect-drawer.tsx:76`                                                       | `useMemo(..., [t, copy.help])`                                                                     |
| 4   | `routes/authed/tenant/settings/_bluesky-connect-drawer.tsx:70`                                                        | `useMemo(..., [t, mode])`                                                                          |
| 5   | `routes/authed/tenant/posts/_create-post-drawer.tsx:71`                                                               | `useLanguageKeyedZodResolver(getSchema, ['posts','common'])`                                       |
| 6   | `routes/authed/tenant/posts/$postId/edit.tsx:102`                                                                     | `useLanguageKeyedZodResolver(getSchema, ['posts','common'])`                                       |
| 7   | `routes/authed/tenant/account/profile.tsx:72`                                                                         | `useLanguageKeyedZodResolver(getAccountProfileSchema, ['account','common'])`                       |
| 8   | `routes/field-validation.tsx:44` — inline `z.object` in the body                                                      | module-scope `FIELD_VALIDATION_SCHEMA` + resolver                                                  |
| 9   | `routes/authed/staff/tenants/$tenantId/_invite-user-form-state.ts:886` — inline arrow factory                         | module-scope `getInviteFormSchema` (it never used `t`)                                             |
| 10  | `routes/authed/staff/_tenants-new-form.tsx:64` — inline arrow closing over a ref                                      | `useCallback([], …)` factory (the ref is stable)                                                   |
| 11  | `routes/authed/staff/tenants/tenant-organization-profile-fields.ts:15` — `.trim().pipe(z.email())` built **per call** | module-scope `EMAIL_ADDRESS_SCHEMA`                                                                |

Sites 9 and 10 were not merely per-render: because the factory's identity changed every render, the
hook's `useMemo([buildSchema, t])` re-ran every render, so the schema _and_ `zodResolver` were rebuilt
on every render even though a memo was already in place.

Sites that were already hoisted and are untouched: `login.tsx`, `signup.tsx`, `verify-email.tsx`,
`_accept-invitation-views.tsx`, `_reset-password-forms.tsx` (×2), `$userId-general.tsx`,
`_use-edit-form-data.ts`, `_change-email-dialog.tsx`, `$tenantId-edit.tsx`, `$userId-edit.tsx`,
`profiles.tsx`, `invitations/new.tsx`, `profiles-new.tsx`, `use-profile-edit-details-form.ts`
(schema memoised; only the `zodResolver(...)` closure is rebuilt per render — measured at **20 ns**,
not worth a diff).

## 2. Numbers — the settings-general form (the named example)

| Measurement                                                                           | Before                           | After                                |                                         |
| ------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------ | --------------------------------------- |
| `getSettingsGeneralSchema(t)` construction, per call                                  | **99.4 µs** (99–131 across runs) | **0** (one memo comparison, 0.01 µs) | construction removed                    |
| end-to-end RHF resolver call, valid payload: build schema + build resolver + validate | **143.1 µs**                     | **10.8 µs**                          | **13.3×**                               |
| the same, with the schema `compile()`d                                                | —                                | **11.5 µs**                          | **compiling it is 7 % slower**          |
| validation alone, sync `parse` — plain → compiled                                     | 9.37 µs → **5.35 µs**            |                                      | fast path exists, 1.75×                 |
| validation alone, `parseAsync` — plain → compiled                                     | 10.6 µs → **10.6 µs**            |                                      | fast path unreachable                   |
| `isValidEmailAddress`, per call (build schema + parse) → module-scope schema          | **6.72 µs** → **0.166 µs**       |                                      | **40×**, two of the nine fields call it |

The 143.1 µs figure is larger than construction (99.4) + validation (10.6) because 20 000 per-iteration
schema allocations per round drag the allocator; that is part of what a per-render rebuild costs, not
an artefact to explain away.

### Why the form schemas are not compiled

`@hookform/resolvers` 5.9.1 calls `schema.parseAsync(input, options)`. zod's compiled wrapper bypasses
its fast path whenever the parse context is async — `parse.js` says so explicitly ("no fast path: the
compiler keeps async parses on the runtime, because a promise-returning callback that is not declared
async compiles to a throw"). Measured: `parseAsync` compiled is **7 % slower** than plain (the wrapper
cost with none of the benefit), so the single hottest validation path in this app is exactly the one
where compiling loses. `zodResolver(schema, undefined, { mode: 'sync' })` would switch the resolver to
`schema.parse` and open the fast path (5.35 µs, 1.75×), but it changes semantics — an async refinement
would throw `$ZodAsyncError` instead of being awaited — and no schema here needs it, so it is a lever,
not a change: pull it if a form ever becomes validation-bound.

## 3. Numbers — the per-request API payload (`RegisterInputSchema`, 4 fields)

| Measurement         | Before (plain) | After (compiled) |                                                                                                                |
| ------------------- | -------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- |
| valid payload       | **555 ns**     | **79 ns**        | **7.0×**                                                                                                       |
| rejected payload    | 6.27 µs        | 6.77 µs          | **8 % slower** (compiled fast path runs first, then falls back to the runtime parser that produces the issues) |
| one-off `compile()` | —              | **41 µs**        | paid once, at module init                                                                                      |

The rejected path is the price of behaviour identity: messages, keys and issue paths are still
produced by zod's own runtime parser, which is why they cannot change.

## 4. What was deliberately not compiled, and why

**(a) Every form schema — because the resolver never reaches the fast path.** Measured above: 7 %
slower. This covers 20 `resolver:` registrations across the app, including the eight sites hoisted in
§1.

**(b) `isValidEmailAddress` — because the browser cannot run compiled code.** The production CSP
(`packages/shared-ts/src/lib/csp.ts`, applied by `src/server/csp.ts`) puts `script-src` under a nonce
and adds `'unsafe-eval'` only in development. `z.compile()` generates its validator with
`new Function`, so in production browsers it throws and zod's non-strict `compile()` hands the schema
back unchanged. Verified by replacing `Function` with a throwing proxy: `compile(schema) === schema`,
parsing and messages unaffected. A hoisted-and-compiled email schema would be 82 ns instead of 166 ns
on this machine — **2× of nothing**, and unreachable in the browser anyway.

**(c) The eight `src/lib/server/*` `.validator()` payload schemas — because the compiler would ship to
the browser.** These are server-side (TanStack Start runs `.validator()` only when `env === "server"`)
and sync-parsed, so the compiled path _would_ be used. But the modules that declare them are imported
by client routes, and the client bundle keeps the module-level schema expressions. Measured on the real
production build:

| Build                                                             | `dist/client`                        |
| ----------------------------------------------------------------- | ------------------------------------ |
| baseline (`origin/develop`)                                       | 7 081 568 B                          |
| these hoists only, no `compile()`                                 | 7 082 871 B                          |
| hoists + `compile()` at module scope in a client-reachable module | 7 113 075 B (**+30 204 B, +0.43 %**) |

That is the evaluation's bundle objection all over again, for code the CSP makes unexecutable. The
**delta** is the argument, not the absolute baseline: the three builds above were measured on the
same tree in one sitting, and the baseline figure moved again when the i18n migration
([#2254](https://github.com/PublyApp/publyapp/pull/2254)) landed and reorganised those chunks. The
same measurement is why `src/server/i18n-locale.ts` was **not** written the obvious way either: its
module-scope `compile()` call cost the same ~30 kB, because `use-switch-locale.ts` (a client hook)
imports `setLocale` from it.

**(d) Nothing was compiled in the browser at all**, for the CSP reason in (b).

## 5. What was compiled

Five lines of the adoptable form, at the two per-request payload schemas where it is provably free:

| Site                                                         | Schema                 | Measured                           |
| ------------------------------------------------------------ | ---------------------- | ---------------------------------- |
| `src/server/i18n-locale.ts` — `loadI18nForRequest` validator | `LoadI18nInputSchema`  | compiled on first validation, once |
| `src/server/i18n-locale.ts` — `setLocale` validator          | `SetLocaleInputSchema` | compiled on first validation, once |

Both are built by a module-scope factory and compiled inside a memoised getter
(`compiledLoadI18nInput ??= buildLoadI18nInputSchema()`), never at module scope. That is deliberate:
the only caller is the `.validator()` callback, which the client build strips, so the client bundle
drops the getter, the factory and the `compile` binding — verified: the production client build with
this change is **78 bytes smaller** than the same build without it (7 082 793 B vs 7 082 871 B), and
the only chunk containing the compiler is zod's own shared barrel, which already shipped it before
this change. A module-scope `compile()` call costs +30 kB (measured in §4c); the same call inside a
getter that only server code reaches costs nothing.

The recipe, if a future payload is worth it: build lazily, never at module scope, and never call the
getter from anything the client can reach.

## 6. Behaviour identity

- **Error messages, keys, paths and order**: the compiled wrapper runs the generated validator first
  and, on failure, hands the parse to the original runtime parser — the issues are, by construction,
  the ones zod always produced. Verified directly on the real settings schema (trim + `refine` +
  optional + array + enum) across a valid payload, a five-way invalid payload and an empty payload:
  identical `success`, identical output (including `.trim()` applied inside the compiled path),
  identical issue paths, messages and order.
- **i18n**: unchanged. InterZod's error map is only consulted by the runtime parser, which is what
  produces every failing issue; schema-level `message:` literals are baked into the schema either way.
- **Async refinements**: the repo has none (`refine(async`/`transform(async`/`superRefine(async`: zero
  hits), and compiling would not be used on that path anyway.
- **`z.array` output**: the compiled path builds a fresh output, as the runtime does; the settings
  schemas' array outputs compared deep-equal.

## Verification

`pnpm --filter front typecheck`, `pnpm --filter front build`, `pnpm --filter front check:design-system`,
and the touched suites: the settings/drawers/posts/account/staff route suites (8 files, 175 tests) and
the server-action suites (17 files, 113 tests) — all green without weakening a test. `RegisterInputSchema`
is untouched by this change, so `auth-actions.test.ts` still pins its accept/reject behaviour unchanged.

## What would make more of this worth doing

1. **A real server-only boundary for validated payloads.** Every `.validator()` schema in this app
   lives in a module the client bundle also contains. Give those schemas a module the client graph
   never touches (or hand them to a `serverOnly` wrapper the bundler strips) and the eight
   `src/lib/server/*` schemas become free to compile — at which point the +30 kB measurement in §4c
   no longer applies.
2. **A validation-bound surface.** If a payload ever gets validated thousands of times per second
   against a schema built once, compile it and measure again — that is the shape where the fast path
   pays for itself (7× on the valid path here).
3. **If a form ever becomes validation-bound**, `{ mode: 'sync' }` on `zodResolver` is the lever that
   makes form validation compiled-eligible (5.35 µs vs 9.37 µs). It changes failure semantics for
   async refinements, so it needs its own decision.
