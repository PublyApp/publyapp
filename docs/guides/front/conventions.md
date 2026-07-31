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
govern `apps/old-front`. Those retired-app rules are scoped to `apps/old-front`; they do not apply
to `apps/front`. Examples include:

- `publy/no-native-html-in-mui-surfaces`
- `publy/no-raw-mui-textfield-register`
- `publy/no-raw-img-in-product-surfaces`

Do not import MUI or `apps/old-front` UI primitives into `apps/front` to reuse retired-app
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
- A drawer hosted **over a list** opens with a PUSH (so a browser Back closes it and restores the
  list entry, rather than leaving the list) and its app-side close consumes that entry again
  (`router.history.back()`), falling back to a `replace` when the drawer was entered by deep link
  and there is no entry of ours to consume. Every other list search write stays `replace: true`.

## Route-Local Private File Naming

Prefix a route-local file that must not become a route with `_` (e.g. `_tenant-details-shell.tsx`, `$userId/_overview-context.tsx`) — this is a human convention only (routing here is driven by the virtual route config in `src/routes.ts`, not file-based discovery), so pick `_` consistently rather than mixing it with `-`.

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

## Product UI Design Preferences (owner-ratified)

These are standing design decisions Radan has ratified across the front parity review
(rounds 1–6, 2026-07). They are **defaults, not per-screen requests** — apply them to every new
surface without waiting to be told. `docs/front-migration/parity-contract.md` is the dated
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
- `rounded-full` / `999px` radius is **only** for avatars and the 36px topbar icon buttons
  (enforced by the `no-rounded-full-or-999-radius` design-system scanner rule).

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
