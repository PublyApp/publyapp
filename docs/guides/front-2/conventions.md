# Front-2 Conventions

These rules apply to `apps/front-2`. Repo-wide API, error, URL, logging, and generated-client
rules from `AGENTS.md` still apply unless this guide explicitly narrows a frontend styling rule.

## Base UI and Tailwind

`apps/front-2` uses `@base-ui/react` primitives (headless, unstyled) wrapped by a local
`components/ui/*` layer — styled with Tailwind v4 utility classes, `class-variance-authority`
(`cva`) for variants, and `tailwind-merge` (via the `cn` helper) for class composition. `shadcn`
is a dev-time scaffolding/CSS-import dependency only, not a component library consumed at
runtime.

This intentionally diverges from the MUI + `sx` rules and app-local primitive patterns that
govern `apps/front`. Those current-app rules are scoped to `apps/front`; they do not apply to
`apps/front-2`. Examples include:

- `publy/no-native-html-in-mui-surfaces`
- `publy/no-raw-mui-textfield-register`
- `publy/no-raw-img-in-product-surfaces`

Do not import MUI or `apps/front` UI primitives into `apps/front-2` to reuse current-app
components. Rebuild the surface with the `components/ui/*` primitive layer (Base UI + `cva` +
Tailwind), and front-2-local equivalents where needed, keeping shared behavior behind
framework-agnostic contracts where possible.

Portable repo rules still matter in front-2 when their path coverage includes it:

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

## Route-Local Private File Naming

Prefix a route-local file that must not become a route with `_` (e.g. `_tenant-details-shell.tsx`, `$userId/_overview-context.tsx`) — this is a human convention only (routing here is driven by the virtual route config in `src/routes.ts`, not file-based discovery), so pick `_` consistently rather than mixing it with `-`.

## Spike Reference

`apps/front-2-spike` is disposable reference only. Use it to understand harvested patterns and
prior de-risking work, but do not treat spike code as canonical or copy it verbatim as durable
front-2 code.

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

App-bound pieces stay local to `apps/front-2`, including:

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
`createServerFn` handler bodies in their consumers. `pnpm --filter front-2 build` is part of
verification for any change that touches a server-fn module.

## URL State

URL query parameters use snake_case per `AGENTS.md`. Table/list state uses:

- `q`
- `sort_id`
- `sort_order`
- `cursor`
- `size`

The spike's `sortId` and `sortOrder` names are not the convention. Do not parse or emit spike
aliases such as `sortId` or `sortOrder` in durable front-2 routes. Internal TypeScript objects may
use camelCase when useful, but the URL contract must stay snake_case. Convert between internal
state and URL parameters at explicit parse/serialize boundaries, not ad hoc inside components.

## Error Views and Logout

Front-2 preserves the hard RFC 7807 logout split:

- Auth surface `401` follows the auth error path. Show the auth error view. Do not log out.
- Authed surface `401` means the active session is invalid. Log out.
- `403` never logs out, on any surface.

Keep this split in layout error boundaries, TanStack Query error handling, and any future
`AppErrorView` wrappers.

## Product UI Design Preferences (owner-ratified)

These are standing design decisions Radan has ratified across the front-2 parity review
(rounds 1–6, 2026-07). They are **defaults, not per-screen requests** — apply them to every new
surface without waiting to be told. `docs/front-2-migration/parity-contract.md` is the dated
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
