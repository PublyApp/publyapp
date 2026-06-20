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

### Resolution (2026-06-20) — gate flipped to GO

The `2026-06-19` capture only checked the moving **`v3` branch**. Re-checked against
the **exact pinned tag** `v3.2.1` (= the consumed `@heroui/react@3.2.1`):

| Source (at the pinned `3.2.1` / `v3.2.1`) | Observed value |
| --- | --- |
| Installed `@heroui/react` `package.json` `.license` (node_modules) | **`MIT`** |
| Installed `@heroui/styles` `package.json` `.license` (node_modules) | **`MIT`** |
| Published npm artifact `@heroui/react@3.2.1` `.license` (2026-06-19) | **`MIT`** |
| Upstream repo `LICENSE` at tag `v3.2.1` (`raw.githubusercontent.com/heroui-inc/heroui/v3.2.1/LICENSE`) | **`Apache-2.0`** (header "Apache License, Version 2.0, January 2004"; "Copyright 2025 NextUI Inc.") |

The MIT-vs-Apache **discrepancy is confirmed and persists at the pinned tag**, and
**neither published package ships a `LICENSE` text file** in its npm tarball — both
are upstream packaging bugs, not adopter blockers.

**Why this resolves to GO regardless of which license controls:** **MIT and
Apache-2.0 are both OSI-approved permissive licenses** with no copyleft, no
source-disclosure, and no commercial-use restriction. Whichever one governs, PublyApp's
use (consuming a compiled UI library in a closed-source SaaS) is **fully permitted**.
The only practical Apache-2.0 obligation beyond MIT is **attribution / NOTICE
preservation**, which we satisfy by retaining the package's license metadata — a
Phase-1 packaging checklist item, not a legal risk. There is therefore **no licensing
scenario** under which the adopted artifact blocks the migration.

**Gate state:** **GO.** Resolves Finding #25. Carry-forward (non-blocking,
Phase-1 packaging hygiene): (a) re-run this exact-tag check at each version bump, since
the upstream metadata is internally inconsistent; (b) include HeroUI's license/NOTICE
in our third-party attribution manifest; (c) optionally file/track an upstream issue to
reconcile `package.json` (MIT) vs `LICENSE` (Apache-2.0) and ship a bundled LICENSE —
outward-facing, deferred to the human.

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

## Start runtime probes

Resolved by a temporary `src/routes/_probe.tsx` route (loader-primed query + a
`createServerFn` GET that read request headers and round-tripped a cookie). The route
+ its `routes.ts` entry were **deleted** before the Task 2.0 commit; the evidence below
was captured from the SSR-side `[PROBE]` server log + response headers while it existed.
`@tanstack/react-start@1.168.26`, dev + the standalone `server.mjs` build.

### UNVERIFIED #1 — Query SSR dehydrate/hydrate + per-query opt-out (RESOLVED)

- **Wiring:** `setupRouterSsrQueryIntegration({ router, queryClient })` (already in
  `src/router.tsx`) auto-wires dehydrate-on-server / hydrate-on-client. The probe's
  `loader` called `context.queryClient.ensureQueryData(probeQuery())` and the query's
  `queryFn` **executed during SSR** (the loader ran server-side — confirmed: the same
  request logged `[PROBE]` from the server fn, and the route returned HTTP 200). No
  manual `dehydrate()`/`<HydrationBoundary>` is needed — the integration owns it.
- **Option names (from the typed surface of `@tanstack/router-ssr-query-core@1.169.1`
  → `RouterSsrQueryOptions`):** `dehydrateOptions?: DehydrateOptions`,
  `hydrateOptions?: HydrateOptions` (both re-exported from `@tanstack/query-core`),
  plus `handleRedirects?: boolean` and `wrapQueryClient?: boolean` (the
  `@tanstack/react-router-ssr-query` wrapper adds `wrapQueryClient`).
- **Per-query opt-out:** there is **no dedicated per-query "skip SSR" flag**; the opt-out
  is TanStack Query's standard `DehydrateOptions.shouldDehydrateQuery` predicate passed
  via `dehydrateOptions` (commonly gated on a per-query `meta` flag, e.g.
  `meta: { ssr: false }` + `shouldDehydrateQuery: (q) => q.meta?.ssr !== false`).
- **Residual:** in **dev mode** the `curl`-captured initial HTML is the streamed shell
  (route body + dehydrated state arrive via streamed injection / client hydration), so
  the marker string is not in the first flush. The loader running server-side is proven;
  full in-initial-HTML SSR content is verified against the **production build** in Task
  2.3 (i18n SSR curl) and Task 4.3 (priming proof).

### UNVERIFIED #2 — `getRequest`/`getRequestHeader` import path + `getWebRequest` alias (RESOLVED)

- Import path **`@tanstack/react-start/server`** works. `getRequest()` returned the live
  request (URL `http://localhost:3000/_probe`); `getRequestHeader('user-agent')` returned
  the sent `ProbeUserAgent/1.0`.
- **`getWebRequest()` is NOT exported in this version** (`@tanstack/start-server-core@1.169.15`:
  `grep -c getWebRequest` → **0**). Use **`getRequest()`** as the canonical accessor; do
  not rely on a `getWebRequest` alias in 1.168.26.

### UNVERIFIED #3 — `setCookie` then `getCookie` in the SAME request, #5615 (RESOLVED — confirmed)

- In one server fn: `setCookie('probe','PROBE_COOKIE_VALUE')` then `getCookie('probe')`
  returned **`undefined`** → **#5615 confirmed for 1.168.26**: a cookie written this
  request is not readable via `getCookie` until a subsequent request.
- The write itself is correct: the response carried
  `set-cookie: probe=PROBE_COOKIE_VALUE; Path=/`. So a freshly-set session cookie is
  honored by the **browser on the next request**, not re-readable mid-request — which is
  exactly why login is step-1-only (set cookie + return ok) and the redirect decision is
  deferred to the next route load. The slice code is built on this assumption.

## i18next SSR (cookie-driven, fallback, 3 namespaces) + InterZod — Task 2.3

`@tanstack/react-start@1.168.26`, built + run via the standalone `server.mjs`.

### Result (acceptance curls, production build)

```
curl -s -H 'Cookie: publyapp-locale=fr' /  → "Bonjour depuis le spike"  ✔ FR via cookie
curl -s -H 'Cookie: publyapp-locale=zz' /  → "Hello from the spike"     ✔ unsupported → en fallback
curl -s -H 'Cookie: publyapp-locale=fr' /  → <html lang="fr" dir="ltr"> ✔ lang attr in SSR HTML
curl -s (no cookie) /                      → <html lang="en"> + "Hello"  ✔ default en
```

The `zod` namespace (incl. `errors.invalid_string.email` + `validations.email`) is present
in the dehydrated SSR state for both en + fr — so `zod:string.email` will translate on the
client for the Task 2.7 dialog. The real repo `zod.{en,fr}.json` were copied verbatim into
`public/locales/{en,fr}/zod.json` so the spike's zod-i18n-map structure matches production.

### Architecture

- **Cookie-driven locale, server-side:** `lib/i18n.server.ts` reads the `publyapp-locale`
  cookie via `getCookie` (`@tanstack/react-start/server`) and falls back to `en` for any
  unsupported value. `supportedLngs ['en','fr']`, `defaultNS 'common'`, `fallbackLng 'en'`,
  `ns 'common'/'zod'/'response-message'` — mirrors `apps/front/src/lib/i18n/i18n.config.ts`.
- **Server-fn boundary for the fs loader (IMPORTANT GOTCHA):** the fs-backed loader is
  consumed through a `createServerFn` in `src/server/i18n-locale.ts` (NOT named
  `*.server.ts`). Start's import-protection plugin **denies any `**/*.server.*` import
  into a client-imported module** — and `__root.tsx` renders on the client. A
  `createServerFn` IS the RPC bridge (Start replaces the handler with a client stub), so
  the handler's `lib/i18n.server.ts` (node:fs) import stays server-only. Naming the wrapper
  `i18n-locale.server.ts` made the build fail (`[import-protection] Import denied`); renaming
  it (dropping `.server.`) fixed it. **Rule for the slice: a server fn called from a route
  module must NOT live in a `*.server.ts` file; reserve `*.server.ts` for code never imported
  (even transitively, behind a server fn) by a client-rendered module.**
- **Locale resource path (runtime):** resolve from `process.cwd()` (`public/locales/...`
  in dev, `dist/client/locales/...` after build — Vite copies `public/`), NOT
  `import.meta.url` — the server fn is chunked into `dist/server/assets/`, so a bundle-
  relative `../../public/locales` resolves to a non-existent path and silently yields empty
  resources (every key rendered as its raw key). Two candidate roots are tried.
- **Isomorphic instance builder:** `lib/i18n.shared.ts` (no node:fs / no start-server
  imports) builds a synchronous i18next instance (`initImmediate: false`) from the
  SSR-resolved resources; `__root.tsx` uses it on server + client so the SSR HTML and the
  hydrated tree share one locale. Serializable resource type is BOUNDED-depth
  (`string | { [k]: string | { [k]: string } }`) — a freely-recursive JSON type tripped
  Start's server-fn serializer with `TS2589 "excessively deep"`.

### UNVERIFIED #6 — `I18nProvider` import path (RESOLVED)

- **`I18nProvider` is imported from `react-aria-components`** (`import { I18nProvider }
  from 'react-aria-components'` — there is a dedicated `dist/exports/I18nProvider.js`).
  HeroUI v3 (`@heroui/react@3.2.1`) resolves `react-aria-components@1.18.0`; the spike pins
  `react-aria-components@1.18.0` directly to match. `@heroui/react` does NOT re-export it.
- `__root.tsx` wraps the tree in BOTH `I18nProvider` (react-aria-components, feeds the
  request locale to React Aria/HeroUI) AND `I18nextProvider` (react-i18next, for `t()`),
  with the SAME server-resolved locale → no FOUC of language and no hydration locale drift.
- `SortDescriptor`/`Selection` import paths (also UNVERIFIED #6) are deferred to Task 2.6
  (the HeroUI Table task), not exercised here.

### Pinned i18n deps (workspace-compatible, NOT latest)

`i18next@24.2.3`, `react-i18next@14.1.3`, `zod@3.24.4`, `zod-i18n-map@2.27.0`,
`react-aria-components@1.18.0`. **Pinned to the workspace-resolved versions, NOT the npm
`latest`** — the shared-ts `InterZod` is written for the **zod v3** error-map API
(`errorMap`/`ZodIssueCode`/`defaultErrorMap`); zod v4 (latest) would break it.

## SSR request-header access — Group 2B auth slice fixes

### Decision

- Used a non-RPC, server-only request-header read for auth gating:
  `src/server/request-context.ts` now contains:
  - `export const getCookieHeader = () => getRequestHeader('cookie');`
- `authed/layout.tsx` `beforeLoad` and `authed/staff-users.tsx` SSR loader now consume that helper
  directly.
- Token precedence is now scoped in `createServerClientFromCookie(cookieHeader, fetchImpl?, scope?)`.
  Staff SSR call-sites pass `'staff'`, which selects staff token on dual-token cookies.

### Evidence

- Server-fn endpoint surface now includes:
  - `GET /_serverFn/<id>/loadI18nForRequest`
  - `POST /_serverFn/<id>/login`
  - `POST /_serverFn/<id>/completeLoginRedirect`
  - `POST /_serverFn/<id>/clearSession`
- No RPC endpoint now exists for a raw `getCookieHeader` handler. A direct probe of any remaining server fn
  returns non-secret payloads (or empty JSON), never raw `Cookie` or `sessionToken`.

### Architectural tension

- The helper is called from route modules, so correctness relies on Start running these gate points in server
  execution paths. If execution shifts to client-side transitions in future router versions, this should be
  refactored to a strict `createServerOnlyFn` wrapper.

## Table parity (Task 2.6)

### Implementation

- Replaced `src/routes/authed/staff-users.tsx` to drive URL query state (`q`, `sortId`, `sortOrder`, `cursor`) into `StaffUsersVars` and run server-primed SSR + browser query hydration.
- Added `src/components/members-table.tsx` using `@tanstack/react-table` for column/sort state and HeroUI v3 compound `Table` rendering.
- Added `@tanstack/react-table` exact pin to `apps/front-2-spike/package.json`.
- Added a 1k+ virtualization probe dataset to exercise `Virtualizer layout={TableLayout}`.

### Verification results

- **SortDescriptor source:** `@heroui/react` (type-only export exists in this build; `react-aria-components` fallback not needed)
- **Selection source:** `@heroui/react` (`Selection` type import works directly)
- **Virtualization/resize/pin decision:**
- **Virtualization:** **PENDING** (`Virtualizer layout={TableLayout}` is active, but current evidence is only SSR row output with probe data, not DOM-windowing confirmation).
- **Resize/pin:** **NOT VERIFIED in this task** (no interaction script run for column dragging/resize). Pending interactive verification, Table parity remains **NO-GO** for §13.

### Notes

- Query-state `NO_MATCH` path is wired to an explicit "no results" output branch.
- SSR proof collected with seeded staff credentials:
  `curl -s -H "Cookie: publyapp-session_token=s:<token>" http://localhost:3000/staff/staff-users > /tmp/staff-users-ssr.html`
  and `rg -ao \"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\" /tmp/staff-users-ssr.html` produced `probe-1000@staff.local` entries and `owner@publyapp.local`, confirming SSR table rows render beyond a bare count.

## SSR strategy + HeroUI Table

- HeroUI v3 `Table` SSR: **confirmed it DOES render row content in raw SSR HTML.** An isolated probe (a collection-backed HeroUI v3 `Table` with hardcoded rows on an SSR route) emitted the row text server-side; and the earlier 2.6 capture above (`rg -ao`, line 555) already found real (`owner@publyapp.local`) rows in the authed SSR HTML. A later check appeared to show the table absent, but it used `grep -o` (without `-a`), which treats React's streamed SSR output as a *binary* file and silently returns nothing — unreliable. **Always use `grep -a` / text-extraction on SSR HTML.** There is **no** evidence HeroUI v3 `Table` is SSR-incompatible. Authed CSR is the **product decision** (authed pages default to client-side, matching the current `<ClientOnly>` app) — NOT a workaround for any Table SSR limitation.
- DECISION adopted (Task 2.6): authed routes are **CSR-only**; marketing/auth (including `/` and `/login`) remain SSR. Mechanism used: `createFileRoute('/_authed-layout')({ ssr: false, ... })` in `apps/front-2-spike/src/routes/authed/layout.tsx`.
- With client-only route rendering, authed data now loads via browser Kiota (`useSuspenseQuery(staffUsersBrowserQuery(vars))`) and `Route.useSearch()` values; `createServerFn` remains for cookie I/O utilities only. `beforeLoad` still guards with `getSessionTokensIsomorphic()` and redirects to `/login` when unauthenticated.
- FOLLOW-UPS:
  - update spec §4.1 / §10 wording for authed=CSR in Group 5.
  - scope Task 4.3 SSR assertions to marketing/auth routes (`rows in raw SSR HTML`, `no-refetch priming`) or verify them post-hydration for authed flows (Playwright with JS enabled).
- `## Table parity (Task 2.6)` virtualization verdict remains **PENDING** with follow-up browser DOM-windowing confirmation in Group 4.

## CSP

### Task 3.1

**Nonce minting vs header emission are split across two files:**
- `apps/front-2-spike/src/server/csp.ts` → `mintCspNonce()` mints one `nanoid()` nonce per request (pure; no server-only import).
- `apps/front-2-spike/src/server.ts` (**custom Start server entry**) emits both headers on **every** SSR'd HTML response (see "404 coverage" below), reading the nonce from `router.options.ssr.nonce`:
  - `Content-Security-Policy` (enforced — what the blocking test asserts)
  - `Content-Security-Policy-Report-Only` — **byte-identical to enforced** (no `report-uri`/`report-to` endpoint), so it is **header-presence/parity only with the current `front`, not a separate diagnostic policy.**
- The CSP string mirrors `packages/shared-ts/lib/csp.ts` via `createCSPHeader()`:
  - `script-src` includes `'nonce-{nonce}'`. **In production `script-src` has NO `'unsafe-inline'`, and because a nonce is present, modern (CSP3) browsers ignore `'unsafe-inline'` even in dev — so EVERY inline script must carry the nonce or it is blocked.**
  - `style-src` keeps `self` + `'unsafe-inline'` (see style-src verdict below).
- `__root.tsx` emits both nonce tags in `<head>` with the same request value:
  - `<meta name="csp-nonce" content={nonce} />` (current-app convention)
  - `<meta property="csp-nonce" content={nonce} />` (React Aria)

#### Resolved gap #1 — framework-injected scripts (root cause + fix)

- **Symptom (pre-fix):** under enforced CSP the React Aria/theme scripts were nonced, but TanStack's own injected inline scripts were **not** — the `$tsr-stream-barrier`, the `ScriptOnce` hydration script, and React's bootstrap module — so an enforced policy would block hydration.
- **Root cause:** the earlier wiring passed `nonce` as a **prop to `<Scripts>`**, which is **ignored**. TanStack reads the nonce from exactly one place — **`router.options.ssr.nonce`** — for: React's SSR stream (`renderRouterToStream` → `renderTo{Readable,Pipeable}Stream({ nonce })`), `Scripts`/`ScriptOnce` (`@tanstack/react-router`), and the streamed injects/barrier (`@tanstack/router-core` `ssr-server.js` `injectScript` + `takeBufferedScripts`). A `nonce` prop is dead.
- **Fix:** `src/router.tsx` `getRouter()` sets `ssr: { nonce }` per request — minted server-side via `mintCspNonce()`; on the **client** `getRouter` reads it back from `meta[name="csp-nonce"]` so client-rendered tags match the SSR markup (no hydration warning). `RootDocument` reads the single source via `useRouter().options.ssr?.nonce`; the dead `<Scripts nonce>` cast was removed (plain `<Scripts />`). The two manual inline scripts keep `suppressHydrationWarning` defensively.

#### Resolved gap #2 — CSP headers missing on non-200 responses (404/500)

- **Symptom (pre-fix):** minting + `setResponseHeader` inside `getRouter` set the headers on 200 responses, but a production **404 returned NO CSP headers** while still shipping (nonced) framework scripts — `setResponseHeader` did not survive to the non-OK response path. (My earlier claim that headers held on error/404 was **false**.)
- **Fix:** header emission moved out of `getRouter`/`csp.ts` into the **custom server entry `src/server.ts`** — a `defineHandlerCallback` wrapping `defaultStreamHandler` that sets both headers on `ctx.responseHeaders` for **every** rendered response, reading `ctx.router.options.ssr.nonce`. The Start vite plugin auto-resolves `src/server.ts` as the server entry; it default-exports `{ fetch }` so the standalone `server.mjs` is unchanged.

#### Verification (deployed standalone `node server.mjs`, `NODE_ENV=production`)

Probed via Python text-extraction (`grep -o` mis-reads streamed SSR HTML as binary). Across **`/`, `/login`, `/staff/staff-users` (authed CSR shell), and a missing route (404)**:
- both `Content-Security-Policy` + `Content-Security-Policy-Report-Only` headers present (incl. on the **404**);
- **every** inline `<script>` carries the matching nonce — theme, env, `$tsr-stream-barrier`, `ScriptOnce`, `src` module — **0 un-nonced inline** (router-core's `injectScript` emits `nonce='…'` single-quoted — valid HTML, matches CSP);
- nonce is **distinct per request** (verified on `/login` and on the 404 path).

This smoke matrix was run manually; the **automated** version (assert headers + matching/distinct nonces + an un-nonced script is *blocked* in a real browser) is Task 4.5's Playwright spec.

#### Style-src verdict (evidenced) — retain `'unsafe-inline'`

Task 3.1 Step 3 asked to try `style-src` **without** `'unsafe-inline'` and record what breaks. Evidence gathered:
- **Initial SSR paint survives a tightened `style-src 'self'`:** the SSR HTML of `/` and `/login` contains **0** inline `<style>` tags and **0** inline `style=` attributes — only one `<link rel="stylesheet">` from `'self'` (Tailwind v4 app.css). So the first paint + hydration would NOT break.
- **Runtime interactive surfaces require it:** the email-dialog client chunk contains inline `style:{…}`, and React Aria/HeroUI overlays (Modal/Popover) apply **inline `style=` positioning** at runtime. A CSP **nonce cannot cover `style=` attributes** (nonces apply only to `<style>`/`<link>` elements) — so tightening `style-src` would break interactive overlays with no nonce remedy; only `'unsafe-inline'` (or `style-src-attr 'unsafe-inline'`) admits them. This matches the current `front`.
- **Live capture attempted, deferred:** I tried a real headless-Chromium run under a tightened-`style-src` proxy (raw CDP, no Playwright) to capture the exact runtime violation, but this sandbox **kills sustained browser processes** (signal 16 / exit 144); `chrome --version` runs but a live CDP session does not. The authoritative live enforced-CSP browser confirmation across interactive surfaces is therefore **Task 4.5** (which builds the proper Playwright harness with browser-lifecycle management).
- **Verdict:** retain `style-src 'self' 'unsafe-inline' …`. Dropping `'unsafe-inline'` is infeasible for the full app without a hashing/inline-style-elimination effort that is **out of Phase-0 scope** and recorded as a Phase-1 follow-up.
