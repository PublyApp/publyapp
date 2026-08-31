# Implementation plan — #487: route query preloading (`staticData.preload`)

**Type**: record `plan` (written once, superseded rather than retro-edited). **Issue**: #487.
**Technical predecessor**: open issue #1527 (client loader for profile detail) — its rule "no second fetch path by construction" is constraint #3 of this plan. The owner arbitration of 2026-08-26 (issue comment) is authoritative and applied as-is: `staticData.preload` per route, silent preloading failure, mandatory guard on the real artifact, explicit articulation with `staleTime` and client loaders, quantified measurement.

## 0. State of the art, verified on `origin/develop` = `198a6e4b7`

Each assertion is proven in `.dump/citations-r1.md` (PASS/FAIL per line, outputs pasted).

1. `apps/front/src/router.tsx:176`: `defaultPreload: 'intent'`. The router therefore already preloads the route **component** on `<Link>` hover; its data leaves on mount. The JS gain is consumed, the network gain is not.
2. Zero `ensureQueryData` / `prefetchQuery` / `clientLoader` in `apps/front/src/` (`git grep` counts = 0). Issue #1527 is **open, not merged**: its client loader is not in this tree. This plan articulates with it (§5), it does not assume it merged.
3. The 3 route files declaring a `loader:` (`verify-email.tsx`, `accept-invitation.tsx`, `reset-password.tsx`) are SSR surfaces whose loaders call actions imported from `~/lib/server/*` (e.g. `checkEmailVerificationToken` in `auth-actions.ts`), these actions themselves being defined via `createServerFn` (not called directly in the route file): out of TanStack Query scope, untouched by this plan.
4. The co-localized mechanism exists: each route extends `StaticDataRouteOption` (`breadcrumbs.ts:75`, `i18n.namespaces.ts:35`) and declares `staticData.crumbs` next to its component (`$profileId.tsx:219-226`). `staticData.preload` follows exactly the same shape.
5. Data passes through shared factories `{ queryKey(vars), fetcher(vars) }` (`buildStaffQueryOptions`, `create-hooks.ts:415`) that pages consume via their hooks (`useStaffProfilesQuery` in `staff-profiles.ts:525`, `useStaffTenantDetailsQuery` in `staff-tenants.ts:559`) and that crumbs already reuse (`staffTenantCrumbQuery`, `staffTenantProfileCrumbQuery`). A preload pointing at these same factories is deduplicated by TanStack Query per key: it cannot become a second fetch path.

## 0b. Assumed deviation from #487 (silent deviation corrected)

Of the 12 acceptance criteria of issue #487, four are **modified or abandoned** in this plan. They were not in r1; the r2 re-read (verdict `CHANGES_REQUIRED`) decided: an unnamed scope deviation is a defect. Each is here assumed, justified, and tracked by a `follow-up lv1` issue cited. The PR body recaps this summary (see `.dump/pr-body.md`). The plan remains faithful to the owner arbitration of 2026-08-26, which takes precedence over the initial form of the issue.

| # | #487 criterion abandoned/modified | Form retained here | Why (decided) | Follow-up |
|---|---|---|---|---|
| 1 | Imperative helper `routeQueries(...)` + `criticalRouteQuery`/`secondaryRouteQuery`/`interactionRouteQuery`/`blockingRouteQuery` (Slice 1) | Declarative `staticData.preload` co-localized with `staticData.crumbs` (§1) | The arbitration imposes `staticData.preload` per route as the single surface; an imperative helper is a second API and a second registry. The declarative form reuses the `crumbs` mechanism and shared factories (rule "no second fetch path" of #1527). | #1588 |
| 2 | Oxlint rule `publy/route-query-preload` tested, escape comments, started as warning (Slice 5) | **Absent** from the plan; replaced by the vitest contract guard §4 on the REAL artifact | The §4 guard confronts preloaded keys with keys actually consumed by the page (impossible to do by a form rule on source alone). The Oxlint rule remains useful as a cheap pre-guard; it is tracked separately. | #1589 |
| 3 | Pilot on the authenticated layout `authed/_layout/authed-layout.tsx` (Slice 3) | Pilots `authed/staff/tenants/$tenantId.tsx` (T2) + `authed/staff/profiles.tsx` (T4) | The single hook `usePreloadIntentQueries()` (§1.1) ALREADY covers the intent-preload of the auth layout globally; a layout pilot would duplicate the mechanism. The two retained pilots exercise the hard cases (derived parameter `$tenantId`, default URL variables) and become the first routes covered by the guard (§10). | #1590 |
| 4 | Dedicated doc `docs/guides/frontend-route-query-preloading.md` (Slice 2) | Folded into the "Route query preloading (#487)" sub-section of `docs/guides/front/conventions.md` (T5) | `conventions.md` is the enforced source of truth of front standards (design-system/lint guards); holding the contract there avoids a drifting doc. A narrative companion guide may be added later. | #1591 |

None of the four is a regression of the owner arbitration: all mandatory points (preload per route, silent failure, guard on real artifact, `staleTime`/loader articulation, quantified measurement) are fully delivered. Criteria 1, 2, 3, 4 of the issue are either reformulated (1, 3, 4) or moved to follow-up (2); the rest of the 12 criteria are unchanged.

## 1. Retained form: `staticData.preload` declared per route

```ts
export const Route = createFileRoute(...)({
    staticData: {
        crumbs: staffTenantProfileCrumbsBase,            // already there (#973/#1033)
        preload: ({ params }) => [                       // new, same mechanism
            { options: staffTenantDetailsQueryOptions, variables: { tenantId: params.tenantId } },
            { options: staffTenantProfileDetailsQueryOptions, variables: { tenantId: params.tenantId, profileId: params.profileId } },
        ],
    },
});
```

No central registry. A route without preloading does not add the key. The value is an array of `{ options, variables }` entries where `options` is an exported factory from `lib/query/*` — never a `{ queryKey, queryFn }` literal written inline in the route: writing a literal would create the second fetch path the guard tracks (§4).

### 1.1 Who executes the preload (explicitly decided)

The `staticData` field is a house extension (`declare module '@tanstack/react-router' { interface StaticDataRouteOption { … } }`), not a router option: something must read this field at the moment of intent preload. Two candidates were decided:

* **Retained — single branching hook**: `usePreloadIntentQueries()` in `apps/front/src/lib/query/preload-intent.ts`. Mounted ONCE in the CSR authenticated shell (`apps/front/src/components/app-shell/app-shell.tsx`, the location already hosting the shell's global effects). **CSR mount only**: the authenticated shell is `ssr: false` (`docs/guides/front/conventions.md`, l.281 — "Authenticated application surfaces are CSR with `ssr: false`"); the hook must further be wrapped by the repo's CSR primitive `createClientOnlyFn` (from `@tanstack/react-start`, already used in `routes/__root.tsx` l.14) so that an accidental mount in a universal shell never runs the effect server-side — `isServer` not being a direct export consumed by the front (which rather exposes the local function `isServerRuntime()` in `lib/api-client/client-manager.ts`). It subscribes to the router via `router.subscribe('onBeforeLoad', …)` and, for each `staticData.preload` entry of the destination, first resolves the matches itself: the `NavigationEventInfo` event **does not** carry `matches` (form verified in the lockfile, `@tanstack/router-core@1.171.26/dist/esm/router.d.ts` l.419-426: `{ fromLocation?, toLocation, pathChanged, hrefChanged, hashChanged }`). The hook therefore calls `router.matchRoute(event.toLocation)` then walks the resolved matches to read each `staticData.preload`. Verified foundation in the same file: `RouterEvents` exposes `onBeforeLoad` (l.430) and `SubscribeFn` returns an unsubscribe function (l.452), and `Router` exposes `matchRoute: MatchRouteFn` (l.750).
  Why here and not elsewhere: it is the only point that captures ALL intent preload (hover AND viewport AND navigation) without modifying each route or depending on an option nonexistent in this router version.
* **Rejected — shared loader added to each route**: a per-route `loader` doing the same work. Rejected because it duplicates the mechanism 60 times, confuses itself with the future client loader sanctioned by #1527 (which MUST block), and turns a declarative declaration into repeated plumbing.
* **Rejected — `beforeLoad({ cause })`**: also runs for `cause: 'preload'`, but adds an async phase to each route's lifecycle for a global need, and mixes "declare" and "execute" whereas the owner decision wants the declaration alone in the route.

The hook silently ignores any error (§2). It does nothing when `event` originates from an already-satisfied preload: `ensureQueryData` is idempotent per fresh key (staleTime, §6).

### 1.2 Types

Extension in a new typed module (same pattern as `breadcrumbs.ts`):

```ts
// apps/front/src/lib/navigation/route-preload.ts
import type { QueryKey } from '@tanstack/react-query';

// Shared-factory shape produced by `buildStaffQueryOptions` (packages/shared-ts
// create-hooks.ts:415): `{ queryKey(vars), fetcher(vars) }`. The entry couples a
// `options` factory (defaulted to `any` variables so ANY concrete factory fits)
// with the `variables` it is called with. This is the SAME shape the page body
// and the crumbs already consume — so a `preload` entry cannot introduce a
// second fetch path (§4, first guard tier).
export type RoutePreloadFactory<
    TVariables extends Record<string, unknown> = Record<string, unknown>,
> = {
    queryKey: (variables: TVariables) => QueryKey;
    fetcher: (variables: TVariables) => Promise<unknown>;
};

export type RoutePreloadEntry = {
    options: RoutePreloadFactory<any>;
    variables: Record<string, unknown>;
};

// The generic lives on the FUNCTION: `preload` is `(args) => readonly
// RoutePreloadEntry[]`, NOT `RoutePreloadEntry<never>[]`. Freezing the entry to
// `never` (r1 draft) made `variables: never` and every `variables: { tenantId }`
// literal a type error — the §1 / T2 example would not compile. Here the
// function returns a plain `readonly RoutePreloadEntry[]`; each literal entry's
// `options` is checked against the factory *shape* and its `variables` flows
// through. Verified to compile against the real `staffTenantDetailsQueryOptions`
// / `staffTenantProfileDetailsQueryOptions` factories (proof in `.dump/citations-r2.md`, B1).
export type RoutePreload = (args: {
    params: Record<string, string>;
}) => readonly RoutePreloadEntry[];

// declaration merging:
declare module '@tanstack/react-router' {
    interface StaticDataRouteOption {
        preload?: RoutePreload;
    }
}
```

The shape constraint (`options.queryKey` + `options.fetcher`, both `(variables) => …`) makes it IMPOSSIBLE to compile an entry that does not come from a shared factory: TypeScript rejects an ad hoc literal that does not carry exactly these factory-signed members. This is the first tier of the guard (§4). The exact `variables ↔ factory` coupling (type of `tenantId` derived from the precise factory) is NOT statically carried here — it is dynamically verified by the T3 guard (§4) which reads the concrete key `options.queryKey(variables)` and confronts it with the keys consumed by the page.

## 2. Preloading failure: silent, nothing on screen (arbitration applied)

* `ensureQueryData` is invoked under `.catch(() => undefined)` on the hook side: no toast, no error state, no log entry at error level. Reason: a preload is speculative; the user may never have clicked. The real query will leave on mount and it is the one that will say its cause via `QueryDisplay` if it fails in turn. The rule "every failure says its cause" applies to the query the user expects, not to an attempt they ignore.
* Non-negotiable consequence: a preloading failure does NOT mark the entry as loaded. TanStack Query handles this alone (a rejected promise does not feed data into the cache); the plan explicitly forbids any code that would turn the failure into data (no synthetic `data: null`, no "already attempted" flag).
* The centralized 401→logout backstop (`handleAuthedQueryError`, `router.tsx:104`) must NOT trigger from an aborted preload: the plan verifies this behavior in task T3 (dedicated test case: 401 preload on an expired session during hover does NOT logout, since the mount query will do its job).

## 3. Articulation decided with client loaders (§Rendering Strategy)

State: the conventions (`docs/guides/front/conventions.md`, §Rendering Strategy, line 277) do not yet allow a client loader; issue #1527 proposes the first exception (profile detail, `await ensureQueryData` BEFORE first render, paired with a `pendingComponent`).

Decided in this plan, the two mechanisms are complementary and their boundary is:

* **`staticData.preload` = speculative, non-blocking, always silent.** Triggered by an intention (hover). Never participates in the current page's render.
* **client loader (#1527) = mandatory, blocking, paired with `pendingComponent`.** Resolves a render requirement ("these data must be in cache before the first paint", e.g. crumb names). A route can have BOTH: the `staticData.preload` warms early on hover; if the user clicks despite a preloading failure, the client loader re-fires and blocks properly behind its `pendingComponent`.
* Same factory, two temporalities. No route must carry a client loader that duplicates a `preload` entry for the same data WITHOUT a documented blocking reason; the legitimate case (crumbs before paint) is #1527's and remains its sole sanction until merge then conventions review.

## 4. Mandatory guard — on the REAL artifact

**Defect to detect**: a route whose `staticData.preload` references query options the page body does not use. This is a second fetch path installed — exactly what #1527 avoided by construction by reusing the same factories. A guard that checks a form instead of content is an installed false negative; this one checks content.

**Subjection: the real artifact**, not a model:

* Source of truth #1: the REAL generated tree `apps/front/src/routeTree.gen.ts` imported in the test (same choice as the crumbs contract, `breadcrumb-contract.test.tsx:20-33`: "walks the REAL generated route tree … does not construct a fixture route tree and does not regex-scan source"), with the same emptiness self-check (counts must diverge if the walk visits 0 routes).
* Source of truth #2: the REAL route module dynamically imported (`import('~/routes/…/$route')`) — we read `Route.options.staticData.preload` executed on the real path's params, then inspect the route file and its page hook.

**Guard algorithm** (new vitest spec `apps/front/src/lib/navigation/preload-contract.test.tsx`, pinned like the crumbs contract):

1. Walk `routeTree.gen`; collect each route whose `staticData.preload` exists.
2. For each, import the real route file, execute `preload({ params: <path params> })`, recover the concrete keys `options.queryKey(variables)` (values, not symbols).
3. Collect the keys used by the PAGE: import the page's state hook module (repo convention: co-localized `_use-*-state.ts` or inline hook of the route file; for routes without a dedicated hook, the route file body itself) and intercept the `useQuery`/`useSuspenseQuery` mounted during a test render of the page with its real factories (proven technique in `$profileId.test.tsx`: mocks aligned on the real contract `{queryKey(vars), fetcher(vars)}` of the factories).
4. Fail if a preloaded key does not appear in the consumed keys (message naming `file:routeId` + the orphan key + the faulty factory). Assumed tolerance: a preloaded key consumed only by a direct child systematically mounted by this page (index tab, root drawer) counts as consumed — the list of accepted children is declared in the test, not guessed.
5. **Known limit (adversarial mutation — "wrong factory, right key")**: the guard confronts ONLY the concrete key `options.queryKey(variables)`; it does NOT identify the factory by its module identity. A `preload` entry could point at a *different* factory that, by chance, computes the *same* key with a different `fetcher` — the guard would let it pass (factory false negative, not key). Mitigations (plan-level, to be handled in T1/T3 of the implementation, not blocking for THIS plan): (a) tighten the §1.2 type to require the factory to come from `lib/query/*` via a "branded" nominal type; (b) have the guard read the module path of the preloaded factory and require it to be the SAME module the page imports. The T1 unit test does not short-circuit this mutation (it mocks the router, not factory uniqueness); a dedicated test case "different factory, identical key → guard RED (or tolerated by documented escape marker)" must accompany it.

**Execution scope**: existing front vitest suite (`pnpm --filter front test`), no new tool. The guard is red-by-default for any NEW incorrect `preload` entry from task T4; the T2/T3 pilots must pass it green.

## 5. Articulation decided with #1527 (open, not merged)

* This plan does NOT edit the profile detail route code as long as #1527 is open: its pilot task bears on `$tenantId.tsx` (tenant detail) and `profiles.tsx` (profiles list), with no code file overlap with #1527 except `docs/guides/front/conventions.md` (see §8 assumed conflict).
* At #1527's merge: its client loader remains the blocking path; the profile detail `preload` entries are added in a separate follow-up task (T7), after rebase, keeping both mechanisms on the same factories (no key collision possible: same `variables`, same factories, therefore same cache key).

## 6. Articulation decided with `DEFAULT_QUERY_STALE_TIME_MS` (30 s, `router.tsx:27`)

* On link hover, `ensureQueryData` does NOT refetch fresh data (< 30 s): preloading is therefore free on fast round-trips (list ↔ detail) and never doubles the query the mount will make (dedup by identical key, shared factories).
* After 30 s of staleness, the hover refetches in the background: wanted. This is exactly the "fresh enough" semantics the staleTime already encodes for tab refocus; preloading inherits the same policy rather than inventing a third.
- Factories that set their own `staleTime` (`auth.ts:106`: `Infinity`, `needs-reconnect-accounts.ts:82`: `Infinity`, `staff-tenants.ts:569` and `tenant-posts.ts:223`: `30_000`) keep their value: `ensureQueryData` reads options PER query, the behavior stays consistent without additional configuration.
- Forbidden by this plan: overriding `staleTime`/`gcTime` at the preloading entry level. A preload entry is just a (factory, variables) pair — no fresh cache option. Any exception must be decided in a future record, not absorbed here.

## 7. Tasks (reduced, each deliverable and testable alone)

Exact paths. No TBD, no "appropriate error handling". Each task ends green on its named gates before the next.

### T1 — Types + branching hook
* Files created: `apps/front/src/lib/navigation/route-preload.ts` (types §1.2 + `declare module '@tanstack/react-router' { interface StaticDataRouteOption { preload?: RoutePreload } }`), `apps/front/src/lib/query/preload-intent.ts` (`usePreloadIntentQueries()`, `onBeforeLoad` subscription, `.catch(() => undefined)` silent, §1.1).
* File modified: `apps/front/src/components/app-shell/app-shell.tsx` (hook mount, 1 line).
* Tests: `apps/front/src/lib/query/preload-intent.test.tsx` — (a) simulated hover → `ensureQueryData` called once per entry with the factory's exact key; (b) already-fresh entry → zero network calls (mocked fetcher that would count 2); (c) promise rejection → no toast/log/error, no state mutated; (d) 401 on preload → `triggerSessionInvalidated` NOT called; (e) unsubscribe on shell unmount.
* Gates: `pnpm --filter front exec vitest run src/lib/query/preload-intent.test.tsx`; `pnpm --filter front typecheck`.

### T2 — Tenant detail pilot
* File modified: `apps/front/src/routes/authed/staff/tenants/$tenantId.tsx` — add `staticData.preload` returning the single entry `{ options: staffTenantDetailsQueryOptions, variables: { tenantId } }` (the factory already used by the page via `useStaffTenantDetailsQuery` AND by its entity crumb).
* Tests: extension of `apps/front/src/routes/authed/staff/tenants/$tenantId.test.tsx` — the preloaded key equals the key consumed by the page (extraction of both from the real modules); e2e not required (criterion 2 absent: a warming regression would remain visible on mount via QueryDisplay, cf. §9 measurement).
* Gates: targeted vitest; typecheck.

### T3 — Contract guard (red-by-default)
* File created: `apps/front/src/lib/navigation/preload-contract.test.tsx` (full §4 algorithm, emptiness self-check included).
* Self-proves it fails: temporary test scaffolding in the PR (demonstration commit reverted before final push) adding a phantom `preload` entry on a pilot route → the guard must be RED naming `file:routeId` + orphan key; revert → green.
* Gates: `pnpm --filter front exec vitest run src/lib/navigation/preload-contract.test.tsx`; `pnpm --filter front typecheck`.

### T4 — Profiles list pilot (URL-derived variables)
* File modified: `apps/front/src/routes/authed/staff/profiles.tsx` — `staticData.preload` returning `{ options: staffProfilesQueryOptions, variables: <default API variables extracted from parseTableSearchParams(empty searchStr)> }`. Preloaded ONLY the default view (q='', default sort, default size): never the cursors/filters not requested.
* Test: the T3 guard stays green (the preloaded default key is indeed the one consumed on mount without search params); dedicated test case "search params present → the mount consumes another key, no additional query triggered by the preload".
* Gates: targeted vitest; typecheck.

### T5 — Updated conventions
* File modified: `docs/guides/front/conventions.md`, new "Route query preloading (#487)" sub-section in §Rendering Strategy: `staticData.preload` form, silence of failures, boundary with client loaders (§3), staleTime rule (§6), T3 guard obligation, example copied from T2/T4.
* Gate: human re-read (doc), nothing executable.

### T6 — Before/after measurement (§9)
* Files created: `apps/front/e2e/preload-waterfall.spec.ts` (@shell @487) + Measurement section in the PR body (real figures pasted).
* Precise content in §9.

### T7 — Post-#1527 follow-up (out of scope of THIS PR, listed for sequencing)
* After #1527 merge and rebase: add the profile detail `preload` entries (`$profileId.tsx`) on `staffTenantDetailsQueryOptions` + `staffTenantProfileDetailsQueryOptions`; the #1527 blocking loader remains; verify dedup (only one network request on the hover→cold-click traversal).

## 8. Order, risks, STOP-and-report

* Order: T1 → T2 → T3 → T4 → T5 → T6. T3 can be written from T1 but must be green on the T2/T4 pilots before any final commit.
* Assumed conflict: T5 touches `docs/guides/front/conventions.md` also modified by #1527 (its "Route query preloading (#487)" sub-section immediately after the "Rendering Strategy" section of `conventions.md` (§277), in parallel with the client loader semantics carried by issue #1527 which Closes #851 — because speculative preloading (#487) is the non-blocking counterpart of the blocking loader (#1527/#851); the #487 text must contain an explicit cross-reference "see client loader (#1527, which Closes #851)" and conversely the #1527/#851 description a cross-reference "see Route query preloading (#487)". Note: `conventions.md` does not yet contain a dedicated sub-section for the client loader (#851); #1527 creates it at its merge. If #1527 is not yet merged at T5 execution, the #487 sub-section is inserted at the end of §Rendering Strategy with a note "to be moved after the client loader section (#1527, which Closes #851) at the merge of #1527". File in the repo's additive list.
* STOP-and-report if: `onBeforeLoad` does not fire during an intent preload in the real test environment (the §1.1 hypothesis would be false, switching to the next viable event requires a re-decision); if a destination match does not expose its `staticData` at the moment of subscription; if the T3 guard proves incapable of importing a real route module (SSR side effects) — in that case propose the documented fallback (inspection of the page state hook alone) rather than silently weakening the guard.

## 9. Measurement — what and how (not "we will measure")

**Single metric**: time between the start of effective navigation (click) and the resolution of the page's main query, measured on the Playwright network side. Secondary: number of network requests emitted for this resource (must remain 1, anti-double-fetch proof).

**Before (develop tip, without preload)** and **after (branch, with)**, same protocol:

1. Playwright spec `apps/front/e2e/preload-waterfall.spec.ts`: (a) mock API responding with an injectable fixed delay (500 ms) on `GET /staff/tenants/{id}`; (b) scenario A: go to the tenants list, HOVER the detail link for > `preloadDelay` (library default: 50 ms, not overridden in `router.tsx`), wait for the mocked request to leave BEFORE the click (assertion `page.waitForResponse` during hover), click, time to response; (c) scenario B (control, same session, cache cleared): click without prior hover, same stopwatch.
2. Expected figures and thresholds: in A, the response arrives ≤ 50 ms after the click (request already in flight or resolved); in B, ≈ mocked delay (≥ 500 ms). Number of GET requests for the resource: exactly 1 in both scenarios (the dedup is proven, not assumed).
3. Both figures (A vs B) are pasted in the PR body, with commit versions. CI runs the spec (shard front-e2e): the measurement becomes a permanent non-regression guard of the waterfall (if someone cuts the branching, A degenerates into B and the spec fails).
4. Outside e2e, manual completeness measurement (DevTools, Network tab, Waterfall column) on `just dev-front`: capture pasted in the PR for the profiles list route (T4), same protocol hover vs direct click.

## 10. Unverified / remaining assumptions (honesty)

* The exact `onBeforeLoad`-during-intent-preload timing is verified at the type and package-doc level, NOT yet executed in this repo's vitest harness: T1 contains the test case that decides; failure triggers the STOP-and-report §8.
* The T3 guard assumes each pilot page mounts its query hooks in an isolated test render without a server stack; true for the two chosen pilots, not generalized to all 63 authed content routes (64 ids under `/_authed-layout` in `routeTree.gen.ts`, including 1 pathless layout node `/_authed-layout` and 63 content routes). **Real guard coverage: only the routes whose page renders under vitest without the server stack are subject — today the two pilots, and any future route adding a `preload` entry is immediately caught red; the remaining ~61 routes (page not renderable in isolated test) are out of subjection until their migration by the same pilot pattern, tracked by #1592. This is not "silent" coverage of all 63 routes — it is explicit coverage of the only renderable routes, the rest being a named migration plan.**
* The §9 measurement figures are EXPECTED thresholds (mock 500 ms), not measured figures: they will be in T6 and pasted in the PR.
