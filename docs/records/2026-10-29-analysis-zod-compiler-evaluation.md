# zod-compiler 2.x against this repository: measure, then refuse

Date: 2026-10-29. Analysis, with a verdict. No dependency, build-plugin, or config change is
committed; the only committed file is this record. Adopting the package, if that ever happens, is
its own PR.

Subject: [gajus/zod-compiler](https://github.com/gajus/zod-compiler) 2.0.7 (published 2026-09-24),
evaluated for [#1903](https://github.com/PublyApp/publyapp/issues/1903) against the zod usage this
repository actually has.

**Verdict: refuse.** The three numbers that decided it:

1. **5 compiled validators in the whole production build** — of 45 zod-importing files and 55
   schema factories. Auto mode reaches the two module-scope exported schemas and three hoisted
   leaf expressions. **Not one form-resolver schema is compiled.**
2. **1,783 ns vs 1,978 ns** — the compiled path's real advantage over a one-line hand hoist on the
   representative form resolver: **10 %**. Compiling the form schema itself, without the hoist,
   is **1.1×** (13,013 ns vs 13,981 ns).
3. **64.8 µs vs 2.5 µs** — a factory call that builds the settings-general schema costs ~26× the
   validation it then enables, and the page rebuilds it **inside the render body**.
   zod-compiler compiles validators; it does nothing for construction.

## The stated blocker is stale, and now verified rather than assumed

`#1903` was parked on "zod-compiler v2 requires Zod ≥ 4.5, the repo is on 4.4.3". Both halves have
moved, and the requirement was checked against the published metadata, not the issue text:

| Fact                | Value                                                     | Source                                        |
| ------------------- | --------------------------------------------------------- | --------------------------------------------- |
| zod-compiler latest | **2.0.7** (2026-09-24)                                    | `npm view zod-compiler version dist-tags`     |
| required peer       | **`zod: ^4.5.0`**                                         | `npm view zod-compiler peerDependencies`      |
| optional peers      | `@swc/core: >=1.3.0`, `@rsbuild/core: ^1.0.0 \|\| ^2.0.0` | `peerDependenciesMeta`, both `optional: true` |
| repo declaration    | `zod: 4.6.7` in `apps/front` and `packages/shared-ts`     | both `package.json`                           |
| repo installed      | **4.6.7** resolved in both packages                       | `require('zod/package.json').version`         |
| repo override       | `zod@<4.6.6 → ^4.6.6`                                     | root `package.json` → `pnpm.overrides`        |
| qualifies?          | **yes** — 4.6.7 satisfies `^4.5.0`                        | —                                             |

Empirical confirmation: `pnpm add -Dw zod-compiler@2.0.7` installed with **no peer warning** (the
only unmet peers reported were pre-existing `vite` ones from `@vitest/mocker`), and the package's
own gate accepted the schema files it could load. The tarball README states the requirement
explicitly: _"Requires Zod ≥ 4.5 … An older Zod is refused with an explicit error."_ The release
that introduced it is 2.0.3 (_"refuse zod below 4.5 at extraction and warn once from jit and the
build plugin"_).

Open issues on the project, at evaluation time: **exactly one** — [#22](https://github.com/gajus/zod-compiler/issues/22),
"Zod Mini schema cannot be compiled manually", a TypeScript typing gap for `zod/mini`. This repo
imports `zod` only (zero `zod/mini`, `zod/v4` or `zod/v4/core` value imports), so #22 does not
apply. No open issue touches `.extend`, `.merge`, factory-built schemas, or Vite.

**So the blocker is genuinely gone. The refusal below is about the numbers, not the version.**

## How zod is actually used here

Counted on `lane/zod-eval` at develop `d52ee5782`, excluding `node_modules`, tests and specs.

| Measure                                                  | This repo                          | Issue #1903 said |
| -------------------------------------------------------- | ---------------------------------- | ---------------- |
| files importing `zod`                                    | **45**                             | 42               |
| schema factory functions (`get*Schema` / `build*Schema`) | **55**                             | —                |
| `z.object(...)` literals                                 | **56**                             | —                |
| `schema.parse(...)` call sites                           | **12**                             | —                |
| `schema.safeParse(...)` call sites                       | **1**                              | —                |
| RHF `resolver:` registrations                            | **20** (across 30 `useForm` sites) | 21               |
| "sites" total                                            | **33**                             | 80               |

The "80 sites" figure does not reproduce. A `\.parse\(` grep over `apps/front/src` and
`packages/shared-ts/src` returns more than 80 hits, but the overwhelming majority are
`JSON.parse(...)` and `cookie.parse(...)`; exactly 12 are zod schema parses. If #1903 counted those,
the 80 is a grep artefact.

### Where each site runs

| When it runs                                                  | Sites                                                                                                                                                                               | Count |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **Once at startup**                                           | `lib/env.ts` (memoised `getPublicEnv`/`getServerEnv`), `lib/i18n/namespaces.ts` (module-scope const)                                                                                | 2     |
| **Once per request**                                          | every `.validator((d) => Schema.parse(d))` on a TanStack Start server function — `auth-actions.ts` (6), `session-actions.ts` (2), `invitation-actions.ts` (2), `i18n-locale.ts` (2) | 12    |
| **Per submit, then per change after the first failed submit** | the 20 `resolver:` registrations                                                                                                                                                    | 20    |
| **Inside a validation**                                       | `isValidEmailAddress` builds `z.string().trim().pipe(z.email())` and `safeParse`s it, per call                                                                                      | 1     |

That third row is worth stating plainly, because it is the premise the adoption case rests on: **no
form in this repo sets `mode` or `reValidateMode`**. There is not one occurrence of
`mode: 'onChange' | 'onBlur' | 'onTouched' | 'all'` in `apps/front/src`, so every form runs React
Hook Form's defaults — `mode: 'onSubmit'`, `reValidateMode: 'onChange'`. A resolver therefore runs
on submit and then on every change **only once the form is already showing an error**. "Per
keystroke" is true for a form the user is failing, not for a clean one.

### The structural fact the whole evaluation turns on

**No schema in this repo is a module-scope `z.object({...})` export.** They are built by factories
that take either an `InterZod` instance (a class wrapping `z` that carries the locale and a
translator — `packages/shared-ts/src/lib/zod/InterZod.ts`) or a bare `t()` function:

```ts
export const getSettingsGeneralSchema = (t: (key: string) => string) =>
	z.object({ name: z.string().trim().min(5, { message: t('settings:name-min-length') }), … });
```

and they are consumed at render time — `apps/front/src/routes/authed/tenant/settings/general.tsx:93`
literally calls `resolver: zodResolver(getSettingsGeneralSchema(t))` **inside the component body**,
so a fresh schema and a fresh resolver are built on every render. Four schemas are additionally
derived with `.extend()` / `.omit()` / `.partial()`
(`getRegisterSchema(...).omit({password}).extend(...)` in `lib/server/auth-actions.ts:62`,
`getLoginSchema(z).extend(...)` in `auth.validations.ts:60`,
`getNewTenantSchemaServerSide(z).extend(...)` in `tenant-client.validations.ts:11`,
`getUpdateStaffUserSchema` in `staff-user.validations.ts:23`).

## What the compiler actually reaches

### Discovery, standalone (`zod-compiler check`, one process per file)

Run over all 45 zod-importing files:

| Outcome                   | Files                                                                                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **schemas found**         | **2** — `lib/i18n/namespaces.ts` (`I18nNamespaceListSchema`), `lib/server/auth-actions.ts` (`RegisterInputSchema`)                                                                                                    |
| `no Zod schemas exported` | **36**                                                                                                                                                                                                                |
| failed to load            | 7 — 4 are test files; of the 3 real ones, `src/server/i18n-locale.ts` dies with `(intermediate value).glob is not a function` because discovery executes the module in plain Node and `import.meta.glob` is Vite-only |

Cold wall clock for that sweep: **45.4 s** across the 45 files (a process each). A single-process
sweep is not available: `zod-compiler generate apps/front/src -o …` aborts on the first non-TS
import (`Unknown file extension ".svg"` for `assets/gray-ui/logo.svg`).

`i18n-locale.ts` is the illustrative case: it _does_ hold a genuine module-scope schema
(`LoadI18nInputSchema = z.object({ namespaces: I18nNamespaceListSchema })`), and discovery cannot
see it. The README is explicit that a file that throws "falls back to runtime Zod silently".

### Discovery, inside the real Vite build

The build plugin is better than the CLI, because `hoist` (on by default) also compiles schema
expressions it meets inside functions. Measured by adding `zodCompiler({ apply: 'build' })` to
`apps/front/vite.config.ts`, building, and counting `__zcMkv(...)` in `dist/`:

**5 compiled validators in the entire production build:**

| Compiled thing                                                  | Where                                      |
| --------------------------------------------------------------- | ------------------------------------------ |
| `I18nNamespaceListSchema`                                       | `lib/i18n/namespaces.ts` — one-shot        |
| `RegisterInputSchema`                                           | `lib/server/auth-actions.ts` — per request |
| `z.string().optional()` (hoisted as `_zh_8d83eaf0`)             | a leaf of `_settings-general-schema.ts`    |
| `z.string().optional()` (hoisted as `_zh_85e6df9b`)             | a leaf in `_invite-user-drawer-host`       |
| `z.string().trim().pipe(z.email())` (hoisted as `_zh_08289b30`) | inside `isValidEmailAddress`               |

The last one is the only meaningful win in the build, and it is a win from **hoisting**, not from
compiling: `isValidEmailAddress` becomes `(value) => _zh_08289b30.safeParse(value).success`, so it
stops constructing two schemas per call. The form schema around it is untouched — the emitted
`general-*.js` still reads `var getSettingsGeneralSchema = (t) => z$1.object({ … })`.

`hoist` cannot do better: the README restricts it to "expressions built from imported bindings and
literals", and anything touching a local stays put. `t` is a parameter. Every form schema in this
repo is therefore permanently out of reach of auto mode.

## The payoff, measured on this repo's schemas

Schemas reproduced **verbatim** from repo source (JS form; they use only plain `z` chains, so the
shape is identical), timed on this machine with Node 24.19.0 against the repo's installed zod
4.6.7. Harness: 20,000 warm-up calls then best-of-7 rounds. `jit()` is used for the "compiled"
column — it runs the same codegen the build emits, and it is the only way to measure without
committing a plugin.

### Representative form resolver — `getSettingsGeneralSchema(t)`, 9 fields, valid payload

This is the schema behind `settings/general.tsx`, rebuilt on every render and run on every change
once the form shows an error.

| Variant                                                                                                 | ns per validation | vs status quo |
| ------------------------------------------------------------------------------------------------------- | ----------------- | ------------- |
| **A. status quo** — zod, `isValidEmailAddress` builds a schema per call                                 | **13,981**        | —             |
| **B. hoist the email schema by hand** — one `const` at module scope, plain zod, no dependency           | **1,978**         | **7.1×**      |
| **C. B + zod-compiler** — the hoist the Vite plugin produced, compiled                                  | **1,783**         | **7.8×**      |
| **D. compile the form schema only**, keep the per-call helper (what "just add the plugin" naively buys) | **13,013**        | **1.1×**      |

Read C against B: zod-compiler's marginal contribution over a one-line hand hoist is **10 %**.
Read D against A: compiling the form schema itself is **1.1×**, i.e. inside the noise of a
keystroke. Almost the entire 7.8× lives in `isValidEmailAddress`, and it is bought by not
rebuilding a schema per call — something the repo can do today, for free.

The rejected-input path does not change the picture: compiled 14,553 ns vs plain 15,272 ns (**1.05×**).

### Representative API payload — `RegisterInputSchema`, 4 fields, once per request

Built at module scope in `lib/server/auth-actions.ts` from
`getRegisterSchema(structuralZod).omit({password}).extend({password: …})` and run once per server
action call.

| Variant  | valid payload    | rejected payload  |
| -------- | ---------------- | ----------------- |
| zod      | 489 ns           | 1,543 ns          |
| compiled | **65 ns (7.6×)** | **6.9 ns (223×)** |

The absolute saving on the valid path is **424 ns per request**, on a request that performs a
network round trip to the API. This is a real speed-up and an irrelevant one.

## The cost, measured

### Build time: not measurable at this repo's scale

Production build, `apps/front`, warm cache, two runs each, `/usr/bin/time` wall clock:

| Build                                  | run 1   | run 2   | `vite build` phase |
| -------------------------------------- | ------- | ------- | ------------------ |
| without plugin                         | 39.89 s | 47.02 s | 30.06 s / 26.73 s  |
| with `zodCompiler({ apply: 'build' })` | 30.21 s | 29.27 s | 25.48 s / 25.38 s  |

The plugin builds came out _faster_ than the baseline. With 5 compiled validators and 45 candidate
files the plugin's transform cost is below this machine's run-to-run variance; the honest statement
is "build time unchanged, ±20 % noise". Cold discovery is the expensive phase the README warns
about (45.4 s standalone), but it buys 5 validators, so it is not worth optimising.

### Bundle size: +0.28 %

|                      | baseline          | with plugin                    | delta                   |
| -------------------- | ----------------- | ------------------------------ | ----------------------- |
| `dist/` total        | 11,265,218 B      | 11,296,217 B                   | **+30,999 B (+0.28 %)** |
| JS bytes / files     | 7,473,031 B / 694 | 7,501,159 B / 695              | **+28,128 B (+0.38 %)** |
| shared runtime chunk | —                 | 4,668 B raw / **1,511 B gzip** | +1 chunk                |

### Construction: the cost the compiler does not address

A compiled artifact still `import`s the source module and lets it build the original schema, so
construction cost is unchanged (confirmed in the emitted `auth.compiled.ts`: it does
`import { RegisterInputSchema as __src_RegisterInputSchema } from "…"`). Measured:

|                                                                         | µs              |
| ----------------------------------------------------------------------- | --------------- |
| `getSettingsGeneralSchema(t)` construction (9 fields, the real factory) | **64.8 – 83.2** |
| `RegisterInputSchema` construction (4 fields, once at module load)      | **64.8**        |
| warm validation of the same 9-field schema                              | **2.5**         |

Construction is **26–33× the validation it enables**, and `general.tsx` pays it **per render**.
That is the actual performance problem on this page, and zod-compiler is orthogonal to it.

`jit()` — the runtime mode — makes per-render construction strictly worse, because compilation is
deferred to each instance's first parse:

| construct + first parse | plain    | via `jit()` | overhead  |
| ----------------------- | -------- | ----------- | --------- |
| 9-field schema          | 116.6 µs | 209.1 µs    | **+79 %** |
| 24-field schema         | 318.5 µs | 431.9 µs    | **+36 %** |

## What breaks for factory-built and dynamically-derived schemas

This is the part that matters more than raw speed, because _every_ schema here is factory-built.

1. **Discovery cannot see a factory's output.** 36 of 45 files report `no Zod schemas exported`;
   in the real build, 5 validators compiled and none of them is a form schema. The plugin is
   silent about the ones it skipped.
2. **Derived schemas lose compilation, silently.** `jit(x).extend({...})`, `.omit()`, `.partial()`
   and `.merge()` all return plain Zod: no compiled `.parse`, no `.is`, no error — just a quiet
   return to the slow path. Verified directly. Four schemas in this repo are built that way,
   including the only two that are per-request.
3. **A compiled child nested in an uncompiled parent does not propagate.** `z.object({ inner: compiledChild })`
   is entirely uncompiled.
4. **Hoisting cannot reach a `t`-dependent factory.** Only expressions built from imported bindings
   and literals move; a parameter kills it. This is structural here, not incidental.
5. **Explicit `compile()` is not an alternative integration mode.** Without the build plugin it is
   inert: 214 ns → 218 ns on a 2-field schema, with `.is()` reduced to
   `(input) => facade.safeParse(input).success`. It is a build-time marker, nothing more — so
   "use the explicit mode instead of the plugin" is not available.
6. **`jit()` is the only runtime mode, and it costs at construction** (+36 % to +79 % on
   construct+first-parse). It suits a long-lived process with schemas built once, which is the
   opposite of this repo.
7. **Behavioural deltas** (documented, and the ones that could bite here):
   - a compiled `z.array(...)` returns **the caller's array by reference** (verified: `out.ids === input.ids`
     is `true` compiled, `false` under zod). This repo has ~10 array fields (`owners`,
     `manualMembers`, `permissionKeys`, `files`, …); none currently mutates a parsed array, but a
     future one would.
   - per-call parse params are ignored. Not an issue today: `zodResolver` passes resolver options
     as `parseAsync`'s second argument, not a zod error map.
   - `z.record`/`z.map`/`z.set` key semantics. The repo uses none of them.
8. **Not a breakage, worth recording because it is the obvious fear:** i18n survives. The emitted
   validator calls `z.config().customError` before defaulting to `"Invalid input"`, so InterZod's
   global map (`lib/i18n/client.ts:53`) still produces translated messages, and schema-level
   `message:` literals are baked in. Verified end to end.

## Verdict: refuse

**Refuse.** The package is neither broken nor unsupported — zod 4.6.7 clears its peer range, it
installs cleanly, its one open issue is irrelevant here, and it does what it claims on the schemas
it can see. It just cannot see this repository's schemas, because they are built by
locale-carrying factories consumed inside render bodies and derived with `.extend()`/`.omit()`.

The three numbers: **5 compiled validators in a production build** of 45 zod files; **10 %** of the
real form win left over after a one-line hand hoist (**1.1×** if you compile the form schema
alone); **64.8 µs of construction against 2.5 µs of validation**, paid per render.

### What would have to change to revisit

1. **Schemas become module-scope exports.** If the `t`-dependency moves out (e.g. an error map
   keyed at validation time rather than a `t()` captured at construction), auto mode's 2/45
   becomes most of the codebase and the calculus inverts.
2. **Validators get hoisted out of render.** Moving `zodResolver(getSettingsGeneralSchema(t))` to
   the existing `useLanguageKeyedZodResolver` pattern (or module scope) removes the per-render
   64.8 µs construction. Do that first and measure again — it is worth more than the compiler.
3. **A genuinely hot parse path appears** where validation dominates construction — a worker
   parsing thousands of payloads per second against a schema built once. Then measure again; and
   note that zod 4.6.7 **already ships `z.compile()`** in-tree, so try that first (below).
4. **zod-compiler learns to compile a schema derived by `.extend()`/`.omit()`/`.partial()` from a
   compiled base**, or to hoist a factory-built schema keyed on a parameter. Either would make
   item 2–4 of the breakage list moot.

### The alternative this repo already owns

zod 4.6.7 ships `z.compile()` — the same runtime JIT the package's own README compares itself
against. Measured here, no dependency, no build plugin, no discovery:

|                              | zod `z.compile()`   | zod-compiler (`jit()`) |
| ---------------------------- | ------------------- | ---------------------- |
| form resolver, valid payload | 11,950 ns           | 12,590 ns              |
| API payload, valid           | 68 ns               | 65 ns                  |
| strings-only 9-field schema  | 72 ns (from 361 ns) | 53 ns                  |

It is within a few percent of zod-compiler on these shapes and it costs one import. It carries
zod's own caveats (`new Function`, so no CSP-free path and ~7 KB gzipped in the bundle) and it is
still the wrong fix for this repo — it does not touch construction either — but it is the honest
first experiment if anyone wants the compiled-validator speed-up, and it needs no issue.

The genuinely cheap fix, which no package provides, is one line: hoist the email schema in
`tenant-organization-profile-fields.ts` to module scope. **7.1×** on the settings form, today, for
free.

## Limits of this measurement

- **`jit()` stands in for AOT output.** The plugin was measured for coverage, build time and bundle
  size; per-validation speed was measured with `jit()`, which the README states emits "the same
  validators a build emits". The build-emitted fragment for `isValidEmailAddress` was inspected and
  has the same shape as `jit()`'s output, but no compiled validator was benchmarked end-to-end
  inside the built bundle.
- **Schemas were reproduced, not imported.** The benchmark copies the repo's schema source into a
  scratch `.mjs` file (verbatim chains, same zod 4.6.7, same messages via an identity `t`) rather
  than importing `apps/front` modules, because the app's `~` alias and `import.meta.glob` do not
  load under plain Node. The scratch file was not committed.
- **One machine.** Node 24.19.0, pnpm 10.13.1, Linux x64. Absolute nanosecond figures move with CPU
  and load; the ratios are what the argument rests on, and they were stable across runs.
- **`zodResolver` is `@hookform/resolvers` 5.9.1**, which calls `schema.parseAsync(input, options)`
  — not `parse` or `safeParse`. The compiled path does install `parseAsync`, so the resolver does
  see it; the async comparison (13,710 ns plain vs 12,547 ns compiled) shows the same ~1.1× as the
  sync one.
- **Single-version snapshot.** 2.0.7, 2026-09-24. The project is 2 months old with 2.0.x releases
  roughly weekly; item 4 of the revisit list could land in any of them.
- **The build-time comparison is two runs per arm.** The plugin arm was faster both times, which is
  why the claim is "no measurable increase" rather than a delta.
