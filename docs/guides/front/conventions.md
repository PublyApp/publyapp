# Front Conventions

These rules apply to `apps/front`. Repo-wide API, error, URL, logging, and generated-client
rules from `AGENTS.md` still apply unless this guide explicitly narrows a frontend styling rule.

## Base UI and Tailwind

`apps/front` uses `@base-ui/react` primitives (headless, unstyled) wrapped by a local
`components/ui/*` layer — styled with Tailwind v4 utility classes, `class-variance-authority`
(`cva`) for variants, and `tailwind-merge` (via the `cn` helper) for class composition. `shadcn`
is a dev-time scaffolding/CSS-import dependency only, not a component library consumed at
runtime.

This intentionally diverges from the MUI + `sx` rules and app-local primitive patterns that
governed `apps/old-front` (retired 2026-08-22). Those rules were scoped to `apps/old-front`; they do not apply
to `apps/front`. Examples include:

- `publy/no-native-html-in-mui-surfaces`
- `publy/no-raw-mui-textfield-register`
- `publy/no-raw-img-in-product-surfaces`

Do not import MUI or retired `apps/old-front` patterns into `apps/front` to reuse retired-app
components. Rebuild the surface with the `components/ui/*` primitive layer (Base UI + `cva` +
Tailwind), and front-local equivalents where needed, keeping shared behavior behind
framework-agnostic contracts where possible.

Portable repo rules still matter in front when their path coverage includes it:

- no token or secret logging
- no `console.*` in source
- no direct Day.js imports in components
- no manual `response-message` translation at mutation call sites
- no `Array.reduce()`

## Locked Conventions Pending Automation

These are design-locked architectural and style conventions that are not yet machine-enforced.
Follow them by hand until automation exists:

- Do not use `createServerFn` for application-data fetching, aggregation, or proxying.
- Do not return raw cookies, session tokens, or token-bearing objects from server functions.
- Do not use React Aria or `@base-ui/react` protected/internal APIs directly.
- Do not introduce camelCase URL search params for list/table state.
- Do not move app-bound adapters into `@org/shared-ts`.
- Boolean-ish URL search flags (drawer-open markers like `?invite=1`) must round-trip as the
  NUMBER `1`, never the string `'1'` — the router's search serializer JSON-quotes strings
  (`?invite=%221%22`), and bare `=1` URLs parse as a number, so string-typed flags break
  redirects and deep links. Parse leniently (accept `1` and `'1'`), emit the number.
- An **id-carrying** search param (`?edit=<profileId>` — the drawer-over-a-list marker, where the
  id says *which row*) is the opposite case: it must accept **strings only**. The serializer
  re-quotes any string that is itself valid JSON and the parser turns an unquoted numeric value
  back into a number, so an all-digit value cannot round-trip; UUID ids never are, and anything
  that parses to a non-string is not an id. Drop it at the router boundary rather than coercing.
- When one route carries **more than one drawer-open flag** (`?new=1` and `?edit=<id>` on the tenant
  profiles list — today the only such route), they are mutually exclusive and that must be resolved
  at the **parse/serialize boundary**, not only at the open call sites: a URL carrying both is a
  link anyone can be sent, and it mounts both modals on first paint. Pick the flag that names a
  specific entity over a bare flag, and drop the loser from the address bar. Each open path must
  also clear the opposite flag — otherwise the boundary's own tiebreak silently turns the losing
  drawer's trigger into a no-op.
- **A resource's sections are path segments, not `?tab=`** (#977). "Which section of this resource
  am I looking at" is a distinct, linkable, navigable location; query params are for view state
  that *modifies* the page it sits on (filters, sort, pagination, a drawer-open flag). Both detail
  shells follow this today: `/staff/staff-users/$userId/{permissions,activity,settings}` and
  `/staff/tenants/$tenantId/profiles/$profileId/{permissions,members}`, each with the overview as
  the index child. Consequences worth knowing before adding the next one: the parent becomes a
  **layout** route, so anything it hosts (an edit drawer and its draft, a nav guard's state)
  survives a section switch while the section body remounts; a `to`-less `Route.useNavigate()`
  call in that layout resolves against the LAYOUT's path, so a search-only write must name the
  section on screen explicitly; the overview link's path is a **prefix** of every sibling's, so
  its `Link` needs `activeOptions={{ exact: true }}` or it lights up on every section; and each
  section route declares its own breadcrumb tail (shared base + one label crumb).
- **Retiring a URL shape means redirecting it, not ignoring it.** When a param stops addressing
  anything (`?tab=` after #977), the route that used to answer it keeps parsing it just long
  enough to `redirect()` — with `replace: true`, so Back doesn't bounce through the dead link —
  and drops it from the address bar. Silently ignoring a live bookmark lands the visitor on a
  default view, which reads as data loss.
- A drawer hosted **over a list** opens with a PUSH (so a browser Back closes it and restores the
  list entry, rather than leaving the list) and its app-side close consumes that entry again
  (`router.history.back()`), falling back to a `replace` when the drawer was entered by deep link
  and there is no entry of ours to consume. Every other list search write stays `replace: true`.

## React Compiler

The React Compiler runs automatically via `@vitejs/plugin-react` 6.1 with the Rust-based
`oxc-transform-react` backend (`compiler: true` in `vite.config.ts`). It memoises components
and hooks at build time, replacing the need for hand-written `useMemo`/`useCallback` for
purely performance-driven memoisation.

**Rules:**

- **Do not add new `useMemo` or `useCallback`** for memoisation purposes. The compiler
  handles this automatically. Existing ones stay until a measured follow-up removes them.
- **Rules of React are load-bearing.** The compiler skips components that violate them (refs
  during render, throw inside try/catch, finally clauses, eslint-disable suppressions). These
  skip warnings appear in the build output — they are informational, not errors. The full
  inventory lives in [`docs/guides/front/react-compiler.md`](react-compiler.md).
- React Doctor (issue [#1182](https://github.com/PublyApp/publyapp/issues/1182)) checks
  Rules-of-React compliance. It does **not** run inside `pnpm --filter front test`: it is a
  separate oxlint-based analyzer enforced by its own required workflow
  ([`.github/workflows/react-doctor.yml`](../../../.github/workflows/react-doctor.yml),
  `pnpm dlx react-doctor@0.9.12 --scope files --base <base> --blocking warning`). Run
  `just react-doctor` locally before pushing — see
  [`docs/guides/react-doctor.md`](../react-doctor.md).

**Known compiler skip patterns (informational):**
- `throw` inside `try/catch` — the compiler cannot lower this yet (Todo upstream)
- `finally` clauses — the compiler skips components with `try/finally`
- Ref access during render — `locationRef.current = location` in render scope
- `eslint-disable-next-line react-hooks/*` suppressions — the compiler refuses to optimise

None of these cause build failures; the compiler degrades gracefully by skipping those
specific components.

## Route-Local Private File Naming

Prefix a route-local file that must not become a route with `_` (e.g. `_tenant-details-shell.tsx`, `$userId/_overview-context.tsx`) — this is a human convention only (routing here is driven by the virtual route config in `src/routes.ts`, not file-based discovery), so pick `_` consistently rather than mixing it with `-`.

## Component Files Export Components Only (#1417)

A component file must not export anything that is not a component: the react-doctor
`only-export-components` rule (enforced tree-wide since #1423 removed the last
`doctor.config.json` override) fails on any such
export because it breaks Fast Refresh state preservation. The pattern, decided in
[#1417](https://github.com/PublyApp/publyapp/issues/1417) (part of #1291):

- **Style variants and cva calls** live in a sibling `*.variants.ts` module (see
  `components/ui/button.variants.ts`, `badge.variants.ts`, `tabs.variants.ts`); consumers
  import variants from there and components from the `.tsx`.
- **Column builders, label formatters, redirect helpers** are either moved to a sibling
  route-private module (`_*.ts(x)` next to their only consumer) or into `src/lib/*` when they
  are cross-surface; tests import them from the new location.
- A helper with **no importer outside its own file is simply privatized** (drop `export`)
  rather than moved.
- Route files (`routes/**`) additionally keep only the `Route` export plus component(s).

## Breadcrumb & Route Contract (#973)

Every route declares its own breadcrumb trail via `staticData.crumbs`
(`src/lib/navigation/breadcrumbs.ts`). This is not optional by convention alone: the module
augments TanStack Router's `StaticDataRouteOption` to make `crumbs` a **required** field, so a
route file whose `createFileRoute(...)({ staticData: {...} })` call omits it fails
`pnpm --filter front typecheck` — the same gate `just ci-front` runs. This is the Tier 1 rule;
the Tier 2 machine guards below (`src/lib/navigation/breadcrumb-contract.test.tsx`) exist because
a required field only proves a route declared *something*, not that the something is correct.

**The two permitted shapes of `staticData.crumbs`:**

- `'shell'` — opts the route out of ever supplying the trail. Use it for pathless layouts,
  auth/marketing surfaces, and redirect-only legacy stubs whose `beforeLoad` immediately
  redirects and which render `null` (e.g. `profiles-new.tsx`, `$profileId-edit.tsx`,
  `users-invite.tsx`). `deriveBreadcrumbTrail` walks from the deepest match upward and skips
  `'shell'` matches, so an ancestor or sibling route still supplies the visible trail.
- A function `(params) => readonly CrumbSpec[]` — the route's full trail *tail* (everything
  after the scope root). Routes are flat (see Route-Local Private File Naming above), so the
  deepest matching route declares its entire tail, not just its own segment; do not expect
  parent/child routes to each contribute one crumb.

`CrumbSpec` has exactly two `kind`s:

- `{ kind: 'label'; labelKey: string; to?: string }` — a static, developer-controlled i18n
  string (e.g. `nav-tenants`, `common:profiles`). `to`, when present, is an already-interpolated
  concrete href (`` `/staff/tenants/${tenantId}/profiles` ``), not a route-template literal — it
  is typed as a plain `string` for exactly that reason.
- `{ kind: 'entity'; to?: string; query: (params) => EntityCrumbQuery; select: (data) => string
  | undefined }` — a crumb whose label is a real entity's name, resolved at render time by
  `EntityCrumb` (`src/lib/navigation/entity-crumb.tsx`).

**A route whose generated path has a `$param` dynamic segment must name one `entity` crumb per
segment, and — since #973's third review round — that route's entity crumbs must be listed in the
SAME left-to-right order as its own `$param` segments** (crumb 0 names the first segment, crumb 1
the second, and so on). This ordering is a real constraint the guards below rely on, not
incidental style. The Tier 2 route-tree-walk guard's structural test counts `$param` segments
against `entity` crumbs for every real, generated route and fails if the *counts* don't match —
a dynamic route may not fall back to a generic label crumb for the thing its own URL identifies.
**Count matching alone does not prove crumb 0 actually names segment 0** — see the binding guard
below, which is what actually enforces the ordering claim. The only exception to the
one-entity-per-segment rule is the frozen legacy-redirect-stub allowlist mentioned above (`'shell'`
is correct there because the route never renders a trail at all).

**The `query`/`select` pair contract:**

- `query(params)` must return `{ queryKey, queryFn }` built from the **same**
  `xxxDetailsQueryOptions` factory the entity's own detail page queries (see the `*CrumbQuery`
  helpers next to each domain's query module, e.g. `staffTenantCrumbQuery` in
  `src/lib/query/staff-tenants.ts`) — reusing the query key lets TanStack Query dedupe the
  request, so a page the user navigated *from* already has the entity cached and the crumb paints
  instantly instead of showing a skeleton.
- `select(data)` must derive the entity's actual human name from `data` and return `undefined` on
  a shape it can't resolve (renders the muted-dash fallback). It must never return a fixed
  string regardless of input — the #973 BLOCKER's first round was exactly that: a real route's
  `select` rewritten to always return `'Tenant detail'` typechecked and passed the route-tree-walk
  guard, because that guard only proved a crumb was *tagged* `entity`, not that its selector was
  wired to the payload. The route-tree-walk guard's own selector-marker test (in
  `breadcrumb-contract.test.tsx`, NOT the rendered-artifact guard — see the correction below) now
  drives every real route's own `select` closure against a representative payload and asserts the
  output echoes that payload's name field, closing that specific gap.
- **`query` and `select` must each belong to the crumb's OWN `$param`, not merely to SOME
  registered entity** — the #973 BLOCKER's second round: a route whose profile crumb was rewired
  to the tenant's already-registered `query`/`select` pair passed both tests above (the query was
  registered, and the selector echoed *its own* payload's marker) while silently resolving the
  tenant's name into the profile's slot at runtime. The route-tree-walk guard's binding test
  closes this by proving each entity crumb's `query` is behaviorally sensitive to its OWN segment
  and NOT to any deeper (descendant) segment — it changes only that one route param at a time and
  asserts the resulting cache key changes (or doesn't) accordingly. This needs no hand-maintained
  "which param does each query belong to" table, so it cannot itself drift out of sync with the
  registry the way a second table could.
- **New entity queries must be registered in the guard's registry** (`ENTITY_QUERY_REGISTRY` in
  `breadcrumb-contract.test.tsx`) — a closed allowlist pairing each production `query` function
  reference with a representative wire-shaped payload. The guard fails closed: a route whose
  `query` isn't a registered reference is reported as a failure rather than silently skipped, so
  adding a genuinely new entity kind (a new domain's crumb) means adding it to the registry, with
  its own representative payload, on purpose — not an oversight the guard quietly ignores.
- **Correction:** the "rendered-artifact guard" (Guard B, the one that mounts a real `AppShell` +
  router) exercises only the real `/staff/tenants/$tenantId` route — it is not what drives every
  real route's selector. The route-tree-walk guard (Guard A) is the one that iterates every real
  route and calls every real `select`/`query` pair; Guard B's job is narrower — proving one real
  route's crumb genuinely renders (skeleton → resolved name, no crumb-count jump, muted-dash on
  failure), which a pure-function walk can't observe.
- **What none of the above still proves:** the binding guard establishes that a crumb's query is
  sensitive to its own segment and not to a deeper one; it does not (and cannot, from calling a
  pure function in a test) prove the query hits the *correct backend endpoint* for that entity
  type — only that it reacts to the right route parameter. A hand-written new query that reads
  the correct param but calls the wrong endpoint for that entity family would still pass every
  guard here; that class of bug is caught by ordinary code review of the `*CrumbQuery` helper
  itself, not by this contract.

**Long entity names must not break the breadcrumb row.** Entity names are user-supplied and can
be arbitrarily long. `EntityCrumb`'s resolved-name node uses `block truncate` with
`title={name}` — the same "long user-supplied string in constrained space" pattern as the rest of
front (see Content & data honesty below), not a bespoke breadcrumb-only mechanism — and the
breadcrumb row's own flex-item wrappers (`.app-shell-breadcrumb-link` / `-current` / `-muted` in
`app.css`) carry `min-w-0` so that truncation actually has room to take effect instead of
overflowing the topbar.

## Superseded proof-of-concept

The disposable proof-of-concept was removed in #965 after its findings were
reimplemented. Use `apps/front` as the canonical source for durable code.

## Ports and Adapters

Shared code is a ports-and-adapters boundary, not a lift-and-shift of current-app modules.

Framework-agnostic contracts live in `@org/shared-ts` behind injected seams. A scope-aware
client seam should be type-only or hidden behind a framework-neutral port. This snippet is
illustrative, type-only pseudocode and must not become a runtime dependency on the generated
client:

```typescript
type ApiClientPort = unknown;

interface ClientAccessor {
	getOrCreateClient(tenantId: string): ApiClientPort;
	getOrCreateStaffClient(): ApiClientPort;
	getOrCreateAnonymousClient(): ApiClientPort;
}
```

`ApiClientPort` is illustrative, not a required exported name. Pure shared modules must
either import generated client types with `import type` only or hide the generated client behind a
framework-neutral interface.

Pure shared modules may define contracts, pure parsers, redaction helpers, API failure mapping,
query-key helpers, query-state predicates, and framework-neutral query/key/state factories that
receive injected accessors. They must not import React, TanStack Query, Kiota, `@base-ui/react`,
or MUI at runtime. Any external framework or client references needed by shared contracts must be
`import type` only, with no runtime import side effects.

App-bound pieces stay local to `apps/front`, including:

- `ClientManager` and concrete Kiota client wiring
- environment and cookie I/O
- logout, toast, and tenant-resolution handlers
- `components/ui/*` renderers such as `QueryDisplay`
- route/layout integration and server functions

## Rendering Strategy

Marketing and auth surfaces are SSR.

Authenticated application surfaces are CSR with `ssr: false`. They fetch application data in
the browser with TanStack Query and the Kiota client. Do not fetch authenticated domain data in
server loaders or server functions.

## Server-Function Boundary

`createServerFn` is for frontend-server concerns only:

- cookie read/write
- the login call that sets the session cookie (without returning the session token)
- i18n resource loading

It is not a BFF. Do not use server functions to fetch, aggregate, transform, or proxy domain
entities for authenticated app pages. Application data goes browser to Kiota directly.

Returning a raw cookie, session token, or token-bearing object from a server function is a leak.
Read cookies through server-only helpers and return only the minimum non-secret result needed by
the UI.

### Exported helpers must not leak `@tanstack/react-start/server` outside handler bodies

The TanStack Start compiler strips `createServerFn` handler bodies (and imports only used inside
them) from the client bundle. It cannot strip top-level `export`s. If a module exports a symbol
that references `@tanstack/react-start/server` outside a handler body, that import stays in the
client graph and the build's import-protection plugin fails — but only the production build
(`vite build`) catches this; vitest and `tsc` do not. Shared server-only helpers (e.g. cookie
read/write utilities used by more than one `*-actions.ts` module) belong in their own module
(such as `src/lib/server/session-cookie-utils.ts`) and must only ever be called from inside
`createServerFn` handler bodies in their consumers. `pnpm --filter front build` is part of
verification for any change that touches a server-fn module.

## URL State

URL query parameters use snake_case per `AGENTS.md`. Table/list state uses:

- `q`
- `sort_id`
- `sort_order`
- `cursor`
- `size`

The spike's `sortId` and `sortOrder` names are not the convention. Do not parse or emit spike
aliases such as `sortId` or `sortOrder` in durable front routes. Internal TypeScript objects may
use camelCase when useful, but the URL contract must stay snake_case. Convert between internal
state and URL parameters at explicit parse/serialize boundaries, not ad hoc inside components.

## Error Views and Logout

Front preserves the hard RFC 7807 logout split:

- Auth surface `401` follows the auth error path. Show the auth error view. Do not log out.
- Authed surface `401` means the active session is invalid. Log out.
- `403` never logs out, on any surface.

Keep this split in layout error boundaries, TanStack Query error handling, and any future
`AppErrorView` wrappers.

## Mutation Feedback Ownership

User-command mutation successes and general mutation failures produce one
toast. Handled 422 field validation stays inline without a duplicate toast,
but its form must map every field error or show an exhaustive visible
root/summary fallback. Query failures remain persistent. Aborts and mutation
401s are silent; the 401 backstop still expires the session.

The global owner is `router.tsx`'s `MutationCache`; `QueryCache` remains
query/auth-only. Direct `useMutation(...)` construction belongs in
`src/lib/query`. Compound, bulk, export, and upload flows must name exactly one
global or local feedback owner. Use the current `MutationFeedbackMeta` fields:
`successMessage` for a translated global success, `silentSuccess` for locally
owned success, `validationHandledByForm` for exhaustively rendered inline
validation, and `skipGlobalErrorHandler` for a named local failure owner. Do
not configure front factories with `handlers.onToast`, because that shared
seam also handles query failures.

Pure mutation-feedback policy stays in `@org/shared-ts`. Sonner presentation
stays local to `components/ui/toaster.tsx` and `lib/mutation-toast.ts`. The
executable guard is
`apps/front/src/lib/mutation-feedback-architecture.test.ts`.

## Query State Rendering

Render TanStack Query loading / error / empty / data ladders through the shared
`QueryDisplay` component (`apps/front/src/components/query-display.tsx`), not a hand-rolled
`if (isPending) ... if (isError) ... return <div>{data}</div>` ladder. `QueryDisplay` keeps the
loading, error, and empty states visually consistent (it composes `StateView` /
`StateSurface` / `Skeleton`), and it is the single place to evolve those states.

The `publy/prefer-query-display` oxlint rule flags component files that bind a `use*Query` result
and then branch on a query flag (`isPending` / `isLoading` / `isError` / `isSuccess` / `status` /
`error`) inside a conditional render. It is **dormant** (`"off"`) in this repo today — it ships so
the offender list is measurable and the follow-up that flips it to `"error"` is mechanical. While
dormant, keep new code on `QueryDisplay`; do not wait for enforcement to land.

`useMutation` results are explicitly out of scope for the rule — mutation feedback ownership is a
separate policy (see above). The rule also excludes the `QueryDisplay` implementation itself, the
table layer, the `lib/query` helpers, and the three root/layout entrypoints that legitimately wire
query state into shell-level error boundaries. `DataTable` screens own their own list-state
mechanism (`components/table/table-body-state.ts` + the `no-match` state `QueryDisplay` lacks), so
they are intentionally excluded — PR 3 of #1250 folds that mechanism into `QueryDisplay` and lets
`DataTable` delegate.

## Product UI Design Preferences (owner-ratified)

These are standing design decisions Radan has ratified across the front parity review
(rounds 1–6, 2026-07). They are **defaults, not per-screen requests** — apply them to every new
surface without waiting to be told. `docs/records/2026-07-29-spec-front-parity-contract.md` is the dated
decision log; this section is the forward-looking rulebook. When a new screen forces a genuinely
new choice, decide in this spirit and add the rule here.

### Elevation & borders
- Cards and sections are outlined by a **1px box-shadow ring**, never a drop-shadow/elevation.
  Use `box-shadow: var(--publy-shadow-ring)`; do not add `shadow-md`,
  `shadow-lg`, or ad-hoc elevation. Flat surfaces, crisp hairlines.
- The ring is a **solid 1px hairline at `--publy-border`** (full opacity), not a faint low-opacity
  wash. Keep it a box-shadow ring, **not** a real CSS `border` — the ring adds no layout width, so
  it never shifts grid tracks or table columns. An element must not carry both a real `border` and
  the ring (that doubles the line).

### Corner radius
- Radius **scales with control height** — a small control must not look pill-ish. Buttons:
  `xs` 8px · `sm` 10px · `default` 12px · `lg` 14px (icon sizes match by height). Inputs 10px,
  chips 8px. These live on the size variants in `components/ui/button.tsx` and the
  `--publy-radius-*` tokens.
- `rounded-full` / `999px` radius is **only** for avatars, the 36px topbar icon buttons, and the
  profile icon-picker's pencil-pin corner badge (`.publy-profile-detail-tile-pin`) — the same
  "genuinely circular" corner-badge shape as `AvatarBadge`
  (enforced by the `no-rounded-full-or-999-radius` design-system scanner rule, with an exact-selector
  allowlist so an unrelated selector cannot inherit an exception by sharing a name prefix).

### Action buttons & destructive placement
- **No destructive action in a detail-view header.** Headers carry only non-destructive primary
  actions (Edit, Reset invite, Copy link, Resend). Destructive/lifecycle actions (Suspend/
  Reactivate, Delete, Remove, Revoke) live in a **dedicated body section** — a "Danger zone" card
  or a small removal section (uppercase eyebrow + one-line description + the destructive button).
- This applies to **detail views only**. List-page row actions and bulk-action menus, and
  repeatable form-field controls (e.g. "remove this row"), are exempt — destructive items there
  follow the bulk-action UX conventions.
- Header action clusters are cohesive: one button height and one radius across the cluster; use the
  `Button` system + `buttonVariants`, not ad-hoc heights/radii/`color-mix` inline colors.

### Primary CTA consistency across "Add X" actions
- **Owner consistency rulings outrank single-screen design details.** When a design-pack PNG draws
  one screen's primary action differently from the rest of the app, and the owner rules that
  cross-app consistency wins, apply the owner's ruling — the design pack is a single frozen
  snapshot; consistency across the shipped app is the higher-priority signal.
- Concrete case (FIX-4, 2026-07-13): the tenant Profiles tab design PNG draws "New profile" as an
  outline button, but every other "Add xxx" primary action in the app (Add tenant, Invite user, …)
  is a primary (`variant="default"`) button. The owner ruled "New profile" must match — it is
  `variant="default"`, not outline, despite the design pack.

### Error & empty states
- Error views (4xx/5xx) and empty/no-match list states are **flat**: no card box, no ring, no
  shadow, no backing disc/tile behind the icon.
- Both render the **one shared primitive** (`components/ui/state-view.tsx`) at the **same visual
  scale** — an empty table and a 500 page read as the same family (48px tone-colored glyph,
  matching title/description/action sizing). Only the heading element (`h1` on a full page vs a
  non-`h1` inside a list) and the inline table-body wrapper differ.
- The icon is a **bigger flat glyph (~48px), tone-colored** (neutral = `--publy-foreground-muted`,
  danger = `--publy-danger`, primary = `--publy-primary`) — no disc, ring, box, or ghost numeral,
  and no separator rules between sections.
- Every error state offers an action: a 500 gets **Retry + Go to home**; retry must actually
  refetch (client-side), never `window.location`.

### Not-found vs bad-request (malformed IDs)
- A malformed / non-GUID id in a detail route renders the **404 not-found view**, not a distinct
  400 "invalid link" view. (Backend still returns 400 for malformed and 404 for absent per
  AGENTS.md — this is a front-end presentation choice. Fold the malformed-400 case into the
  not-found branch.) A separate 400 "invalid link" screen for a detail route is a regression.

### Back navigation
- Every **page-top back-link** uses the `.publy-back-link` style: a TanStack `<Link>` with
  `<IconArrowLeft aria-hidden className="size-3" />` + the label. An **arrow** (`IconArrowLeft`),
  not a chevron. Same treatment on detail, edit, new, and invite pages — no ad-hoc `text-xs`/color
  variants.
- The "Back to X" links inside error/not-found views are a **different** pattern: recovery CTAs
  styled as buttons (`buttonVariants({ variant: 'outline' })`). Leave those as buttons.

### Tables
- A list table's **first column is the entity link**: the whole cell is a TanStack `<Link>`
  (`no-underline`) wrapping the icon/avatar + name, and the **name span carries `.publy-record-link`**
  so it underlines on hover. Every list table's first column must behave identically — never render
  a bare, non-hovering name.
- The ⋯ row-actions button is horizontally centered in its cell (`meta.align: 'center'`).
- **Table views scroll inside the table, never the page** (owner ruling, 2026-07-12): a page whose
  main content is a `DataTable` must never let `.app-shell-main` scroll because of table rows. The
  toolbar and cursor footer stay pinned in view; only the table body scrolls. Reference
  implementation: `tenants.tsx` — the page root uses `.publy-page-fill` (`flex h-full min-h-0
  flex-col`), which gives `DataTable`'s internal `.publy-data-table-shell` (`flex: 1 1 auto`) a
  bounded height so its own `overflow-auto` table wrapper scrolls, not the page. Any new top-level
  list route must use `.publy-page-fill` the same way. For a `DataTable` living inside a detail-tab
  shell (not a top-level route), the shell must give the tab body the same bounded-height chain —
  see `TenantDetailsPageShell`'s `bodyScroll="contained"` prop (`.publy-detail-tab-body`) used by
  the tenant Users/Invitations tabs. This does **not** apply to card grids (e.g. the tenant Profiles
  tab) — page-scroll is correct there; only `DataTable`-backed views must own their scroll.

### Selection mode & bulk actions
- Row-selection bulk actions render in a **floating bottom-center action bar**
  (`components/table/floating-selection-bar.tsx`, `FloatingSelectionBar`), not an in-toolbar swap.
  This supersedes the earlier "toolbar swaps to bulk actions" pattern — the table's `toolbarEnd`
  (search/filters) stays visible and unchanged while rows are selected; only the floating bar
  appears. See `tenants.tsx` and `tenants/$tenantId/users.tsx` for the reference wiring: the bar is
  rendered unconditionally (its own internal `selectedCount > 0` state drives mount/unmount so the
  exit animation can play), fed `selectedCount`/`visibleCount`/`allVisibleSelected` derived from the
  page's row-selection state, and given the page's bulk-action controls (dropdown menu + confirm
  dialogs) as `children`.
- The bar is **portalled to `document.body`** — `.app-shell-main` sets `container-type: inline-size`,
  which establishes a containing block for `position: fixed` descendants, so a non-portalled bar
  would be trapped inside the scrollable content area instead of pinned to the viewport.
  Un-portalled `position: fixed` UI anywhere under `.app-shell-main` has this same trap; portal it.
  Chrome uses dedicated `--publy-selection-bar-*` tokens (bg/fg/border/ring/hover/divider/muted) in
  `app.css`, inverted per theme (dark pill on light theme, light pill on dark theme) — do not
  hardcode zinc/black/white values in the component.
  Existing bulk-action-ux-conventions.md rules (always-render menu items, ineligible click → i18n
  toast, trigger gates on `BULK_ACTION_MAX_COUNT`) apply unchanged inside the bar.
- **Card-grid selection chrome** (tenant Profiles tab, FIX-4, 2026-07-13): a selectable card's
  checkbox is **absolutely positioned in the card's top-left corner**, never an in-flow flex item —
  an in-flow checkbox pushes the icon tile/text column sideways, which is a layout regression, not
  a selection affordance. A selected card also gets an **amber ring** on the card surface itself
  (`.publy-profile-card--selected`, `box-shadow: 0 0 0 2px var(--publy-primary)`) — the checkbox
  alone is not sufficient visual feedback that a card is selected.

### Content & data honesty
- **Never render fabricated or placeholder admin data.** If the contract does not provide a field,
  omit it — no invented values (2FA/session/"Type: Custom"), no `TODO(contract): …` shown as UI
  text, no `"—"` standing in for data a staff admin would read as real. The field returns when the
  contract provides it.
- Long descriptions in **list rows** truncate to one line with a `title` tooltip
  (`className="truncate …" title={value || undefined}` under a `min-w-0` parent) — never let a
  description overflow its card. Full-width prose blocks may wrap instead.

### Navigation & layout
- Internal navigation is always a TanStack `<Link>`, **never** a raw `<a href>` (a hard reload
  tears down the SPA and drops the query cache). Path-constant hrefs on an `<a>` count too.
- A detail view's heading block spans the **same width** as its tabs/body grid — the header is not
  narrower or wider than the content beneath it.
- Theme toggle is **instant** (no flash). Dark mode is authored at implementation time (the design
  canvas defines light only); dark borders follow the `gray-ui-csm` template.

### Menus, selects & controls
- The `outline` button variant's border must be **legible in both themes** — use
  `border-(--publy-border-strong)` unconditionally (no separate faint light-mode border with a
  stronger `dark:` override).
- Dropdown/context menu items are **9px radius** (spec.json `radii.menuItem`) with a **muted
  hover/highlight** (`focus:bg-muted` / `data-highlighted:bg-muted`) — never `rounded-2xl` or an
  accent-colored hover. Accent/primary color is reserved for the checked/selected affordance
  itself, not for the hover state. This applies to every menu row type: plain items, checkbox
  items, radio items, and sub-triggers — the plain `DropdownMenuItem` (e.g. the "Clear" row in
  filter menus) is the reference.
- Multi-select filter menus (items with `closeOnClick={false}`) render a **visible checkbox at the
  row end** (`DropdownMenuCheckboxItem`'s `showCheckbox` prop) — checked and unchecked states must
  both be visible without hovering, styled like the design-system `Checkbox` (5px radius). This is
  a multi-select-only affordance: exclusive/radio-style filters that happen to use
  `DropdownMenuCheckboxItem` with `closeOnClick` (e.g. a type filter with an "All" option) must
  **not** get `showCheckbox` — they keep the checked-only indicator.
- `Select` popups are **trigger-anchored dropdowns**: the popup always opens directly below the
  trigger, never repositioned to align the current value over the trigger. `alignItemWithTrigger`
  defaults to `false` on `components/ui/select.tsx`'s `SelectContent` — do not flip it back to
  `true` for an individual usage without a documented exception here.

### Subtle text token

`--publy-foreground-subtle` (`#a1a1aa` light / `#71717a` dark) is ~2.5:1 against the white
surface. It fails the 4.5:1 body-text floor and the 3:1 large-text floor, so it is only
legitimate for non-text or deliberately de-emphasised roles: **placeholders**, **decorative icons**,
**eyebrows/labels/helpers**, and **inline metadata or separators** that accompany a readable
element. It must never be used for standalone readable text at body size. Use
`--publy-foreground-muted` for secondary body text and `--publy-foreground-secondary` where the text
is real content. The three pinned intentional consumers (`publy-type-helper`, `publy-field-helper`,
`publy-type-eyebrow`) are pinned to the subtle token in
`drawer-description-contrast.test.ts` to document this intentional exception (not to assert
4.5:1 conformance — the guard records the colour the class resolves to, which at 2.5:1 is a
known failure), and are not to be mechanically replaced.

## Marketing Surfaces (#1038)

The marketing chrome lives in `apps/front/src/components/marketing/` and is mounted by
`layouts/marketing-layout.tsx`, which `__root.tsx`'s `shellComponent` renders for every
non-authenticated, non-auth path — including the root not-found and error branches. That is why
the shell is layout-owned rather than route-owned: those branches have no route `staticData` to
hang a layout off, and they must not render bare.

### Two container roles, never a third width

- **Chrome that is scanned** — the header and its mega panel — is `--publy-container-chrome`
  (1280). The mega panel needs it: at 1152 three columns plus hairline dividers leave French
  labels wrapping to three lines.
- **Content that is read** — page body, social-proof strip, CTA band **and the footer** — is
  `--publy-container-reading` (1152).
- Gutters are `px-4 sm:px-6` on both, so below 1280 they are identical. Above it the footer's
  content deliberately sits 64px inside the header's outer edges.
- Go through `MarketingContainer`; do not re-declare either width inline. A third, nearly
  identical width is how tokens stop being followed.

### Header geometry

`--publy-header-height` (64px, 56px below 768) is the single source for the sticky header box,
the mega panel's offset, the drawer's inset and every in-page anchor's `scroll-margin`
(`.publy-marketing-anchor`). Three hardcoded 64s drift independently.

The header carries a static bottom hairline: **no scroll elevation and no hide-on-scroll** — a
header that moves while a mega panel is open is a usability risk. The active nav state is a 2px
`--publy-primary` underline plus `--publy-surface-hover` fill through
`.publy-marketing-nav-link`, never a solid primary pill, and never an inline style.

### No dead ends

Marketing nav entries in `marketing-nav.ts` carry an **optional** `to`. An entry with no route is
data, not a link: the renderers drop it, and a column or trigger left with nothing to show drops
with it. Adding the page later is the whole change — give the entry a `to` and it appears in the
header, the mega panel, the drawer and the footer at once. `marketing-nav.test.ts` checks every
declared destination against the real generated route tree, so a link the router cannot resolve
fails the suite rather than shipping.

The same honesty rule governs content: no invented customer names, no newsletter form without an
endpoint, no "Talk to sales" without a contact route. Placeholders that must ship are marked in
the DOM (`data-placeholder-logo`), never presented as real.

### Contrast is measured, not assumed

The handoff's "no text lighter than `#71717a`" floor assumes a **white** backdrop.
`--publy-foreground-muted` measures 4.40:1 on `--publy-surface-muted`, below AA — small text on a
muted marketing surface uses `--publy-foreground-secondary` instead. `styles/marketing-contrast.test.ts`
pins the pairs the shell paints, in both themes. Check a new marketing surface the same way:
against the rendered page, not the design's colour table.

### Cookie consent

`lib/store/cookie-consent-store.ts` fails closed: absent, malformed, or older-policy-version
state resolves to "no optional cookies" **and** leaves the decision unresolved so the band asks
again. Dismissing is rejecting — there is no "ask me later". Accept and Reject are equally sized
and equally placed: the deliberate exception to one-primary-CTA, because an unequal pair here is
a dark pattern. Preferences open a right-side drawer, never a centred modal, and the categories
are squared `Checkbox` primitives (a fully-rounded switch track is guard-banned).

## `<Trans>` render guard

Normative. Every production `<Trans>` call site under `apps/front/src` is guarded by
`src/lib/i18n/trans-render.guard.test.tsx`: each site renders through its REAL exported route
component and the REAL `createI18nFromResources` init fed the real shipped EN/FR bundles, with
per-language DOM pins (strong-tag count/class, interpolated-value placement, verbatim sentence).
react-i18next is never mocked in that file, and `check-ci-gate-structure` pins the file into CI
so its enforcement cannot be silently lost (#1285/#1312).

Discovery is automatic (#1312): an AST walk collects every JSX element whose tag resolves to a
react-i18next `Trans` binding — plain, aliased (`import { Trans as T }`), default-import spelled
`Trans`, or namespace (`<i18n.Trans>`) — across `apps/front/src`, excluding only the suite itself
(`*.test.*`, `*.spec.*`, `*.stories.*`, including the guard's own direct-mode mounts), `*.d.ts`,
and `e2e/`. A discovered site without a matching spec entry lands in the standing unpinned list
and turns the guard red naming `file:line`; a parse failure anywhere scanned throws instead of
scanning a recovered partial tree. Adding a call site therefore means adding its spec in the same
change — the failing test names the exact spot.

Boundaries, each pinned by a standing test in the guard file (never widen them silently):

- A **spread-only** `<Trans {...props} />` is NOT a blind spot (#1333). It carries no static
  `i18nKey`/`ns` identity to pin, but tag matching happens before attribute reading, so the site
  is still discovered with `i18nKey: null`, still lands unpinned, and still goes red naming
  `file:line` like any other uncovered site. Earlier notes calling this shape invisible were
  wrong — do not reintroduce that claim.
- Precision: a spread on a NON-`Trans` element contributes zero sites; discovery matches Trans
  tags only.
- The true residual blind spot (#1333): a `Trans` binding reached through a LOCAL re-export
  (`export { Trans } from 'react-i18next'` in some shared module) is not resolved. Neither the
  literal-string pre-filter nor the react-i18next import-binding walk can see through it. The
  shape does not exist in src today, and the boundary test pins that fact on purpose: if such a
  shape ever becomes necessary, grow binding resolution BEFORE shipping it and update this
  disclosure in the same change.

When copy changes, update the verbatim EN/FR pins deliberately; when the `components={{
strong: … }}` map moves or changes class, both the map pin and the sentence pins follow. There
are no suppressions for this guard.
