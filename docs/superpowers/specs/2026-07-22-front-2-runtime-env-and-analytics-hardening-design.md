# front-2 Runtime Env Consolidation + Analytics Observability Hardening — Design

**Date:** 2026-07-22
**Surface:** `apps/front-2` (React Router v7 SSR app) + `packages/shared-ts/lib/analytics`
**Status:** Approved design → implementation.

**Goal (two connected concerns, one PR):**
1. **Env consolidation** — replace front-2's scattered per-var env accessor functions with a single schema-driven "define once, used everywhere" registry that classifies each variable as `public` or `server-only`, where that one classification drives BOTH the client read AND the server `__ENV__` injection — making the "read on client but forgotten in server injection" bug (which currently affects the PostHog token) structurally impossible.
2. **Analytics observability hardening** — stop capturing scanner-noise `404` bad-responses into analytics and logs; keep `5xx` loud; and fix the per-event "Analytics not initialized" log spam.

**Non-goals / explicitly cut (YAGNI — do NOT build):** a Proxy-based env; decorators/class descriptors; a runtime config endpoint; per-request/tenant/host config; codegen; a custom lint rule; deep-freezing; arbitrary schema passthrough; a generic config framework. A small structural registry, two accessors, one serializer, and a browser guard are sufficient.

---

## Background — why front-2 diverges from old-front (do not "fix" by copying old-front)

`apps/front` (old-front) reads `import.meta.env.VITE_*`, which Vite **statically inlines at build time**, so it can eagerly parse and `export const env`. `apps/front-2` reads configuration at **RUNTIME** from `process.env` (server) and an injected `window.__ENV__` (client) — deliberately, so one Docker image runs in any environment without a rebuild (12-factor). Copying old-front's build-time inlining would be a regression. Therefore front-2 keeps runtime reads; this design only consolidates the *ergonomics* and *anti-drift*, not the read mechanism.

**Hard constraints (must not break):**
1. Runtime read on both realms: server `process.env`, client `window.__ENV__`. No `import.meta.env` inlining.
2. **Importing the env module must NOT throw.** Validation is deferred to point-of-use.
3. Server-only vars are a **security boundary** — never read on nor injected to the client. `getServerEnv()` in a browser must throw before consulting `process.env`.
4. Required vs optional differ per var: `PUBLIC_API_BASE_URL` and `SERVER_API_BASE_URL` are required (throw when missing); the PostHog token is optional (returns `undefined`; analytics is best-effort).
5. `NODE_ENV` helpers (`isDevelopmentRuntime`, `isProductionRuntime`) stay available.

---

## Part 1 — Env consolidation (`apps/front-2/src/lib/env.ts`)

### 1.1 The registry (single source of truth)

Replace the ad-hoc `publicApiBaseUrlSchema` / `serverApiBaseUrlSchema` + per-var getters with ONE structural registry. **The containing section (`public` vs `server`) IS the security classification** — a field cannot exist without being placed under one.

```ts
const requiredTrimmedString = z.string().trim().min(1);
const optionalTrimmedString = z.string().trim().min(1).optional();

const envDefinition = {
  public: {
    apiBaseUrl: {
      wireKey: 'PUBLIC_API_BASE_URL',
      processKeys: ['PUBLIC_API_BASE_URL'],
      schema: requiredTrimmedString,
    },
    posthogProjectToken: {
      wireKey: 'PUBLIC_POSTHOG_PROJECT_TOKEN',
      processKeys: [
        'PUBLIC_POSTHOG_PROJECT_TOKEN',      // canonical (first-precedence)
        'POSTHOG_PROJECT_TOKEN',             // temporary server-side compatibility alias
      ],
      schema: optionalTrimmedString,
    },
  },
  server: {
    apiBaseUrl: {
      processKeys: ['SERVER_API_BASE_URL'],
      schema: requiredTrimmedString,
    },
    nodeEnv: {
      processKeys: ['NODE_ENV'],
      schema: optionalTrimmedString,
    },
  },
} as const satisfies EnvDefinition;
```

- **Logical property names** are camelCase (`apiBaseUrl`, `posthogProjectToken`); **wire keys** are the `PUBLIC_*` env var names.
- Only `public` entries carry a `wireKey` (they are the ones injected into `__ENV__`). `server` entries have none — they are never serialized.
- The PostHog alias `POSTHOG_PROJECT_TOKEN` is resolved **server-side only**, canonical-first; the client always receives the canonical `PUBLIC_POSTHOG_PROJECT_TOKEN` wire key. Document the precedence in a comment. The alias is temporary; do NOT promote it to a second public field.

### 1.2 Derived types (no hand-maintained duplicate lists)

```ts
type PublicName = keyof typeof envDefinition.public;
type PublicWireKey = (typeof envDefinition.public)[PublicName]['wireKey'];
export type PublicEnv = /* output object: { apiBaseUrl: string; posthogProjectToken?: string } */;
export type ServerEnv = /* { apiBaseUrl: string; nodeEnv?: string } */;

// This REPLACES the hand-written RuntimePublicEnv in env.d.ts:
export type RuntimePublicEnv = Partial<{
  [Name in PublicName as (typeof envDefinition.public)[Name]['wireKey']]: string;
}>;
```

`apps/front-2/src/env.d.ts` must import `RuntimePublicEnv` from the env module instead of re-declaring it, so the `window.__ENV__` shape is derived from the same registry (its comment "Reserved runtime public-env injection contract for later migration" is now realized — update it).

### 1.3 Accessors (memoized scope accessors — the chosen shape)

```ts
let publicMemo: Readonly<PublicEnv> | undefined;
let serverMemo: Readonly<ServerEnv> | undefined;

export const getPublicEnv = (): Readonly<PublicEnv> =>
  (publicMemo ??= Object.freeze(parsePublicEnv()));   // reads __ENV__ (browser) OR allowlisted process.env (server)

export const getServerEnv = (): Readonly<ServerEnv> => {
  if (isBrowser()) throw new Error('getServerEnv() must not be called in the browser');
  return (serverMemo ??= Object.freeze(parseServerEnv()));  // allowlisted process.env only
};
```

- **Memoize only successful parses** — `??=` means a thrown parse does not complete the assignment, so a later call retries once the value is present. Do not cache failures.
- **Source adapters** (do NOT spread `process.env`; read only allowlisted keys from the registry):
  - Public, browser realm: read each public field's `wireKey` from `window.__ENV__` ONLY (no `process.env` fallback in the browser).
  - Public, server realm: read each public field's `processKeys` (canonical-first) from `process.env`.
  - Server-only: read each server field's `processKeys` from `process.env`.
- **Required-missing throws at call time**, not import time (constraint #2). Keep the existing helpful error message shape (`failed to validate <label>: <first issue>`).
- Shallow-freeze returned objects (no deep-freeze).

### 1.4 Serializer owns injection (anti-drift core)

Move injection payload construction OUT of `server.ts` and into the env module:

```ts
export const serializePublicRuntimeEnv = (): string => {
  const values = getPublicEnv();                       // throws if required PUBLIC_API_BASE_URL missing
  const wirePayload = toWirePayload(envDefinition.public, values);  // iterate registry → { wireKey: value }, omit undefined optionals
  return JSON.stringify(wirePayload).replace(/</g, '\\u003c');       // keep existing < escaping
};
```

- `toWirePayload` iterates ONLY `envDefinition.public`, maps each logical value to its `wireKey`, and omits `undefined` optionals (so absent PostHog is not emitted). It must NOT take an independently-maintained key array.
- **Required-missing throws** here too (do NOT silently return `undefined` and produce a reduced CSP/injection — that only delays the failure to browser API use).
- `server.ts`'s `resolvePublicApiBaseUrlEnv()` is replaced by a call to `serializePublicRuntimeEnv()`. The server no longer names individual public vars. Keep the existing escaped CSP `nonce` and the `renderPublicEnvScript` shape (`window.__ENV__ = Object.assign({}, window.__ENV__, <payload>)`). U+2028/U+2029 escaping is optional (harmless, not required).

Resulting invariant:
```
one public registry entry
   ├── browser reader knows its __ENV__ wireKey
   └── server serializer injects that same wireKey  ← cannot be forgotten
```

### 1.5 `NODE_ENV` helpers

Keep `isDevelopmentRuntime()` / `isProductionRuntime()` as thin wrappers over `getServerEnv().nodeEnv` (or a direct process read) — `NODE_ENV` stays **server-only** given all current call sites are server-side (`session-cookie-utils.ts`, `server.ts`, and analytics which runs server-side for bad-response capture). Do NOT expose `NODE_ENV` to the browser. If a browser feature ever needs deployment mode, add an explicit public app-mode var instead.

### 1.6 `server.mjs` startup validation (close the "defined once" gap)

`apps/front-2/server.mjs` currently maintains its OWN required-variable list. Export a `validateRuntimeEnv()` from the built server handler (invokes `getServerEnv()` + `getPublicEnv()` to force validation) and have `server.mjs` call it before accepting traffic, then delete its duplicate list. Importing the built handler stays safe because parsing is lazy — validation happens through the explicit call. (If wiring `validateRuntimeEnv` through the build output proves out of scope, at minimum leave a `TODO` and do NOT silently keep two divergent lists; flag it.)

### 1.7 Call-site migration

| File | Old | New |
|---|---|---|
| `api-client/client-manager.ts` (SSR path) | `getServerApiBaseUrl()` | `getServerEnv().apiBaseUrl` |
| `api-client/client-manager.ts` (browser path) | `getPublicApiBaseUrl()` | `getPublicEnv().apiBaseUrl` |
| `lib/analytics.ts` | `getPosthogProjectToken()` | `getPublicEnv().posthogProjectToken` — **called inside lazy init, not module scope** (see 1.8) |
| `server.ts` | `getOptionalPublicApiBaseUrl()` (injection) | `serializePublicRuntimeEnv()` |
| `server/csp.ts` | `getOptionalPublicApiBaseUrl()` | `getPublicEnv().apiBaseUrl` |
| `server/session-cookie-utils.ts` | `isProductionRuntime()` | unchanged |
| `server.ts` (CSP dev flag) | `isDevelopmentRuntime()` | unchanged |

Remove the now-dead exports (`getPublicApiBaseUrl`, `getOptionalPublicApiBaseUrl`, `getServerApiBaseUrl`, `getPosthogProjectToken`). If `getOptionalPublicApiBaseUrl`'s "optional" semantics were relied on by CSP to degrade gracefully, that behavior INTENTIONALLY changes: `PUBLIC_API_BASE_URL` is required, so its absence now fails validation rather than silently producing a reduced CSP (see 3. Testing — the CSP no-origin test must be updated to expect a throw).

### 1.8 The module-scope construction bug (must fix)

`apps/front-2/src/lib/analytics.ts:82` currently does `const analyticsClient = new IsoAnalytics(getPosthogApiKey() ?? '')` at **module scope**. With the new accessors this would eagerly evaluate env during import of the server graph. Make the client construction (and token read) **lazy** — construct on first `initializeAnalytics()` call, reading `getPublicEnv().posthogProjectToken` at that point. This also naturally fixes the client-side PostHog gap: the token now flows through `__ENV__` and is read via `getPublicEnv()`.

---

## Part 2 — Analytics observability hardening

### 2.1 Bad-response capture policy (`apps/front-2/src/lib/analytics.ts` `captureBadRequest` + `server.ts` `sendBadResponseCapture`)

Today `sendBadResponseCapture` fires `captureBadRequest` on EVERY non-2xx SSR response, and `captureBadRequest` only filters on "is non-2xx" + "is production". Production logs show **1,665 captures, all `404`**, ~1,016 of them `.php` scanner probes (`/wp-load.php`, `/xmlrpc.php`, …) — ~66% of the container log, all unactionable scanner noise, each also emitting a warn (see 2.2).

Introduce a **status-class policy** (implement as a small helper, e.g. `classifyBadResponse(status)`), applied in `captureBadRequest` (the analytics decision) and reflected in logging:

- **`404` → DROP entirely.** No analytics event, no log line (not even `debug`). On a public SSR site, unmatched paths are overwhelmingly scanners/crawlers; capturing them poisons the `bad_request` metric and costs PostHog ingest. This is the primary noise source.
- **`>= 500` → CAPTURE + log at `error`.** A 5xx is the server actually failing — the core reason bad-response observability exists. Today the confirmation log is `debug`; a real server error deserves `error` level.
- **Other `4xx` (400/401/403/422 etc.) → CAPTURE + `debug` log** (current behavior), OR sample — keep simple: capture at `debug`. (Sampling is optional; do not build a sampler unless trivial.)

Keep the existing production-only guard, the IP hashing (`getRequestAddress`), and the `bad_request` event name/properties. The change is purely the **which-statuses** decision + log levels. The early `404` return should happen BEFORE `initializeAnalytics()` so no analytics init/warn is triggered for scanner noise.

**Optional (do NOT build for v1, note as follow-up):** a narrow same-origin exception that still captures a `404` when the request carries an internal `Referer` from the app's own origin (catches genuine broken internal links). Left out for v1.

### 2.2 "Analytics not initialized" per-event warn → once-only (`packages/shared-ts/lib/analytics/iso-analytics.ts`)

`iso-analytics.ts` logs `logger.warn('Analytics not initialized, skipping ...')` on EVERY `capture` / `identify` / `captureException` when uninitialized — 1,664× in the sample log. Make this a **once-per-process** warning (guard with an instance/module boolean so it warns the first time and stays silent after), for all three call sites (lines ~103, ~136, ~178). This is shared by old-front too; the change is a strict improvement (less spam) with no behavior change beyond log volume. Keep the warn informative (mention it will not repeat).

> Note the interaction: `initializeAnalytics()` sets `analyticsClient.logOnly = true` when there is no token, yet `capture()` still warns "not initialized". After Part 1 fixes the client token gap and Part 2.1 drops 404s, the remaining warns should be near-zero in a correctly-configured deploy — but the once-only guard is still correct defense against any misconfiguration spam.

---

## Testing (all must pass; front-2 FULL suite, not just typecheck)

**`apps/front-2/src/lib/env.test.ts`** — memoization makes the current static-import + `process.env` mutation order-dependent. Switch to `vi.resetModules()` + **dynamic `import()`** of the env module after arranging each runtime source. Do NOT add a production `resetEnvForTests()` export. Cases:
- Importing the env module with all vars absent does NOT throw.
- Missing required public config throws only when `getPublicEnv()` is called.
- Missing server config does not affect importing or reading the public scope.
- A failed parse is not memoized — setting the value lets a later call succeed.
- Browser public values come from `__ENV__`, not a `process.env` fallback.
- Server public values come from `process.env`.
- `getServerEnv()` in a browser throws before reading server vars.
- Returned objects are frozen; repeated calls return the same identity.
- PostHog read from browser `__ENV__`; from canonical server var; from the temporary alias (canonical wins when both set); absent → `undefined`.
- Serialized payload contains API URL and PostHog when present; omits optional PostHog when absent; NEVER contains `SERVER_API_BASE_URL` or `NODE_ENV`; `</script>`/`<` remain escaped.

**`apps/front-2/src/server.test.ts`** — keep server responsibilities (payload placement, nonce, missing `</head>`, escaping). Add **at least one unmocked contract test** that connects the real `serializePublicRuntimeEnv()` to `renderPublicEnvScript`, so mocks can't hide future drift. Assert the env `<script>` precedes the client bootstrap script in final HTML (ordering invariant for `__ENV__` availability before hydration).

**CSP test** — the case that currently accepts "no API origin" must be updated: with `PUBLIC_API_BASE_URL` required, absence now throws rather than silently producing a reduced policy.

**Analytics tests** — add/adjust: `404` produces NO capture and NO log; `>=500` captures + logs at `error`; other `4xx` captures at `debug`; the once-only "not initialized" warn fires once across multiple capture calls.

---

## Verification floor (implementer must paste real output)
- `pnpm --filter front-2 typecheck` → 0
- `pnpm --filter front-2 test` → GREEN (full suite incl. `env.test.ts`, `server.test.ts`, analytics tests, `i18n-key-coverage.test.ts`, `i18n.namespaces.test.ts`). Run the FULL suite after ANY front-2 edit (coverage test regex-scans comments too).
- `pnpm --filter front-2 build` → GREEN
- shared-ts: `pnpm --filter @org/shared-ts typecheck` (or the repo's shared-ts gate) → 0; and run any shared-ts analytics tests.
- `npx oxlint <changed files>` → 0 ; `pnpm --filter front-2 check:design-system` → 0 (if touched)
- `git grep -n 'getPosthogProjectToken\|getPublicApiBaseUrl\|getOptionalPublicApiBaseUrl\|getServerApiBaseUrl' -- apps/front-2` → only intended remaining references (dead getters removed).

## Out of scope / follow-ups
- Same-origin `404` broken-link exception (2.1 optional).
- Old-front (`apps/front`) bad-response policy parity (if it still serves traffic) — the deployed `publyapp-front` container runs front-2, so front-2 is the priority.
- Wiring `validateRuntimeEnv()` fully through the build output if it proves larger than expected (flag, don't half-do).
