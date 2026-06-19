# front-2 Phase 0 — GO/NO-GO findings

> **Status:** Phase 0 de-risking spike (disposable). This document is the single
> **GO/NO-GO record** for the proposed migration of PublyApp's frontend to
> **TanStack Start + HeroUI v3**. Phase 0 is the cheapest kill-switch: it records
> license + version-stability + architecture evidence so the migration can be
> proven-or-killed before any expensive work. Later Phase 0 tasks append more
> sections to this same file. **GO is forbidden until every gate below is written
> down with real, observed evidence.**
>
> All command output recorded here was captured by direct `registry.npmjs.org` /
> `raw.githubusercontent.com` curls and `gh` searches on **2026-06-19** — not from
> memory and not from `npm view`. Versions on the registry may move after this date.

---

## License gate

**Task 0.1 — HeroUI v3 license gate.** Goal: confirm the *consumed npm artifact*
(`@heroui/react@3.x`) is MIT, and surface the discrepancy between the v3 repo's
`LICENSE` file (Apache-2.0) and its `package.json` (`MIT`).

### Observed evidence (curl, 2026-06-19)

| Source | Command | Observed value |
| --- | --- | --- |
| npm artifact | `curl -s https://registry.npmjs.org/@heroui/react/3.2.1` → `.license` | **`MIT`** |
| v3 repo `LICENSE` file | `curl -s https://raw.githubusercontent.com/heroui-inc/heroui/v3/LICENSE \| head -3` | **`Apache License, Version 2.0, January 2004`** (Apache-2.0 header) |
| v3 repo `package.json` | `curl -s https://raw.githubusercontent.com/heroui-inc/heroui/v3/package.json` → `.license` | **`MIT`** |

Raw captures:

```
npm @heroui/react license: MIT

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

v3 package.json license: MIT
```

**Discrepancy:** the v3 branch ships an **Apache-2.0 `LICENSE` file** while both the
published npm package metadata and the v3 `package.json` declare **`MIT`**. The
*consumed artifact* (npm `@heroui/react@3.2.1`) declares MIT, which is the working
assumption for the spike, but the in-repo Apache-2.0 LICENSE file means upstream
intent is **not unambiguously confirmed**.

### Upstream clarification (search only — no issue opened)

Per spike rules, only an **existing** issue/discussion search was performed; opening a
new issue against a third-party repo is an outward-facing action deferred to the human.

- `gh issue list --repo heroui-inc/heroui --search "license MIT Apache in:title,body" --state all --limit 10` → **no results**.
- Broader `license in:title` → only Pro-seat/Pro-license issues (#5337 "purchasing 25 licenses", #2996 "User broke NextUI Pro License") — **unrelated** to the MIT-vs-Apache file discrepancy.
- `Apache` keyword → only unrelated bug reports (#2512, #1424).
- Discussions (GraphQL, first 10) → all feature/component topics; **none** about licensing.

**Result: no existing upstream issue found** that addresses the MIT-vs-Apache
discrepancy for `@heroui/react@3.x`. Opening one is **deferred to the human**
(outward-facing action on a third-party repo).

### Gate rule (Finding #25)

> **`PENDING-UPSTREAM` may allow the *spike* to run (MIT on the consumed npm
> artifact is the working assumption), but it FORCES `NO-GO for Phase 1
> token/design work` until upstream confirms MIT governs `@heroui/react@3.x`.**

**Gate state:** `PENDING-UPSTREAM`. Spike MAY proceed; Phase 1 token/design work is
**blocked** until upstream confirmation.

---

## Version gate

**Task 0.2 — TanStack Start stability/version gate.** Goal: confirm dist-tags, the
absence of a `1.0.0` GA milestone, and pin policy for `@tanstack/*` packages.

### Observed evidence (curl, 2026-06-19)

`curl -s https://registry.npmjs.org/@tanstack/react-start` → dist-tags + the
`@tanstack/react-router` dependency of the `latest` version:

```
dist-tags: {'beta': '0.0.1-beta.204', 'alpha': '1.132.0-alpha.25', 'latest': '1.168.26'}
router dep of latest: 1.170.16
```

- **`latest` = `1.168.26`** (observed).
- **Transitive `@tanstack/react-router` = `1.170.16`** (declared dependency of the `latest` Start version — note it is *ahead* of Start's own version, confirming independent per-package version numbers within the monorepo).
- **No `1.0.0` milestone / no GA dist-tag.** TanStack uses **lockstep monorepo versioning**: the high `1.x` number is a continuously-advancing monorepo version, not a stable-GA signal. `beta`/`alpha` channels exist but `latest` is the working channel.

### Gate rule

> **Pin EXACT versions (no `^` / `~`) for every directly-imported `@tanstack/*`
> package; do NOT pin the transitive `@tanstack/react-router`; re-verify at each
> Phase boundary.**

Rationale: lockstep monorepo versioning means a floating range can silently pull a
breaking minor across the whole `@tanstack/*` surface. Exact pins on direct
dependencies keep the spike reproducible; the transitive `@tanstack/react-router`
must stay unpinned so the resolver keeps it compatible with the pinned Start version.

**Security note:** given the **May-2026 npm supply-chain incident**, the Task 1.2
**exact-pin + `ignore-scripts`** policy is **mandatory** (not optional hardening) —
floating ranges + lifecycle scripts are exactly the attack surface that incident
exploited.

**Gate state:** PASS for spike purposes (`latest` resolvable, lockstep versioning
understood, pin policy defined). Re-verify versions at each Phase boundary.

---

## Architecture gate

**Placeholder (decision recorded now; a later Phase 0 task confirms it).** GO is
forbidden until this decision is written down, so it is captured here up front:

- **Decision: direct-Kiota.** The .NET API (consumed via the Kiota-generated
  TypeScript client) is the **single source of truth** for application data.
- `createServerFn` is used for **cookie-I/O only** — not as a data/BFF layer.
- The spike **reproduces the currently-shipped JS-readable-cookie session model**
  (it does NOT introduce a BFF and does NOT move auth server-side).
- **This is NOT a BFF.** No server-side data aggregation or API proxying is added.

> _Confirmation deferred to a later Phase 0 task; the decision above is the binding
> assumption for the spike._

---

## Scaffold

**Task 1.1 — scaffolded `apps/front-2-spike` from a pinned checkout** of the canonical
TanStack Start + Query example (reproducible, unlike `npx gitpick`).

- **Upstream repo:** `https://github.com/TanStack/router`
- **Recorded HEAD SHA (2026-06-19):** **`ac821f40aa53d387d4b5f9a5fa5e47d9407665bf`** (`origin/main`)
- **Example path:** `examples/react/start-basic-react-query` (already wires the Query SSR integration)
- **Method:** `git clone --filter=blob:none --no-checkout` → `git sparse-checkout set examples/react/start-basic-react-query` → `git checkout HEAD` → `cp -r` into `apps/front-2-spike`.

### Scaffold-shipped wiring (verified, matches the grounding facts)

- `vite.config.ts` ships exactly the canonical plugin order `tailwindcss(), tanstackStart(), viteReact()` with `resolve.tsconfigPaths: true` (built-in, NOT `vite-tsconfig-paths`). `@tailwindcss/vite` + `tailwindcss` are already present in the scaffold's `package.json`, so Task 1.3 only adds the HeroUI packages + the global CSS imports.
- Entry files (`server`/`client`/`ssr`) are auto-generated by the plugin in 1.168.x — the scaffold authors only `src/router.tsx` (`getRouter()` + `setupRouterSsrQueryIntegration`) and `src/routes/__root.tsx`.
- The scaffold's `start` script is `pnpx srvx --prod -s ../client dist/server/server.js` — NOT `node .output/server/index.mjs`. We overrode `start` to the plan's `node .output/server/index.mjs`; Task 1.5 verifies which artifact the Nitro build actually emits and reconciles the divergence.

### DEVIATION (necessary): `@tanstack/react-router` IS a direct dependency

The grounding said "do NOT add `@tanstack/react-router` directly — it arrives
transitively." **In this strict-pnpm workspace that is not viable**: the scaffold's
own `src/router.tsx` / `__root.tsx` import `@tanstack/react-router` directly, and
under pnpm's strict (symlinked, non-hoisted) node-linker a **transitive** dep is NOT
resolvable from the app — `pnpm dev` returned **HTTP 500: `Cannot find module
'@tanstack/react-router' imported from src/router.tsx`**.

Mitigations tried and **rejected** (all confirmed empirically):

- per-app `.npmrc` with `public-hoist-pattern[]=@tanstack/*` → **ignored** (hoist patterns are workspace-root-scoped in pnpm; the install was a 1.1 s no-op and resolution still failed).
- per-app `.npmrc` with `node-linker=hoisted` → **ignored** for the same reason (root-scoped).
- modifying the **root** `.npmrc` → **rejected** as out-of-scope: it would change hoisting for the entire monorepo (other apps) for a throwaway spike.

**Resolution:** add `@tanstack/react-router` as a direct dependency **pinned to the
EXACT transitive version `1.170.16`** (= the exact version `@tanstack/react-start@1.168.26`
itself depends on). This fully satisfies the grounding's stated *intent* — there is
**no duplicate and no peer conflict** because pnpm dedupes the identical version to a
single copy — while making the directly-imported package resolvable. After adding it,
`pnpm dev` renders the default example at **HTTP 200**. This pin must be re-verified
(kept equal to Start's transitive router) at each Phase boundary.

### Acceptance (Task 1.1)

- `pnpm install` → success (workspace `front-2-spike` picked up via `apps/*`; transitive `@tanstack/react-router@1.170.16` confirmed in lockfile).
- `pnpm dev` → **HTTP 200**, default example renders ("Welcome Home!!!" + nav + SSR streaming HTML).

---

## Supply-chain install policy

**Task 1.2 — exact-pin assertion + `ignore-scripts` policy, CI-tested.**

### Pin assertion (`scripts/assert-pinned.mjs`)

- Validates that **every** non-`workspace:` dep in all four dep groups is a single exact SemVer (rejects `^`/`~`/tags/`latest`/git/`file:`/`link:`/`catalog:`). Prefers the real `semver` validator; falls back to a strict exact-version regex ONLY on the cold-`preinstall` path (before deps are on disk). Wired as `package.json` `preinstall`.
- `node scripts/assert-pinned.mjs` → **`All deps exact-pinned ✔`**.

### `--ignore-scripts` policy (allowlist trusted first-party postinstalls)

A **blanket** `--ignore-scripts` is the supply-chain ban (a tampered transitive dep
cannot run install-time code), but it ALSO skips `@org/shared-ts`'s real
`postinstall` (`generate-zod-i18n-map.mjs`) that i18n/InterZod depend on. **Policy:
ban all lifecycle scripts, then EXPLICITLY allowlist trusted first-party postinstalls**:

```
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @org/shared-ts run postinstall   # trusted first-party — re-run explicitly
```

Verified locally:

- `pnpm install --frozen-lockfile --ignore-scripts` → "Lockfile is up to date … Already up to date".
- `pnpm --filter @org/shared-ts run postinstall` → regenerates `packages/shared-ts/lib/i18n/json/zod.{en,fr}.json` (both present, ~4 KB each).
- `pnpm --filter front-2-spike build` → succeeds.

The per-app `.npmrc` sets `prefer-frozen-lockfile=true`. NOTE: pnpm's `ignore-scripts`
is a workspace-root/command-level setting (not honored from a per-app `.npmrc`), so the
ban is applied on the install COMMAND (and in CI), not in the app `.npmrc`.

### CI (path-filtered — DEVIATION called out)

Added `.github/workflows/front-2-spike-supply-chain.yml`: assert-pinned → frozen +
`--ignore-scripts` install → explicit shared-ts postinstall → spike build.
**It is `paths`-filtered to `apps/front-2-spike/**` (and its own workflow file)** so it
NEVER runs on unrelated PRs — this is a repo CI change for a throwaway app, kept
isolated by design. **Human confirm:** acceptable to add this isolated, path-scoped
CI job to the repo for the disposable spike.

### Build-target divergence (recorded; resolved in Task 1.5)

`pnpm --filter front-2-spike build` emits **`dist/client` + `dist/server/server.js`** —
there is **NO `.output/server/index.mjs`** and no Nitro `.output/` directory with this
Start version's default build. The scaffold's own `start` script was
`pnpx srvx --prod -s ../client dist/server/server.js`. The plan grounding assumed a
Nitro `node` preset emitting `.output/server/index.mjs`; that assumption does **not**
hold for the default build here. Task 1.5 reconciles the standalone-Node boot
(`start` script + the `node .output/server/index.mjs` acceptance) against the actual
emitted artifact.

---

## HeroUI v3 + Tailwind v4 render proof

**Task 1.3 — prove HeroUI v3 renders styled under Tailwind v4 + the Start SSR stack.**

- Added `@heroui/react@3.2.1` + `@heroui/styles@3.2.1` (exact-pinned; both **MIT** on the npm artifact). HeroUI v3 bundles `react-aria-components@1.18.0` + `react-aria@3.49.0` transitively. Peers satisfied (`react>=19`, `tailwindcss>=4`).
- `src/styles/app.css` (the three canonical lines, provider-less v3):
  ```css
  @import 'tailwindcss' source('../');
  @import '@heroui/styles';
  @custom-variant dark (&:is(.dark *));
  ```
- The scaffold already wired `tailwindcss()` first in `vite.config.ts` plugins and already imports `appCss from '~/styles/app.css?url'` in `__root.tsx` `head().links` — no extra wiring needed.
- Rendered `<Button color="primary">HeroUI v3 works</Button>` on `index.tsx` (no `HeroUIProvider` — v3 is provider-less).

### Observed (SSR HTML at `pnpm dev`, HTTP 200)

```html
<button data-slot="button" class="button button--md button--primary" data-rac="" type="button" data-react-aria-pressable="true" id="react-aria-«…»">HeroUI v3 works</button>
```

The served `app.css` contains the **real** HeroUI v3 button stylesheet
(`.button`, `.button--primary`, `.button--md`, `.button--lg`, `.button--secondary`,
`.button--outline`, `.button--icon-only`, `.button-group*`, …) — so `@import
'@heroui/styles'` resolves and Tailwind v4 processes it. The `data-rac` /
`data-react-aria-pressable` attributes confirm React Aria Components is driving the
button. **Verdict: HeroUI v3 renders STYLED under Tailwind v4 + TanStack Start SSR.**

---

## VFR wiring

**Task 1.4 — Virtual File Routes (code-based tree). Resolves UNVERIFIED #4: exact
placement of `virtualRouteConfig` under `tanstackStart()`.**

### Working wiring (PRIMARY attempt succeeded — no fallback needed)

`virtualRouteConfig` nests under `tanstackStart`'s `router` option. **No
`tanstackRouter()` from `@tanstack/router-plugin/vite` was needed** (the documented
fallback was NOT required):

```ts
// vite.config.ts
tanstackStart({
  srcDirectory: 'src',
  router: { virtualRouteConfig: './src/routes.ts' },
})
```

Deps needed for `src/routes.ts`: `@tanstack/virtual-file-routes@1.162.0` added as a
direct dep (exact, = transitive version) so `{ rootRoute, route, index, layout }` is
importable under strict pnpm. `@tanstack/router-plugin@1.168.18` was also added
(devDep) in case the fallback was needed — **it was not used** (kept for parity/future).

### Gotcha resolved: VFR file paths are relative to `routesDirectory`, NOT `src`

The plan's `src/routes.ts` used `rootRoute('routes/__root.tsx', …)`. With this version
that produced **`expected root route to exist at src/routes/routes/__root.tsx`** — the
generator joins each VFR `file` to `resolve(routesDirectory)` (= `src/routes`), not to
`src`. Confirmed in `@tanstack/router-generator` source:
`fullPath = join(resolve(tsrConfig.routesDirectory), virtualRouteConfig.file)`.

**Fix:** drop the `routes/` prefix — paths are relative to `src/routes`:

```ts
export const routes = rootRoute('__root.tsx', [
  index('index.tsx'),
  route('/login', 'login.tsx'),
  layout('authed-layout', 'authed/layout.tsx', [
    route('/staff/staff-users', 'authed/staff-users.tsx'),
    route('/_auth-echo', 'authed/auth-echo.tsx'),
  ]),
])
```

### Codegen result (verified in `routeTree.gen.ts`)

The plugin generated the tree AND auto-rewrote each stub's `createFileRoute` id to the
emitted id. Required routes all present:

| URL | generated route id |
| --- | --- |
| `/login` | `/login` |
| authed layout (pathless) | `/_authed-layout` |
| `/staff/staff-users` | `/_authed-layout/staff/staff-users` |
| `/_auth-echo` | `/_authed-layout/_auth-echo` |

The VFR layout id `authed-layout` becomes the pathless route id **`/_authed-layout`**
(leading `_` = pathless). **Task 2.6 must use the EXACT id
`/_authed-layout/staff/staff-users`** for the staff-users `createFileRoute`.

`pnpm dev` renders all three: `/` (200), `/login` (200), `/staff/staff-users` (200) —
the SSR HTML for the last shows the nested
`<div>Authed shell (stub)</div><div>Staff users (stub)</div>`, proving the authed
layout wraps its children. The orphaned scaffold example routes (posts/users/deferred/
_pathlessLayout/api/redirect) were deleted; `__root.tsx` nav trimmed to Home/Login/Staff.

---

## Monorepo integration

**Task 1.5 — turbo, tsconfig, workspace-TS transpilation.**

### Workspace pickup
`pnpm -r list` shows `front-2-spike` (picked up automatically via the `apps/*`
workspace glob — no `pnpm-workspace.yaml` change needed).

### Turbo
- `build.outputs` += `.output/**` (forward-looking for Group 3; the current build emits `dist`, already covered).
- `globalEnv` += `SERVER_API_BASE_URL`, `PUBLIC_API_BASE_URL`, `VITE_POSTHOG_API_KEY`.

### Formatter/linter ignore (small repo-wide config change — DEVIATION called out)
TanStack's generated `routeTree.gen.ts` (marked "exclude from your linter/formatter")
was being reformatted by lint-staged's `oxfmt` on every commit, then re-rewritten by
the dev server — perpetual churn. Added **`**/routeTree.gen.ts`** to `.oxfmtrc.json`
AND `.oxlintrc.json` `ignorePatterns`. This is repo-wide (not spike-scoped) but is the
correct home for a generated-file ignore and is consistent with the existing
`**/.react-router` / `packages/client-ts` ignores. **Human confirm:** acceptable.

### `ssr.noExternal` (workspace raw-TS transpilation — VERIFIED)
`vite.config.ts` → `ssr: { noExternal: ['@org/client-ts', '@org/shared-ts'] }`. Proof:
`index.tsx` imports `SESSION_TOKEN_HEADER_KEY` from `@org/shared-ts/lib/constants`
(raw `.ts`) and renders it in SSR. The standalone build + `node server.mjs` serves
**`session header key: X-Session-Token`** in the SSR HTML with **NO
`ERR_UNKNOWN_FILE_EXTENSION`/raw-`.ts` error** — Vite transpiled the workspace TS.

### tsconfig (`pnpm typecheck` → exit 0)
- Extends `../../packages/_tsconfig/tsconfig.base.json`; `moduleResolution: Bundler`; `paths` keep `~/*`; `allowImportingTsExtensions` for the `@org/*` raw-`.ts` exports maps.
- `noUnusedLocals`/`noUnusedParameters` turned **off** (the base turns them on; the scaffold/generated code is not unused-clean — acceptable for a throwaway spike).
- Two typecheck issues found + fixed:
  1. **HeroUI v3 `Button` has NO `color` prop** — v3 uses **`variant`** (`primary | secondary | tertiary | ghost | outline | danger | danger-soft`). Changed `<Button color="primary">` → `<Button variant="primary">` (the plan/grounding's `color="primary"` is a v2-ism; recorded for Group 2/Phase 1).
  2. `@org/shared-ts` ships **ambient global types** (`ValueOf`, `ToPrimitive`, `Bun`) in `packages/shared-ts/@types/`. Because `ssr.noExternal` makes us typecheck its raw `.ts`, those globals must be in the program — added `../../packages/shared-ts/@types/**/*.d.ts` to the spike tsconfig `include` (mirrors how `front` resolves them).

---

## Standalone Node server (build-target divergence — RESOLVED)

**The plan grounding assumed `vite build` emits a Nitro `.output/server/index.mjs`
self-listening server. It does NOT for `@tanstack/react-start@1.168.26`.** This Start
version's `tanstackStartOptionsObjectSchema` has **no Nitro/preset/`.output` option**;
the build is Vite-native and emits:

- `dist/client/` — static client assets
- `dist/server/server.js` — a web **`{ fetch }` handler** (NOT a listening server; `node dist/server/server.js` does not bind a port)

The scaffold's own `start` was `pnpx srvx --prod -s ../client dist/server/server.js`.

**Resolution:** added a small standalone entry **`server.mjs`** (committed) that imports
the built `{ fetch }` default from `dist/server/server.js`, serves `dist/client`
statically, and binds a real Node HTTP listener via **`srvx@0.11.16`** (exact-pinned;
the same runner the scaffold referenced). `start` script = **`node server.mjs`**.

- `pnpm build && PORT=3100 node server.mjs` → **"listening on http://localhost:3100"**, HTTP 200, SSR HTML contains the HeroUI button (`button--primary`) + the shared-ts constant (`X-Session-Token`) + authed routes resolve — NO raw-`.ts` error.

**HANDOFF for Group 3 (Task 3.2 Dockerfile):** the container `CMD` must be
**`["node","server.mjs"]`** (and copy `dist/` + `server.mjs` + `srvx`), **NOT**
`node .output/server/index.mjs` — that artifact does not exist with this Start version.
The Group-3 author should re-check whether a later Start version restores a Nitro
preset; until then `server.mjs` is the standalone entry.
