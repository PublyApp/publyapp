# Front-2 Phase 0 — De-risking Spike + Characterization Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove — or kill — the TanStack Start + HeroUI v3 stack by building a disposable, containerized vertical slice deployed behind a proxy and tested with Playwright, plus a shared parity contract run against the current app, before committing the full migration.

**Architecture:** A throwaway workspace app `apps/front-2-spike` (TanStack Start RC + HeroUI v3 + Tailwind v4, Vite SSR → standalone Node) that reuses the real `@org/client-ts` Kiota client and `@org/shared-ts` constants, reproduces one authenticated vertical slice (dual-token cookie auth → authed shell → real staff list in a HeroUI Table driven by TanStack Table → an RHF/Zod dialog → i18next SSR → dark mode). **It keeps the current shipped data architecture: the .NET API via Kiota is the single source of truth — the JS-readable session cookie + browser Kiota on the client, per-request Kiota in SSR loaders, and `createServerFn` ONLY for cookie I/O (never app data).** It ships as a Docker image behind a Traefik-shaped proxy, is exercised by Playwright against the *deployed container*, and shares one parity-contract suite with the current `apps/front`. The phase ends with a written GO/NO-GO decision.

**Tech Stack:** `@tanstack/react-start@1.168.26` (+ `@tanstack/react-router@1.170.16` transitive), `@tanstack/react-router-ssr-query`, `@tanstack/react-query`, `@tanstack/react-table`, `@heroui/react@3.2.1` + `@heroui/styles@3.2.1`, `tailwindcss@4` + `@tailwindcss/vite@4`, `react-aria-components@1.18.x`, `react-hook-form` + `zod` + `@org/shared-ts` InterZod, `@org/client-ts` (Kiota), `i18next`, Playwright + `@axe-core/playwright`, Toxiproxy (fault injection), Docker + Traefik, `pnpm`.

**This is a SPIKE.** The output is a *throwaway* `apps/front-2-spike` plus **knowledge** (resolved `UNVERIFIED` flags) and a **GO/NO-GO record**. It is NOT the real `apps/front-2` (built in Phase 1 from these learnings). Do not invest in polish; invest in resolving the risks in §13 of the strategy spec.

**Source of truth:** `docs/superpowers/specs/2026-06-19-front-2-tanstack-heroui-migration-design.md` (§4.1 single-source-of-truth invariant, §10 Phase 0, §11 parity contract, §13 risks, §18 open questions).

---

## Grounding & pinned facts (verified mid-June 2026 — the executor must trust these over training memory)

### Pinned versions
- `@tanstack/react-start@1.168.26` — **there is no 1.0.0 stable**; the `1.x` number is lockstep monorepo versioning, not a semver stability signal. `@tanstack/react-router@1.170.16` arrives as a hard dependency (not peer) — do **not** also pin `@tanstack/react-router` directly (let it resolve transitively to avoid a duplicate/peer conflict; pin only the packages you import directly: `@tanstack/react-start`, `@tanstack/react-router-ssr-query`, `@tanstack/react-query`, `@tanstack/react-table`).
- `@heroui/react@3.2.1`, `@heroui/styles@3.2.1`, `tailwindcss@4`, `@tailwindcss/vite@4`, React 19, Vite 8.

### TanStack Start canonical wiring (verified)
- Plugin: `tanstackStart({ srcDirectory: 'src' })` from `@tanstack/react-start/plugin/vite`; `viteReact()` from `@vitejs/plugin-react` **must come after**; `tailwindcss()` from `@tailwindcss/vite`. **Use the scaffold's generated `vite.config.ts` as the source of truth — Start 1.168.26 ships a built-in default server entry; do NOT assume an explicit `import { nitro } from 'nitro/vite'` is required (verify against the scaffold output).** Path aliases via `resolve.tsconfigPaths: true` (built-in, not the `vite-tsconfig-paths` plugin). **Workspace TS deps:** add `ssr: { noExternal: ['@org/client-ts', '@org/shared-ts'] }` so Vite transpiles their raw `.ts` source (the current `front` does the same).
- Entry files (`server.ts`/`client.tsx`/`ssr.tsx`) are **auto-generated** by the plugin in 1.168.x — you author only `src/router.tsx` and `src/routes/__root.tsx`.
- `src/router.tsx` exports `getRouter()` (fresh `QueryClient` per request) and calls `setupRouterSsrQueryIntegration({ router, queryClient })` from `@tanstack/react-router-ssr-query` (auto-wraps `QueryClientProvider` + dehydrate/hydrate). The legacy `routerWithQueryClient` is superseded.
- `__root.tsx` uses `shellComponent: RootDocument` (with `<HeadContent/>` + `<Scripts/>`), not the older `component`+`RootDocument`+`<Outlet/>` shape.
- Server functions: `createServerFn({ method }).validator().handler({ data })` from `@tanstack/react-start`; cookie/header helpers `getCookie`/`setCookie`/`deleteCookie`/`getRequest`/`getRequestHeader` from `@tanstack/react-start/server`. **Caveat (#5615): a cookie set via `setCookie` is not readable via `getCookie` in the same request.** **Use server functions ONLY for cookie I/O — never for application data (spec §4.1).**
- Virtual File Routes: `rootRoute`/`route`/`index`/`layout`/`physical` from `@tanstack/virtual-file-routes` in a `src/routes.ts`, referenced by `tanstackRouter({ target: 'react', virtualRouteConfig: './src/routes.ts' })` from `@tanstack/router-plugin/vite`. **UNVERIFIED:** exact placement of `virtualRouteConfig` when nested under `tanstackStart()` — Task 1.4 resolves.
- Deploy: `vite build` → client `dist/client`, server `.output/server/index.mjs`; run `node .output/server/index.mjs`; Node is the default Nitro preset; custom Node server supported.

### HeroUI v3 + Tailwind v4 (verified)
- Install `@heroui/styles @heroui/react` + `tailwindcss@4 @tailwindcss/vite@4`. Global CSS:
  ```css
  @import "tailwindcss";
  @import "@heroui/styles";
  @custom-variant dark (&:is(.dark *));
  ```
- **Provider-less** (v3 removed `HeroUIProvider`). Dark mode = `class` + `data-theme` on `<html>`; `useTheme` from `@heroui/react`.
- **No official Vite-SSR guide** (BIGGEST risk). HeroUI v3 is built on `react-aria-components@1.18.x`. SSR facts from React Aria:
  - React 19 → no `SSRProvider` needed (`useId`).
  - Wrap with `<I18nProvider locale={lang}>` (from `react-aria-components`) feeding the same request locale on server + client.
  - **CSP nonce:** React Aria reads a nonce from `<meta property="csp-nonce">` *or* Vite's `html.cspNonce`. The current `front` reads `meta[name="csp-nonce"]`. **Emit BOTH `name` and `property` with the same nonce** (Task 3.1), or set `html.cspNonce`.
  - **FOUC:** set initial `class`/`data-theme` on the server-rendered `<html>` (or inline pre-hydration script) because `useTheme` reads `localStorage` (absent on server).
- **Table v3** is **presentational** — compound API with a `Table.Content` wrapper: `Table`/`Table.ScrollContainer`/`Table.Content`/`Table.Header`/`Table.Column`/`Table.SortableColumnHeader`/`Table.Body`/`Table.Row`/`Table.Cell`. `Table.Column` needs `id` (= sort key); `Table.Row` needs `id` + React `key` + `textValue`. Sort: `sortDescriptor` + `onSortChange` on `Table.Content`; multi-select: `selectionMode="multiple"` + `selectedKeys` + `onSelectionChange`. **No built-in virtualization** (needs `<Virtualizer layout={TableLayout}>`). **Pair with `@tanstack/react-table` for row/sort/pagination logic** (Task 2.6).
- **License:** CONFIRMED inconsistency — npm `@heroui/react@3.2.1` = MIT, but the GitHub `v3` branch `LICENSE` = Apache-2.0 (its `package.json` says MIT). Task 0.1 resolves.

### Real repo contract (from `apps/front` — the auth slice + parity tests must match these literally)
- Constants in `packages/shared-ts/lib/constants.ts`: `SESSION_TOKEN_HEADER_KEY = 'X-Session-Token'`; `TENANT_ID_HEADER_KEY` is a **template literal** `` `X-${APP_NAME_PASCAl_CASE}-TenantId` `` where `APP_NAME_PASCAl_CASE = toPascalCase('PublyApp')` (resolves to `X-PublyApp-TenantId`, WITH the hyphen); `SESSION_TOKEN_COOKIE_KEY = 'publyapp-session_token'`, `LOCALE_COOKIE_KEY = 'publyapp-locale'`, `isServer = typeof window === 'undefined'`. **Always IMPORT these constants from `@org/shared-ts/lib/constants`; NEVER hardcode the literal — the casing is computed by `toPascalCase`.**
- **Session cookie is JS-readable (NOT `httpOnly`)** in the current shipped app — `getSessionTokensFromClient()` reads `document.cookie`. The spike matches this (see Architecture gate). (An httpOnly migration is in-progress in the repo; adopting it is a Phase-1 spec decision, NOT this spike.)
- Dual-token cookie (`apps/front/src/lib/cookies/session-cookie.utils.ts`): `t:${tenantToken}`, `s:${staffToken}`, `s:...+t:...` (impersonation), `+` delimiter, legacy raw = tenant token. `parseSessionCookie`/`formatSessionCookie`/`getSessionTokensFromClient`.
- Env (`apps/front/src/lib/env.ts`): `VITE_ASP_SERVER_URL` (API base), `VITE_POSTHOG_API_KEY`.
- Login is **TWO-STEP** (verified login-page.tsx:101,161): (1) `client.auth.login.post({ email, password })` → `{ sessionToken, sessionExpiresAt, userId }`; set the cookie via `formatSessionCookie` + `cookie.serialize()` using **`sessionExpiresAt`** for `expires`/`maxAge`. (2) THEN an **authenticated** `client.auth.redirectCode.get()` → `{ redirectCode, hasSuspendedTenants? }` where `STAFF` → `/staff`, `TENANT_PICKER` → `/app`, tenant → `/app/{tenantId}`, `UNAUTHORIZED` → 403. **`redirectCode` is NOT on the login response.** Because of #5615 (cookie just set isn't readable same request), step 2 runs on the **next** request/route load, not in the login server fn. The spike simplifies to step 1 + redirect to `/staff/staff-users` (staff-only slice) but must not pretend `res.redirectCode` exists.
- Identity echo (for isolation tests): `client.auth.userAuthData.get()` / `client.auth.scopeAuthData.get()` return the authenticated user's identity/scope (verify exact accessor in the generated client).
- Staff list: UI route is **`/staff/staff-users`** (dir `routes/authed/staff/staff-users/list`), via hook `useFindStaffUser` → `client.staff.users.get({ queryParameters: { cursor?, limit?, q?, status?, sortId?, sortOrder? } })` (verify the exact Kiota accessor against the generated `@org/client-ts`).
- CSP (`packages/shared-ts/lib/csp.ts`): `script-src 'self' … 'nonce-{nonce}'`; **`style-src 'self' 'unsafe-inline' …`** (currently allows `unsafe-inline` for styles); nonce via `nanoid()` per request, injected by helmet + consumed in `entry.server.tsx`.
- i18n (`apps/front/src/lib/i18n/i18n.config.ts`): `supportedLanguages = ['en','fr']`, `defaultNS = 'common'`, `fallbackLng = 'en'`, namespaces `common`/`zod`/`response-message`; locale from the **`publyapp-locale` cookie**; client JSON at `public/locales/{locale}/{ns}.json`. InterZod resolves Zod errors via the `zod` namespace.
- 401-logout (`apps/front/src/lib/react-query/query-client.tsx`): `QueryCache.onError` → `onAuthError(401)` → `logout()` (clears cookie, `queryClient.clear()`, POST `/auth/clear-session`, `globalNavigate` to login). **403 never logs out**: generic → `View403`; tenant-suspended (`translationKey=tenant-suspended`) → clears tenant hint + `TenantSuspendedView`.

### Prerequisites — deterministic API/DB/seed (the slice + contract tests are useless without this)
- The auth slice and contract tests need the **real .NET API running with seeded data**: `just dev-db && just dev-api` (+ `just dev-front` for the `current-front` project). Tests must be deterministic → run against a **freshly seeded DB** (`just db-reset` + seeder, or the API's seed path), NOT an ad-hoc DB.
- Seeded **staff** login: `staff-admin@example.com` / `SeedConstants.SeedPassword` (`apps/api/Data/Seeding/SeedConstants.cs`). Tenant accounts e.g. `admin-acme@example.com`.
- **Two API bases (R3-B1 — direct-Kiota means the browser calls the API itself):** `SERVER_API_BASE_URL` (SSR/per-request Kiota; internal compose host, e.g. `http://api:5000`) and `PUBLIC_API_BASE_URL` (browser Kiota; the **Traefik-exposed** API host reachable from the browser). Locally both may be `http://localhost:5000`; the PUBLIC base is injected at RUNTIME via `window.__ENV__` (Task 2.5), not build-time `import.meta.env`.
- **Dockerized spike (Groups 3–4):** wire the **API + a freshly-seeded Postgres + a Toxiproxy fault-proxy** into the same compose network, with the API ALSO exposed through Traefik for the browser's public base, so the deployed Playwright run is deterministic and can inject faults.

### Open `UNVERIFIED` flags this spike resolves (Task 2.0 probes them; Task 5.1 records them)
1. Query SSR opt-out option name + `hydrate/dehydrateOptions` shape. 2. `getWebRequest()` alias for `getRequest()`. 3. `setCookie` same-request read caveat in practice. 4. `virtualRouteConfig` placement under `tanstackStart()`. 5. HeroUI `useTheme` TS return type + SSR FOUC guidance. 6. Import path of `I18nProvider`/`SortDescriptor`/`Selection` (HeroUI vs `react-aria-components`). 7. No official HeroUI Vite-SSR guide.

---

## Architecture gate (BLOCKS everything in Group 2 — resolve and record before writing slice code)

Spec §4.1: the .NET API via Kiota is the single source of truth; Start server functions are for frontend-server concerns ONLY. The spike must NOT become an app-data BFF. Therefore the spike adopts the **DIRECT-KIOTA model**, matching the current shipped app:

| Concern | Spike implementation |
|---|---|
| Session cookie | **JS-readable (NOT `httpOnly`)** — matches `getSessionTokensFromClient()` reading `document.cookie` |
| Client-side data | TanStack Query fetcher uses the **browser Kiota client** (reads token from cookie) |
| SSR data | Route **loader** builds a **per-request Kiota client** from the cookie (read via request headers) and primes the Query cache. SSR calling the real API directly is NOT a BFF. |
| `createServerFn` | **Cookie I/O only** (login set-cookie, clearSession delete-cookie). Never app data. |

The **httpOnly + server-relay** alternative (where the frontend server proxies all API calls) is a **spec-level decision deferred to Phase 1**. The repo has an in-progress httpOnly migration; this spike deliberately reproduces the *currently shipped* JS-readable-cookie model so a green spike proves the *real* architecture, not a different one.

**Gate task (record in the findings doc before Task 2.1): GO is forbidden until this architecture choice is written down and confirmed not to contradict spec §4.1.**

---

## File structure

```
apps/front-2-spike/                    # disposable; deleted after the GO/NO-GO record
├── package.json                       # exact pins; "preinstall" assert-pinned guard; scripts
├── vite.config.ts                     # tanstackStart + viteReact + tailwindcss + ssr.noExternal + router virtual config
├── Dockerfile                         # multi-stage; ROOT build context (../..)
├── tsconfig.json
├── src/
│   ├── router.tsx                     # getRouter() + setupRouterSsrQueryIntegration
│   ├── routes.ts                      # Virtual File Routes tree (code-based)
│   ├── styles/app.css                 # tailwind + heroui imports + dark variant
│   ├── routes/
│   │   ├── __root.tsx                 # shellComponent; <html> initial theme; csp-nonce meta (name+property); I18nProvider
│   │   ├── index.tsx                  # redirect → /login or /staff/staff-users
│   │   ├── login.tsx                  # login form → login server fn (cookie I/O only)
│   │   ├── _probe.tsx                 # Task 2.0 runtime probes (temporary; removed before deploy)
│   │   └── authed/
│   │       ├── layout.tsx             # session gate (loader) + authed shell + dark-mode toggle
│   │       ├── auth-echo.tsx          # SSR identity echo for isolation test (userAuthData)
│   │       └── staff-users.tsx        # browser-Kiota Query + SSR loader prime → HeroUI/TanStack Table + RHF/Zod dialog
│   ├── server/
│   │   ├── session-cookie.ts          # PURE parse/format (what Vitest imports — no Start imports)
│   │   ├── session.server.ts          # createServerFn cookie I/O: login/clearSession
│   │   └── csp.server.ts              # per-request nonce; CSP header
│   ├── lib/
│   │   ├── api-client.ts              # Kiota client factory (browser + per-request; real header keys)
│   │   ├── i18n.server.ts             # i18next SSR init (en/fr, common/zod/response-message)
│   │   ├── i18n.client.ts             # i18next client init + InterZod
│   │   └── query.ts                   # queryOptions (staff users) — browser Kiota fetcher + SSR loader
│   └── components/
│       ├── field-text.tsx             # RHF Field.Text re-skinned on HeroUI/React Aria
│       └── members-table.tsx          # HeroUI v3 Table + @tanstack/react-table logic
├── Dockerfile, .dockerignore (repo ROOT .dockerignore)
└── deploy/
    └── docker-compose.proxy.yml       # Traefik + spike + API + seeded DB + Toxiproxy (one network)

e2e-contract/                          # SHARED parity contract — two Playwright projects
├── playwright.config.ts               # projects: current-front (5050), front-2-spike (proxy URL)
├── _session.ts                        # real-login storageState bootstrap (both base URLs)
├── fixtures.ts                        # auto console-error/hydration-warning-fail fixture
└── contract/*.spec.ts                 # invariants that MUST pass on BOTH apps

apps/front-2-spike/e2e/                # spike-ONLY specs (deployed container)
└── *.spec.ts                          # SSR/CSP/security/auth-matrix/table/dialog/dark-mode/slow-net/a11y/isolation

docs/superpowers/reviews/2026-06-19-front-2-phase-0-findings.md   # GO/NO-GO record (Task 5.1)
```

---

## Group 0 — Gates (cheapest kill-switches; do first)

### Task 0.1: HeroUI v3 license gate

**Files:** Create `docs/superpowers/reviews/2026-06-19-front-2-phase-0-findings.md` (license section)

- [ ] **Step 1: Capture raw evidence (registry curl, no `npm view`)**

```bash
curl -s https://registry.npmjs.org/@heroui/react/3.2.1 | python3 -c "import sys,json;print('npm @heroui/react license:', json.load(sys.stdin)['license'])"
curl -s https://raw.githubusercontent.com/heroui-inc/heroui/v3/LICENSE | head -3
curl -s https://raw.githubusercontent.com/heroui-inc/heroui/v3/package.json | python3 -c "import sys,json;print('v3 package.json license:', json.load(sys.stdin)['license'])"
```
Expected: npm = `MIT`; v3 `LICENSE` = `Apache License / Version 2.0`; v3 `package.json` = `MIT`.

- [ ] **Step 2: Open an upstream clarification issue**

`gh issue list --repo heroui-inc/heroui --search "license MIT Apache in:title,body" --state all`; if none, open one asking which license governs `@heroui/react@3.x`. Record the URL.

- [ ] **Step 3: Record the gate + its hard limit**

In the findings doc `## License gate`: the three values, the issue URL, and the rule — **`PENDING-UPSTREAM` may allow the *spike* to run (MIT on the consumed npm artifact is the working assumption), but it FORCES `NO-GO for Phase 1 token/design work` until upstream confirms MIT governs.** (Finding #25.)

- [ ] **Step 4: Commit** — `git commit -m "spike(front-2): HeroUI v3 license gate evidence + upstream issue"`

### Task 0.2: TanStack Start stability/version gate

**Files:** Modify the findings doc (version section)

- [ ] **Step 1: Confirm dist-tags + absence of 1.0.0 (registry curl, no `npm view`)**

```bash
curl -s https://registry.npmjs.org/@tanstack/react-start | python3 -c "import sys,json;d=json.load(sys.stdin);print('dist-tags:',d['dist-tags']);print('router dep of latest:', d['versions'][d['dist-tags']['latest']]['dependencies'].get('@tanstack/react-router'))"
```
Expected: `latest` ≈ `1.168.26`; a concrete `@tanstack/react-router` version (≈`1.170.16`).

- [ ] **Step 2: Record** the observed `latest`, the transitive router version, "no 1.0.0 milestone — lockstep versioning," and the rule: **pin EXACT versions (no `^`/`~`) for every directly-imported `@tanstack/*` package; do NOT pin the transitive `@tanstack/react-router`; re-verify at each Phase boundary.** Note the May-2026 supply-chain incident → Task 1.2 policy mandatory.

- [ ] **Step 3: Commit** — `git commit -m "spike(front-2): TanStack Start version/stability gate"`

---

## Group 1 — Scaffold + dependency hygiene

### Task 1.1: Scaffold `apps/front-2-spike` (pinned checkout, no `npx gitpick`)

**Files:** Create `apps/front-2-spike/` (scaffold), `apps/front-2-spike/package.json`

- [ ] **Step 1: Pinned sparse checkout of the canonical example**

```bash
cd /tmp && rm -rf tsr && git clone --filter=blob:none --no-checkout https://github.com/TanStack/router tsr
cd tsr && git rev-parse HEAD   # RECORD this SHA in the findings doc
git sparse-checkout set examples/react/start-basic-react-query
git checkout HEAD
cp -r examples/react/start-basic-react-query /home/radan/Projects/PublyApp/publyapp/apps/front-2-spike
```
(`start-basic-react-query` already wires the Query SSR integration.) Record the exact commit SHA (reproducible, unlike `npx gitpick`).

- [ ] **Step 2: Rewrite `package.json`** — `"name": "front-2-spike"`, `"private": true`, `"type": "module"`. **Exact-pin every non-workspace dep** (`@tanstack/react-start` → `1.168.26`; `@heroui/react`/`@heroui/styles` → `3.2.1`; `tailwindcss`/`@tailwindcss/vite` → resolved `4.x`; `@tanstack/react-table` → resolved). Add `@org/client-ts`/`@org/shared-ts` as `workspace:*`. **Do NOT add `@tanstack/react-router` directly** (transitive). Scripts: `"dev": "vite dev"`, `"build": "vite build"`, `"start": "node .output/server/index.mjs"`, `"typecheck": "tsc --noEmit"`, `"preinstall": "node scripts/assert-pinned.mjs"`.

- [ ] **Step 3: Install + boot** — `pnpm install && pnpm dev` → default example renders.

- [ ] **Step 4: Commit** — `git commit -m "spike(front-2): scaffold from pinned start-basic-react-query SHA"`

### Task 1.2: Supply-chain install policy (CI-tested)

**Files:** Create `apps/front-2-spike/.npmrc`, `apps/front-2-spike/scripts/assert-pinned.mjs`; modify `package.json`

- [ ] **Step 1: Robust pin-assertion (semver-valid, all dep groups)**

```js
import { readFileSync } from 'node:fs'
import semver from 'semver'
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
const bad = []
for (const group of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
  for (const [name, range] of Object.entries(pkg[group] ?? {})) {
    if (range.startsWith('workspace:')) continue
    // reject anything that is not a single exact version: latest/tags/ranges/git/file:/link:/catalog:
    if (!semver.valid(range)) bad.push(`${group}:${name}@${range}`)
  }
}
if (bad.length) { console.error('Not exact-pinned:', bad.join(', ')); process.exit(1) }
console.log('All deps exact-pinned ✔')
```
(Add `semver` as a pinned devDependency.)

- [ ] **Step 2: Run** — `node scripts/assert-pinned.mjs` → `All deps exact-pinned ✔` (fix offenders).

- [ ] **Step 3: `--ignore-scripts` WITHOUT breaking trusted workspace postinstalls**

A blanket `--ignore-scripts` skips `@org/shared-ts`'s real `postinstall` (`generate-zod-i18n-map.mjs`) that i18n/InterZod need. Set `.npmrc` `prefer-frozen-lockfile=true`; then:
```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @org/shared-ts run postinstall   # explicitly run the trusted first-party postinstall
```
Verify `pnpm build` succeeds and the zod-i18n map exists. Record: the supply-chain policy must **allowlist trusted first-party postinstalls** (a blanket ban breaks shared-ts).

- [ ] **Step 4: CI** — add a job running `node apps/front-2-spike/scripts/assert-pinned.mjs`, `pnpm install --frozen-lockfile --ignore-scripts`, then the explicit shared-ts postinstall, then `pnpm --filter front-2-spike build`. (Confirms the policy is reproducible, not just asserted.)

- [ ] **Step 5: Commit** — `git commit -m "spike(front-2): exact-pin assertion (semver) + ignore-scripts policy in CI"`

### Task 1.3: HeroUI v3 + Tailwind v4 render proof

**Files:** Create `src/styles/app.css`; modify `vite.config.ts`, `src/routes/__root.tsx`, `src/routes/index.tsx`

- [ ] **Step 1:** `pnpm add @heroui/react@3.2.1 @heroui/styles@3.2.1 tailwindcss@4 @tailwindcss/vite@4`; create `src/styles/app.css` with the three `@import`/`@custom-variant` lines (Grounding).
- [ ] **Step 2:** add `tailwindcss()` to `vite.config.ts` plugins (order: `tailwindcss(), tanstackStart({ srcDirectory: 'src' }), viteReact()`); import `appCss from '../styles/app.css?url'` into `__root.tsx` `head().links`.
- [ ] **Step 3:** render `<Button color="primary">HeroUI v3 works</Button>` on `index.tsx`.
- [ ] **Step 4:** `pnpm dev` → styled HeroUI button (if unstyled, fix import/order before proceeding).
- [ ] **Step 5: Commit** — `git commit -m "spike(front-2): HeroUI v3 + Tailwind v4 render proof"`

### Task 1.4: Virtual File Routes wiring (resolves UNVERIFIED #4)

**Files:** Create `src/routes.ts`; modify `vite.config.ts`

- [ ] **Step 1: route tree**
```ts
import { rootRoute, route, index, layout } from '@tanstack/virtual-file-routes'
export const routes = rootRoute('routes/__root.tsx', [
  index('routes/index.tsx'),
  route('/login', 'routes/login.tsx'),
  layout('authed-layout', 'routes/authed/layout.tsx', [
    route('/staff/staff-users', 'routes/authed/staff-users.tsx'),
    route('/_auth-echo', 'routes/authed/auth-echo.tsx'),
  ]),
])
```
- [ ] **Step 2:** try `tanstackStart({ srcDirectory: 'src', router: { virtualRouteConfig: './src/routes.ts' } })`; if `routeTree.gen.ts` doesn't reflect it, fall back to `tanstackRouter({ target: 'react', virtualRouteConfig: './src/routes.ts' })` before `tanstackStart()`.
- [ ] **Step 3:** `pnpm dev`; inspect `routeTree.gen.ts` for `/login`, the authed layout, `/staff/staff-users`. **Record the working wiring** (UNVERIFIED #4).
- [ ] **Step 4: Commit** — `git commit -m "spike(front-2): Virtual File Routes code-based tree"`

### Task 1.5: Monorepo integration (turbo, tsconfig, workspace TS)

**Files:** Modify `turbo.json`, `apps/front-2-spike/tsconfig.json`, `apps/front-2-spike/vite.config.ts`

- [ ] **Step 1:** `pnpm -r list --depth -1 | grep front-2-spike` confirms workspace pickup (auto via `apps/*`).
- [ ] **Step 2: Turbo** — add `.output/**` to `build.outputs`; add `SERVER_API_BASE_URL` + `PUBLIC_API_BASE_URL` (+ `VITE_POSTHOG_API_KEY`) to `globalEnv`. `pnpm turbo build --filter=front-2-spike` caches `.output`.
- [ ] **Step 3: `ssr.noExternal`** — add `ssr: { noExternal: ['@org/client-ts', '@org/shared-ts'] }`; `pnpm build && node .output/server/index.mjs` → NO `ERR_UNKNOWN_FILE_EXTENSION`/raw-`.ts` error (proves workspace TS is transpiled).
- [ ] **Step 4: tsconfig** — extend `packages/_tsconfig`; path-resolve `@org/*`; `pnpm typecheck` passes.
- [ ] **Step 5: Commit** — `git commit -m "spike(front-2): monorepo integration (turbo, ssr.noExternal, tsconfig)"`

---

## Group 2 — The vertical slice (DIRECT-KIOTA model per the Architecture gate)

### Task 2.0: Start runtime probes (resolves UNVERIFIED 1–3; consumed by Task 5.1)

**Files:** Create `apps/front-2-spike/src/routes/_probe.tsx` (temporary — delete before deploy)

- [ ] **Step 1: Query SSR opt-out / dehydrate shape** — add a route whose loader primes one query; confirm `setupRouterSsrQueryIntegration` dehydrate/hydrate works and record whether a per-query opt-out exists (e.g. `wrapQueryClient`/`dehydrateOptions`). Record the real option names (UNVERIFIED #1).
- [ ] **Step 2: `getRequest()` import + headers** — in a `createServerFn`, import `getRequest`/`getRequestHeader` from `@tanstack/react-start/server`; log the request URL + a header; confirm import path; note whether `getWebRequest()` still aliases it (UNVERIFIED #2).
- [ ] **Step 3: `setCookie` then `getCookie` same request** — in one server fn, `setCookie('probe','x')` then `getCookie('probe')`; record observed value (confirms/denies #5615 in this version, UNVERIFIED #3).
- [ ] **Step 4: Record** all three in the findings doc; **delete `_probe.tsx`** and its route entry. Commit — `git commit -m "spike(front-2): Start runtime probes (record findings); remove probe route"`

### Task 2.1: Kiota client factory (browser + per-request) + redaction tests

**Files:** Create `src/lib/api-client.ts`, `src/lib/api-client.test.ts`

- [ ] **Step 1: Write the failing redaction/header test**
```ts
import { expect, test, vi } from 'vitest'
import { buildCustomFetch } from './api-client'
test('sets exactly the session + tenant headers and logs nothing sensitive', async () => {
  const logs: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')))
  const calls: Request[] = []
  const fakeFetch = (async (url: any, init: any) => { calls.push(new Request(url, init)); return new Response('{}') }) as typeof fetch
  const cf = buildCustomFetch({ getSessionToken: () => 'SECRET_TOKEN', tenantId: 'T1', fetchImpl: fakeFetch })
  await cf('https://api/x')
  const h = calls[0].headers
  expect(h.get('X-Session-Token')).toBe('SECRET_TOKEN')
  expect(h.get('X-PublyApp-TenantId')).toBe('T1')
  expect(logs.join('\n')).not.toContain('SECRET_TOKEN')
  spy.mockRestore()
})
```
- [ ] **Step 2:** run → FAIL (function missing).
- [ ] **Step 3: Implement** `buildCustomFetch({ getSessionToken, tenantId, fetchImpl })` (imports `SESSION_TOKEN_HEADER_KEY`/`TENANT_ID_HEADER_KEY` from `@org/shared-ts/lib/constants` — never hardcoded), built via `createApiClient` from `@org/client-ts/src/apiClient`. Mirror `apps/front/src/lib/api-client/client-manager.ts:230-262`. **No logging of the token anywhere.** **Two API bases (Finding B1 — direct-Kiota means the BROWSER calls the API itself, so it cannot use the internal Docker service name):**
  - `createClient({ sessionToken?, tenantId?, base })`, `base: 'public' | 'server'`. `base:'public'` → browser-reachable URL via Traefik, read at **RUNTIME** from `window.__ENV__.PUBLIC_API_BASE_URL` (injected by `__root.tsx`, Task 2.5) — NOT `import.meta.env` (build-time). `base:'server'` → `process.env.SERVER_API_BASE_URL` (internal compose host), used only in SSR.
  - `createServerClientFromCookie(cookieHeader: string | undefined)` → extracts tokens via `getSessionTokensFromCookieHeader(cookieHeader)` (the FULL `Cookie`-header parser from `session-cookie.ts`, R4-B1 — NOT `parseSessionCookie`, which expects only the raw token value) and returns a per-request `createClient({ sessionToken: staffToken ?? tenantToken, base: 'server' })`. Used by the SSR loader (Task 2.6).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit** — `git commit -m "spike(front-2): Kiota factory (browser+per-request) + header redaction tests"`

### Task 2.2: Session cookie — pure module (tested) + cookie-I/O server fns

**Files:** Create `src/lib/session-cookie.ts` (pure parser/formatter), `src/lib/session-cookie.test.ts`, `src/lib/session-cookie-client.ts` (browser `document.cookie` reader, Finding B2), `src/server/session.server.ts` (cookie-I/O server fns)

- [ ] **Step 1: Failing pure-parser test (imports the PURE module — no Start imports)**
```ts
import { expect, test } from 'vitest'
import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants'
import { parseSessionCookie, formatSessionCookie, getSessionTokensFromCookieHeader } from './session-cookie'
test('parses dual-token staff+tenant cookie', () => {
  expect(parseSessionCookie('s:AAA+t:BBB')).toEqual({ staffToken: 'AAA', tenantToken: 'BBB' })
})
test('legacy raw cookie is treated as tenant token', () => {
  expect(parseSessionCookie('RAW')).toEqual({ tenantToken: 'RAW' })
})
test('roundtrips', () => {
  expect(parseSessionCookie(formatSessionCookie({ staffToken: 'S' }))).toEqual({ staffToken: 'S' })
})
test('extracts token from a full Cookie header (multi-cookie + url-encoded value)', () => {
  const header = `publyapp-locale=fr; ${SESSION_TOKEN_COOKIE_KEY}=${encodeURIComponent('s:AAA+t:BBB')}; other=x`
  expect(getSessionTokensFromCookieHeader(header)).toEqual({ staffToken: 'AAA', tenantToken: 'BBB' })
})
test('missing cookie header → empty tokens', () => {
  expect(getSessionTokensFromCookieHeader(undefined)).toEqual({})
})
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** create `session-cookie.ts` = the **pure** `parseSessionCookie`/`formatSessionCookie` copied from `apps/front/src/lib/cookies/session-cookie.utils.ts` (NO `@tanstack/react-start` imports — Finding #23), PLUS the full-`Cookie`-header extractor (R4-B1 — `getRequestHeader('cookie')` returns the whole header, not the raw token value):
```ts
import { parse as parseCookieHeader } from 'cookie'
import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants'
export const getSessionTokensFromCookieHeader = (cookieHeader: string | undefined) => {
  const raw = parseCookieHeader(cookieHeader ?? '')[SESSION_TOKEN_COOKIE_KEY]
  return raw ? parseSessionCookie(raw) : {}
}
```
run → PASS.
- [ ] **Step 4: `session-cookie-client.ts` — browser reader (Finding B2; server-import-free)**
```ts
import { parseSessionCookie } from './session-cookie'
import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants'
// browser-only: reads document.cookie. NEVER imported by server modules.
export const getSessionTokensFromClient = () => {
  const raw = document.cookie.split('; ')
    .find((c) => c.startsWith(`${SESSION_TOKEN_COOKIE_KEY}=`))?.split('=')[1]
  return raw ? parseSessionCookie(decodeURIComponent(raw)) : { staffToken: undefined, tenantToken: undefined }
}
```
- [ ] **Step 5: `session.server.ts` — cookie I/O ONLY (NOT httpOnly; expiry from API; FULL clear matrix)**
```ts
import { createServerFn } from '@tanstack/react-start'
import { setCookie, setResponseHeader } from '@tanstack/react-start/server'
import * as cookie from 'cookie'
import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants'
import { formatSessionCookie } from '../lib/session-cookie'
import { createClient } from '../lib/api-client'

export const login = createServerFn({ method: 'POST' })
  .validator((d: { email: string; password: string }) => d)
  .handler(async ({ data }) => {
    const res = await createClient({ base: 'server' }).auth.login.post({
      email: { getValue: () => data.email },
      password: { getValue: () => data.password },
    })
    if (!res?.sessionToken) throw new Error('login failed')
    const maxAge = res.sessionExpiresAt
      ? Math.max(0, Math.floor((new Date(res.sessionExpiresAt).getTime() - Date.now()) / 1000))
      : undefined
    // JS-READABLE cookie (NOT httpOnly) — matches the current shipped app's getSessionTokensFromClient()
    setCookie(SESSION_TOKEN_COOKIE_KEY, formatSessionCookie({ staffToken: res.sessionToken }), {
      httpOnly: false, secure: true, sameSite: 'lax', path: '/',
      ...(maxAge !== undefined ? { maxAge, expires: new Date(res.sessionExpiresAt!) } : {}),
    })
    return { ok: true } // redirect decided on the NEXT request (auth.redirectCode.get) per #5615
  })

// clearSession: clear EVERY flag variant — ported verbatim from
// apps/front/src/lib/cookies/server-cookie.utils.ts (createClearSessionCookieHeaders)
export const clearSession = createServerFn({ method: 'POST' }).handler(async () => {
  const base = { path: '/', expires: new Date(0), maxAge: 0 }
  const variants = [
    base,
    { ...base, httpOnly: true },
    { ...base, httpOnly: true, sameSite: 'lax' as const },
    { ...base, httpOnly: true, sameSite: 'strict' as const },
    { ...base, httpOnly: true, secure: true, sameSite: 'lax' as const },
    { ...base, httpOnly: true, secure: true, sameSite: 'strict' as const },
    { ...base, httpOnly: true, secure: true, sameSite: 'none' as const },
  ]
  setResponseHeader('Set-Cookie', variants.map((o) => cookie.serialize(SESSION_TOKEN_COOKIE_KEY, '', o)))
})
```
The Task 4.5 clear-session test asserts the browser observes these variant `Set-Cookie` headers.
- [ ] **Step 6: Commit** — `git commit -m "spike(front-2): pure session-cookie + browser reader + cookie-I/O server fns (full clear matrix)"`

### Task 2.3: i18next SSR + InterZod (en/fr) — cookie-driven, with fallback

**Files:** Create `src/lib/i18n.server.ts`, `src/lib/i18n.client.ts`, `public/locales/{en,fr}/{common,zod,response-message}.json`; modify `__root.tsx`

- [ ] **Step 1: Seed translations** for all three namespaces (`common`, `zod`, `response-message`) in en + fr (mirror the repo's `zod:string.email` key for the dialog test).
- [ ] **Step 2: Init** — `i18n.server.ts`: per-request instance, **locale from the `publyapp-locale` cookie** (via `getCookie`), `supportedLngs:['en','fr']`, `fallbackLng:'en'`, `ns:['common','zod','response-message']`. `i18n.client.ts`: browser init + `new InterZod({ i18n })`, `setLocale(locale)`.
- [ ] **Step 3:** render `t('hello')`; wrap tree in `<I18nProvider locale={lang}>` from `react-aria-components` (record the working import path, UNVERIFIED #6); set `<html lang={lang} dir={lang==='ar'?'rtl':'ltr'}>`.
- [ ] **Step 4: Verify SSR (cookie-driven) + fallback**
```bash
pnpm build && pnpm start
curl -s -H 'Cookie: publyapp-locale=fr' http://localhost:3000/ | grep -i bonjour   # FR via cookie
curl -s -H 'Cookie: publyapp-locale=zz' http://localhost:3000/ | grep -i hello     # unsupported → English fallback
curl -s -H 'Cookie: publyapp-locale=fr' http://localhost:3000/ | grep -iE '<html[^>]*lang="fr"'
```
Expected: FR string for `fr`; English for unsupported `zz`; `<html lang="fr">` present.
- [ ] **Step 5: Commit** — `git commit -m "spike(front-2): i18next SSR (cookie-driven, fallback, 3 namespaces) + InterZod"`

### Task 2.4: Login route + staff-users data layer (browser Kiota + SSR loader; NO server-fn data relay)

**Files:** Create `src/routes/login.tsx`, `src/lib/query.ts`; modify `src/router.tsx`

- [ ] **Step 1:** confirm `getRouter()` wires `setupRouterSsrQueryIntegration` (present in the example).
- [ ] **Step 2: login form** (HeroUI `Input`/`Button`, RHF) → `login` server fn (Task 2.2) → navigate to `/staff/staff-users`.
- [ ] **Step 3: data layer — SHARED key, environment-split `queryFn` (Finding #1 + R3-A1)**
```ts
import { queryOptions } from '@tanstack/react-query'
import type { ApiClient } from '@org/client-ts/src/apiClient'
import { getSessionTokensFromClient } from './session-cookie-client' // browser-only (document.cookie)
import { createClient } from './api-client'

export type StaffUsersVars = { q?: string; sortId?: string; sortOrder?: 'asc' | 'desc'; cursor?: string }

// ONE stable key — identical on server (priming) and browser (hydration) so the cache matches.
export const staffUsersKey = (v: StaffUsersVars) => ['staff', 'users', v] as const

// The Kiota call, given an already-built client (browser OR per-request server client).
const fetchWith = async (client: ApiClient, v: StaffUsersVars) => {
  const res = await client.staff.users.get({
    queryParameters: { q: v.q, sortId: v.sortId, sortOrder: v.sortOrder, cursor: v.cursor, limit: '25' },
  })
  if (!res) throw new Error('staff users nil')
  return res
}

// BROWSER: token from document.cookie, PUBLIC base — like the real create-hooks factories. No server imports.
export const staffUsersBrowserQuery = (v: StaffUsersVars = {}) =>
  queryOptions({
    queryKey: staffUsersKey(v),
    queryFn: () => {
      const { staffToken } = getSessionTokensFromClient()
      return fetchWith(createClient({ sessionToken: staffToken, base: 'public' }), v)
    },
  })

// SERVER: the loader builds the per-request client and passes it in (Task 2.6). Same key → primes the browser query.
export const staffUsersServerQueryOptions = (v: StaffUsersVars, serverClient: ApiClient) =>
  ({ queryKey: staffUsersKey(v), queryFn: () => fetchWith(serverClient, v) })
```
The SSR loader (Task 2.6) uses `staffUsersServerQueryOptions` with `createServerClientFromCookie(getRequestHeader('cookie'))`; the component uses `useSuspenseQuery(staffUsersBrowserQuery(vars))`. Identical `staffUsersKey` → SSR-primed data hydrates with **no refetch** (proven in Task 4.3); the server never runs browser-only code (no `document`).
- [ ] **Step 4:** `pnpm typecheck` → pass. Commit — `git commit -m "spike(front-2): login + staff-users data layer (browser Kiota + SSR loader, no BFF)"`

### Task 2.5: Authed shell + error boundary + session gate + dark mode + runtime env

**Files:** Create `src/routes/authed/layout.tsx`, `src/lib/api-failure.ts`; modify `__root.tsx`

- [ ] **Step 1: session gate in `beforeLoad` (R4-B2 — the legal place for redirects)** — `authed/layout.tsx` `beforeLoad` reads the cookie server-side via `getSessionTokensFromCookieHeader(getRequestHeader('cookie'))` (full-header extractor, R4-B1); if neither token is present → `throw redirect({ to: '/login' })` **here** (never from the `errorComponent`). Render shell `<Outlet/>` + dark-mode toggle (`useTheme` from `@heroui/react`).
- [ ] **Step 2: error boundary — auth semantics on Start (R3-A4 / R4-B2 / Finding #9)** — `api-failure.ts` maps a thrown error → `ApiFailure` (reuse `toApiFailure` from `@org/shared-ts` if exported; else a minimal local mapper reading HTTP `status` + RFC-7807 `translationKey`). The route `errorComponent` on `authed/layout.tsx` **only renders views — it must NOT throw `redirect()`** (illegal in an `errorComponent`, R4-B2). It branches:
  - runtime `401` (a query failed mid-session) → render `<LogoutRedirect/>`: an **effect-driven** logout (not a thrown redirect).
  - generic `403` → minimal **View403** (stay authed, NO logout, no redirect).
  - `403` + `translationKey === 'tenant-suspended'` → **suspended view** + clear the tenant-hint cookie; NEVER logout.
  ```tsx
  function LogoutRedirect() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    useEffect(() => {
      queryClient.clear() // R5: match current 401 logout semantics (clear cached data)
      void clearSession().finally(() =>
        navigate({ to: '/login', search: { redirect_cause: 'invalid_session' } }))
    }, [])
    return <SplashScreen />
  }
  ```
  (Missing/invalid token *at navigation time* is handled by the Step-1 `beforeLoad` redirect; this boundary only catches runtime 401s.) Asserted on BOTH apps by the 403 contract specs (Task 4.2) + the spike auth matrix (Task 4.4).
- [ ] **Step 3: FOUC guard + RUNTIME public env (R3-B1)** — `__root.tsx` renders `<html class={initialTheme} data-theme={initialTheme} lang={lang}>` from a `publyapp-theme` cookie (default `light`) + an inline pre-hydration script syncing `localStorage`→`<html>` before paint (UNVERIFIED #5). In the same `<head>`, emit a **nonce-bearing** `<script nonce={nonce}>{` + "`window.__ENV__=${JSON.stringify({ PUBLIC_API_BASE_URL: process.env.PUBLIC_API_BASE_URL })}`" + `}</script>` so the browser Kiota client (`base:'public'`) reads the public base at RUNTIME — not build-time `import.meta.env`.
- [ ] **Step 4: Verify** — `pnpm build && pnpm start`; `/staff/staff-users` w/o cookie → `/login`; toggle dark, reload → no flash; `window.__ENV__.PUBLIC_API_BASE_URL` is set.
- [ ] **Step 5: Commit** — `git commit -m "spike(front-2): authed shell + error boundary (401/403/suspended) + dark mode + runtime env"`

### Task 2.6: Staff users — HeroUI Table + TanStack Table (prove or DISPROVE parity; §13 top UI risk)

**Files:** Create `src/components/members-table.tsx`, `src/routes/authed/staff-users.tsx`

- [ ] **Step 1: TanStack Table logic + HeroUI presentation**

`members-table.tsx`: use `@tanstack/react-table` for column defs + sort + (cursor) pagination state, rendered through the HeroUI v3 compound `Table` (`Table.Content` `selectionMode="multiple"` + `sortDescriptor` derived from the TanStack sort state; `Table.Column id`; `Table.Row id + textValue`). Import `SortDescriptor`/`Selection` from `react-aria-components` if `@heroui/react` doesn't export them (record which — UNVERIFIED #6).

- [ ] **Step 2: Drive REAL server query params** — sort/search/pagination changes update `StaffUsersVars` (`sortId`/`sortOrder`/`q`/`cursor`) → server roundtrip (not client-only sort). Loader primes page 1 with a **per-request server client** (R3-B1/B3):
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { getRequestHeader } from '@tanstack/react-start/server'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createServerClientFromCookie } from '../../lib/api-client'
import { staffUsersServerQueryOptions, staffUsersBrowserQuery } from '../../lib/query'

// ⚠️ Use the EXACT route id emitted in routeTree.gen.ts after Task 1.4 (URL /staff/staff-users) — read that file and copy it verbatim.
export const Route = createFileRoute('/staff/staff-users')({
  loader: ({ context }) => {
    const serverClient = createServerClientFromCookie(getRequestHeader('cookie')) // per-request, base:'server'
    return context.queryClient.ensureQueryData(staffUsersServerQueryOptions({}, serverClient))
  },
  component: StaffUsersPage,
})
function StaffUsersPage() {
  const { data } = useSuspenseQuery(staffUsersBrowserQuery()) // same key → reuses SSR-primed data, no refetch
  return <MembersTable items={data.items ?? []} />
}
```
- [ ] **Step 3: States** — empty state (`q=NO_MATCH` → "no results"), loading state, and a **virtualization probe** with 1k+ rows via `<Virtualizer layout={TableLayout}>`. **If virtualization/resize/pin is not feasible on HeroUI v3 Table, record an explicit table-parity NO-GO** in the findings doc (this is the decision §13 needs).
- [ ] **Step 4: Verify** (manual + later Playwright in Task 4.x): rows present in **initial SSR HTML**; sort click → new server request with `sortId`/`sortOrder`; `q=NO_MATCH` → empty state.
- [ ] **Step 5: Commit** — `git commit -m "spike(front-2): staff users HeroUI+TanStack Table (states, server sort, virtualization probe)"`

### Task 2.7: RHF + Zod dialog with a translated validation error

**Files:** Create `src/components/field-text.tsx`; modify `src/routes/authed/staff-users.tsx`

- [ ] **Step 1:** `field-text.tsx` — RHF `Controller` → HeroUI `Input` surfacing `fieldState.error.message`; identical RHF+Zod contract to `apps/front/src/components/hook-form`.
- [ ] **Step 2:** HeroUI `Modal` (button-opened) with `zodResolver` on `z.string().email()`; invalid submit → InterZod-translated message in the active locale.
- [ ] **Step 3: Verify** is in the **deployed-container Playwright test** (Task 4.x — Finding #18), not just `pnpm dev`.
- [ ] **Step 4: Commit** — `git commit -m "spike(front-2): RHF+Zod HeroUI dialog (InterZod translated error)"`

---

## Group 3 — CSP + deploy

### Task 3.1: CSP/nonce — blocking enforcement + React Aria nonce (Findings #3, #22)

**Files:** Create `src/server/csp.server.ts`; modify `__root.tsx`

- [ ] **Step 1: Per-request nonce + CSP** — `csp.server.ts` generates a per-request `nonce` (`nanoid`), mirrors `packages/shared-ts/lib/csp.ts`. Set **both** report-only (for diagnostics) and an **enforced** `Content-Security-Policy` header (the enforced one is what the blocking test asserts). `script-src` includes `'nonce-{nonce}'`.
- [ ] **Step 2: Feed nonce to React Aria** — in `<head>` emit **both** `<meta name="csp-nonce" content={nonce} />` (current-app convention) **and** `<meta property="csp-nonce" content={nonce} />` (React Aria), same nonce (or set `html.cspNonce`). Assert React Aria injected styles consume it.
- [ ] **Step 3: `style-src` decision** — run the deployed slice with `style-src` WITHOUT `'unsafe-inline'`; record exactly what breaks (inline `<style>` / React Aria runtime style) and whether nonce/hash clears it; if infeasible, document `style-src 'unsafe-inline'` must remain (matches current `front`). Write verdict to findings.
- [ ] **Step 4: Commit** — `git commit -m "spike(front-2): enforced+report-only CSP, nonce (name+property), style-src verdict"`

### Task 3.2: Dockerfile (ROOT context) + compose with API + seeded DB + Toxiproxy

**Files:** Create `apps/front-2-spike/Dockerfile`, repo-root `.dockerignore`, `apps/front-2-spike/deploy/docker-compose.proxy.yml`, `apps/front-2-spike/deploy/request-counter/server.mjs`, `apps/front-2-spike/deploy/request-counter/Dockerfile`

- [ ] **Step 1: Multi-stage Dockerfile with ROOT build context** (Finding #14) — builder copies only `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `apps/front-2-spike`, `packages/client-ts`, `packages/shared-ts`, `packages/_tsconfig`; `pnpm install --frozen-lockfile --ignore-scripts` + explicit shared-ts postinstall + `pnpm --filter front-2-spike build`; runtime stage copies `.output` + `dist/client`, `CMD ["node",".output/server/index.mjs"]`, `EXPOSE 3000`, **HEALTHCHECK** curling `/login`. Add a repo-root `.dockerignore` (exclude `.env*`, `node_modules`, `.git`, build dirs).
- [ ] **Step 2: Compose** — `traefik` (v3, TLS termination, self-signed local) + `front-2-spike` (build `context: ../..`, `dockerfile: apps/front-2-spike/Dockerfile`) + the **.NET API** + a **freshly-seeded Postgres** + **Toxiproxy** (TCP fault injection between spike-SSR and API) — one network. **Two API bases (R3-B1):** `SERVER_API_BASE_URL` → internal API/Toxiproxy service name (SSR/per-request Kiota); `PUBLIC_API_BASE_URL` → the **Traefik-exposed** API host reachable from the browser (NOT a Docker service name) — route the API through Traefik. **Route-aware request counter (R4-A1):** Toxiproxy is TCP-level and cannot count by route, so add a tiny dependency-free **HTTP logging-proxy sidecar** `request-counter` (Step 2b) that BOTH `SERVER_API_BASE_URL` and `PUBLIC_API_BASE_URL` point at (PUBLIC: browser → Traefik → request-counter → API; SERVER: spike-SSR → request-counter → API). Fault tests still target Toxiproxy (set `API_UPSTREAM` of the counter to the Toxiproxy service so faults + counting compose).
- [ ] **Step 2b: the `request-counter` sidecar** (`deploy/request-counter/server.mjs`) — a ~25-line zero-dep Node proxy that forwards everything to `API_UPSTREAM`, counts upstream requests by path, and exposes `POST /__counter/reset` + `GET /__counter?path=/staff/users` → `{count}`:
```js
import { createServer, request as httpRequest } from 'node:http'
const UPSTREAM = new URL(process.env.API_UPSTREAM) // e.g. http://toxiproxy:8666 or http://api:5000
const counts = new Map()
createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__counter/reset') { counts.clear(); res.end('ok'); return }
  if (req.url.startsWith('/__counter')) {
    const path = new URL(req.url, 'http://x').searchParams.get('path') ?? ''
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ count: counts.get(path) ?? 0 })); return
  }
  const path = req.url.split('?')[0]
  counts.set(path, (counts.get(path) ?? 0) + 1)
  const up = httpRequest(
    { hostname: UPSTREAM.hostname, port: UPSTREAM.port, path: req.url, method: req.method, headers: req.headers },
    (u) => { res.writeHead(u.statusCode ?? 502, u.headers); u.pipe(res) })
  up.on('error', () => { res.writeHead(502); res.end('upstream error') })
  req.pipe(up)
}).listen(8800, () => console.log('request-counter on :8800'))
```
Its `Dockerfile` is `FROM node:22-alpine` + `COPY server.mjs .` + `CMD ["node","server.mjs"]`. Add it to the compose network with `API_UPSTREAM` → Toxiproxy (or the API). **R5: publish it on a host port** (`ports: ['8800:8800']`) — or add a Traefik route — so the host-run Playwright runner can reach it; tests read `COUNTER_URL` (e.g. `http://localhost:8800`). (If Playwright runs *inside* the compose network instead, use the service name as `COUNTER_URL`.)
- [ ] **Step 3: Build + run + secret scan** — `docker compose -f ... up --build -d`; `curl -sk https://localhost/ | head`; then **assert no secrets in the image**: `docker run --rm <img> sh -c 'ls -la /app; env' | grep -iE 'token|secret|\.env|connection' && echo LEAK || echo clean`. Record the standalone-Node + proxy result (core deploy de-risk).
- [ ] **Step 4: Commit** — `git commit -m "spike(front-2): Dockerfile (root ctx) + compose (API+seeded DB+Toxiproxy+Traefik) + healthcheck"`

---

## Group 4 — Shared parity contract + spike-only deployed tests

> **Finding #5:** ONE `e2e-contract/` with two Playwright projects (`current-front` → `http://localhost:5050`, `front-2-spike` → the proxy URL). Invariant specs run against BOTH so front-2 can't drift. Spike-only specs (SSR/CSP/security/deploy) run against the spike project only. An auto fixture fails any test on console error / hydration warning (Finding #24).

### Task 4.1: Shared harness (two projects, auto-fail fixture, readiness)

**Files:** Create `e2e-contract/playwright.config.ts`, `e2e-contract/_session.ts`, `e2e-contract/fixtures.ts`

- [ ] **Step 1: Two-project config** — projects `current-front` (`baseURL` 5050) and `front-2-spike` (`baseURL` = `SPIKE_URL`, `ignoreHTTPSErrors`). **Readiness** (Finding #26): `webServer`/global-setup waits for `/login` 200 AND `/staff/staff-users` (unauth) → redirect, on each base URL, before tests run.
- [ ] **Step 2: Auto-fail fixture** (Finding #24) — `fixtures.ts` extends `test` with an `afterEach` that FAILS on any console `error` or `/hydrat|did not match|mismatch/i` warning unless the test sets `test.info().annotations` opt-out.
- [ ] **Step 3: `_session.ts`** — real login (`staff-admin@example.com` / seed password) per base URL → stored `storageState`.
- [ ] **Step 4: Smoke** on both projects (login renders email field). Commit — `git commit -m "test(contract): two-project harness + auto-fail fixture + readiness"`

### Task 4.2: Contract invariants (run on BOTH apps)

**Files:** Create `e2e-contract/contract/{auth,url-state,i18n,ssr}.spec.ts`

- [ ] **Step 1: auth.spec** — unauthenticated authed route → login; `403` generic stays authed (View403); `403` tenant-suspended (`translationKey=tenant-suspended`) clears tenant hint + suspended view + never logs out (Finding #9 — two distinct specs).
- [ ] **Step 2: url-state.spec** — set search/sort/pagination on the staff list → URL params (`q`/`sortId`/`sortOrder`/cursor) update + reload restores the view.
- [ ] **Step 3: i18n.spec** — `fr` form invalid → InterZod French message; `en` → English; unsupported locale → English fallback.
- [ ] **Step 4: ssr.spec** — JS disabled: `/` + login render content; correct `<title>` + status codes + `<html lang>`.
- [ ] **Step 5: invalidation — DEFERRED from Phase 0 (R3-A3)** — a real write mutation breaks test determinism, and TanStack Query invalidation is battle-tested (not a spike unknown). Do NOT add an invalidation spec or a slice mutation; record invalidation as a **Phase-1 blocking follow-up** in the findings doc (Task 5.1) and exclude it from Phase-0 GO criteria.
- [ ] **Step 6:** run both projects; commit — `git commit -m "test(contract): auth/url-state/i18n/ssr invariants on both apps"`

### Task 4.3: Spike-only — SSR/hydration + Query priming proof (Findings #13, #20)

**Files:** Create `apps/front-2-spike/e2e/ssr.spec.ts`

- [ ] **Step 1: no-JS SSR** — `javaScriptEnabled:false` → login email field visible (in SSR HTML).
- [ ] **Step 2: hydration clean** — load with JS; auto fixture asserts no hydration warning.
- [ ] **Step 3: Query priming proof (R4-A1 sidecar; R5 — SINGLE page load)** — `POST {COUNTER_URL}/__counter/reset`; do **one** JS-enabled `page.goto('/staff/staff-users')` and capture the **main navigation document body** (`(await response.text())` from that goto) — assert staff-user rows + dehydrated state are present in that SSR HTML; let hydration settle; then `GET {COUNTER_URL}/__counter?path=/staff/users` and assert **`count === 1`** — one SSR loader call, NO post-hydration refetch (a refetch via the public base would make `count === 2`). **Do NOT** do a separate raw-HTML fetch *and* a second navigation — that double-counts the SSR loader. (The JS-disabled SSR assertion already lives in Step 1.)
- [ ] **Step 4: slow-network hydration** (Finding #20) — Playwright route delays JS/CSS chunks; assert no layout collapse, no hydration warning, stable login/table/dialog controls.
- [ ] **Step 5: Commit** — `git commit -m "spike(front-2): SSR/hydration + priming(no-refetch) + slow-network tests"`

### Task 4.4: Spike-only — auth-case matrix + token-distinct isolation (Findings #2, #8)

**Files:** Create `apps/front-2-spike/e2e/auth-matrix.spec.ts`, `apps/front-2-spike/e2e/isolation.spec.ts`

- [ ] **Step 1: auth-case matrix** — separate specs, each with expected result: expired token (401 logout + cookie cleared), random-invalid token, malformed cookie, overlong cookie, duplicate `s:`/`t:` parts, tampered `s:valid+t:attacker`, missing cookie, clear-session variants → assert 401-logout / cookie-clear / no-crash / **no token in any log**.
- [ ] **Step 2: token-distinct isolation** (Finding #2) — render the SSR **`/_auth-echo`** route (uses `client.auth.userAuthData.get()`); two concurrent requests with **different** staff/tenant cookies must show **different `userId`/email/scope in the server HTML** (not just hydrated DOM). Proves per-request isolation with token-distinct evidence (a shared global list cannot).
- [ ] **Step 3: Commit** — `git commit -m "spike(front-2): auth-case matrix + token-distinct SSR isolation"`

### Task 4.5: Spike-only — security (cookie flags, CSRF, log-leak), CSP blocking

**Files:** Create `apps/front-2-spike/e2e/security.spec.ts`, `apps/front-2-spike/e2e/csp.spec.ts`

- [ ] **Step 1: cookie flags** (Finding #4) — after login, assert the browser-observed `Set-Cookie` for `publyapp-session_token` has `Secure`, `SameSite=Lax`, `Path=/`, expiry matching API `sessionExpiresAt`, and is **NOT `HttpOnly`** (intentional, per Architecture gate).
- [ ] **Step 2: CSRF** — cross-origin POST to the `login`/`clearSession` server fns must be rejected or origin-guarded (record Start's built-in behavior).
- [ ] **Step 3: log-leak** — seed cookie `s:LEAK_SENTINEL_<rand>`, force a 401 and a 500 (via Toxiproxy), assert the sentinel appears in **none** of: browser console, spike app logs, API logs.
- [ ] **Step 4: CSP blocking** (Finding #3) — assert the **enforced** `Content-Security-Policy` header is present; two `/login` loads have **distinct** nonces; an injected inline script **without** nonce is **blocked**; a nonce-bearing script **runs**.
- [ ] **Step 5: Commit** — `git commit -m "spike(front-2): security (cookie flags/CSRF/log-leak) + blocking-CSP/nonce tests"`

### Task 4.6: Spike-only — API error paths, a11y, dialog, dark-mode, RTL (Findings #7, #18, #19, #11)

**Files:** Create `apps/front-2-spike/e2e/{errors,a11y,dialog,dark-mode,rtl}.spec.ts`

- [ ] **Step 1: API error paths** (Finding #7) — via Toxiproxy: API 500, timeout, connection-refused, slow, invalid-JSON body → assert `ApiFailure` mapping + UI (error view, no crash, no logout on 500).
- [ ] **Step 2: a11y + keyboard** — `@axe-core/playwright` on `/login` + `/staff/staff-users` (zero serious/critical); table Tab→arrow→Space selection works (React Aria contract under HeroUI).
- [ ] **Step 3: dialog** (Finding #18) — deployed-container test: open dialog, invalid submit in `fr` → translated InterZod message; focus moves to invalid field; Escape closes + restores focus.
- [ ] **Step 4: dark-mode combos** (Finding #19) — cookie-dark/storage-light, cookie-light/storage-dark, invalid theme cookie, no-storage → raw-HTML pre-hydration `<html class>` assertion + post-hydration assertion (no flash, consistent).
- [ ] **Step 5: RTL smoke** (Finding #11) — force `<html dir="rtl">`; smoke sort-icon/modal-placement/focus-order; **record full RTL as a deferred Phase-0 residual risk** in findings.
- [ ] **Step 6: Commit** — `git commit -m "spike(front-2): error-paths + a11y/keyboard + dialog + dark-mode + RTL smoke"`

---

## Group 5 — GO / NO-GO decision record

### Task 5.1: Findings + decision

**Files:** Modify the findings doc + the strategy spec §18

- [ ] **Step 1: Fill every section** — for each §18 open question + each UNVERIFIED flag (1–7, resolved by Task 2.0/2.3/2.6/3.1): what we did, observed, resolution, residual risk. Include: architecture-gate decision; license gate (`PENDING-UPSTREAM` ⇒ NO-GO for Phase-1 token work); version pin + recorded SHAs; VFR wiring; Query priming (no-refetch) proof; CSP `style-src` verdict + blocking proof; SSR/hydration cleanliness; a11y/keyboard; deploy-behind-proxy + secret-scan; table-parity verdict (incl. virtualization GO/NO-GO); RTL residual; the **deferred §11 parity tail** (toasts, menus, comboboxes, focus-restore, robots, sitemap, per-page locale meta) recorded as a **blocking follow-up before Phase-1 fan-out** (Finding #21).
- [ ] **Step 2: Normalized bundle measurement** (Finding #27) — record **gzip + brotli** sizes for: client entry, route chunks, HeroUI/Tailwind CSS, Kiota client, table route chunk; set **provisional per-surface budgets** (enforced in Phase 1).
- [ ] **Step 3: Explicit GO/NO-GO** — `## Decision`: **GO** only if architecture-gate recorded + SSR/hydration clean + deploy-behind-proxy works + dual-token auth + 401/403 (generic+suspended) pass + Query priming proven + i18n SSR + table parity acceptable (or table NO-GO explicitly accepted) + license not blocking the spike. Else **NO-GO/REVISIT** with the failing item + alternative.
- [ ] **Step 4: Update spec §18** with each resolution + a link to the findings doc. Commit — `git commit -m "spike(front-2): Phase-0 findings + GO/NO-GO; resolve open questions"`

### Task 5.2: Disposition

- [ ] **Step 1:** **GO** → keep `apps/front-2-spike` as reference until Phase 1 scaffolds the real `apps/front-2`, then delete. **NO-GO** → delete it + record why. Keep `e2e-contract/` regardless (reused by Phase 1+; it's the parity contract).
- [ ] **Step 2: Commit** the deletion or retention note.

---

## Self-review (against the strategy spec + Codex findings)

**Spec coverage:** §4.1 single-source-of-truth → Architecture gate + Tasks 2.1/2.4/2.6 (direct Kiota, no BFF) ✔ · §10 deployed runtime contract → 3.2 (+ API/DB/Toxiproxy) ✔ · §10 hard slice → 2.1–2.7 ✔ · §11 parity-as-contract → Group 4 shared two-project suite (core invariants now; tail deferred, recorded) ✔ · §13 table-parity (top UI risk) → 2.6 prove-or-NO-GO ✔ · §13 CSP/RTL/supply-chain/bundle → 4.5/4.6/1.2/5.1 ✔ · §18 open questions → 2.0 + 5.1 ✔.

**Findings map:** #1→Architecture gate+2.1/2.4/2.6 · #2→4.4 isolation · #3→4.5 CSP-blocking · #4→4.5 security · #5→Group 4 shared contract · #6→Task 2.0 · #7→4.6 error-paths · #8→4.4 auth-matrix · #9→2.5 error boundary + 4.2/4.4 403 specs · #10→2.3 cookie-locale+fallback · #11→4.6 RTL smoke+deferred · #12→2.6 TanStack Table+states+virtualization · #13→4.3 priming no-refetch · #14→3.2 root context · #15→0.2 curl + 1.1 pinned SHA · #16→1.2 semver pin-assert · #17→2.2 expiry-from-API+clear-variants · #18→4.6 dialog deployed · #19→4.6 dark-mode combos · #20→4.3 slow-network · #21→invalidation DEFERRED (4.2) + §11 tail deferred (5.1) · #22→3.1 nonce name+property · #23→2.2 pure session-cookie split · #24→4.1 auto-fail fixture · #25→0.1 license NO-GO-for-Phase-1 · #26→4.1 readiness + 3.2 healthcheck · #27→5.1 gzip/brotli budgets · #28→2.1 redaction tests.

**Placeholder scan:** investigative steps (1.4 VFR, 2.0 probes, 2.6 virtualization, 3.1 style-src) are "implement verified approach → acceptance test → record finding" with concrete verify + findings output — not TBDs.

**R3 reconciliation applied:** direct-Kiota SSR query split — shared `staffUsersKey` + `staffUsersBrowserQuery`/`staffUsersServerQueryOptions` (2.4) + `createServerClientFromCookie` (2.1/2.6); full clearSession matrix (2.2); error boundary 401/403/tenant-suspended (2.5); public/server API-base split + runtime `window.__ENV__` (2.1/2.5/3.2/Prereqs/Turbo); `session-cookie-client` browser reader module (2.2); exact route id from `routeTree.gen.ts` (2.6); HTTP-aware (not Toxiproxy) priming counter (4.3); invalidation deferred to Phase 1 (4.2/5.1).

**R4 reconciliation applied:** concrete dependency-free `request-counter` HTTP sidecar (`/__counter/reset` + `/__counter?path=`) replaces the hand-waved "API request log"; consumed by the no-refetch proof (3.2 Step 2b + 4.3 Step 3). `getSessionTokensFromCookieHeader(cookieHeader)` (full-`Cookie`-header parser) added to the pure `session-cookie.ts` and used by `createServerClientFromCookie` (2.1) + the session gate (2.5) instead of feeding a raw header to `parseSessionCookie`. The 401 path is split: missing/invalid token → `beforeLoad` `redirect()` (2.5 Step 1); runtime 401 in the `errorComponent` → effect-driven `<LogoutRedirect/>` (no illegal thrown redirect, 2.5 Step 2).

**Type/name consistency:** `buildCustomFetch`/`createClient({base})`/`createServerClientFromCookie` (2.1) used by 2.2/2.4/2.6; pure `parseSessionCookie`/`formatSessionCookie`/`getSessionTokensFromCookieHeader` (2.2 `src/lib/session-cookie.ts`) imported by tests + `session-cookie-client.ts` + `session.server.ts` + `createServerClientFromCookie`; `getSessionTokensFromClient` (`session-cookie-client`, 2.2) used by 2.4; `staffUsersKey`/`staffUsersBrowserQuery`/`staffUsersServerQueryOptions` (2.4) consumed by 2.6; `/_auth-echo` route (1.4) used by 4.4; header keys imported from `@org/shared-ts`, never hardcoded.

**Total tasks:** 25 (0.1–0.2, 1.1–1.5, 2.0–2.7, 3.1–3.2, 4.1–4.6, 5.1–5.2).
