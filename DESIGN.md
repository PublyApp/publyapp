# DESIGN.md — PublyApp Product Design Language

This is the single source for the product's visual and interaction language: tokens, the
`components/ui/*` component layer, interaction conventions, dark mode, i18n/copy rules, and the
guards that enforce them. It is written for a designer or an agent who must produce a new screen
that looks and behaves like the rest of the product **without reading the code**.

Every statement is backed by a file in this tree (cited inline as `— source: <path>`). Where the
code is internally inconsistent, see [Known inconsistencies](#known-inconsistencies). No design
principle here is invented; anything not traceable to a source is omitted.

The normative behavior for `apps/front` is in `AGENTS.md`, `docs/guides/front/conventions.md`, and
the guards under `apps/front/scripts/` plus `apps/front/src/styles/*.test.ts`. This document
distils them. `apps/old-front` is retired and is **not** a pattern source.
— source: `AGENTS.md` (Frontend Coding Standards), `docs/guides/front/conventions.md`

---

## 1. Identity

### Name and mark
- Product name: **PublyApp**.
- Brand mark: `docs/assets/publyapp-mark.svg` — a 72×72 viewBox `0 0 24 24` two-path glyph with
  `aria-label="PublyApp"`. The path geometry is fixed; colour comes from CSS, not the file:
  - Muted path: `#6b7280` (light) / `#9ca3af` (dark, via `prefers-color-scheme: dark`).
  - Primary path: `#111827` (light) / `#f9fafb` (dark).
  The mark carries **no** product yellow; yellow is the app-chrome accent, not the wordmark.
  — source: `docs/assets/publyapp-mark.svg`

### Tone of voice for UI copy
Derived from `packages/shared-ts/src/lib/i18n/json/common.{en,fr}.json`:
- **Sentence case** is the default for status, field, and message strings: `"User has no email"`,
  `"Uploads are not supported yet."`, `"No matching companies found"`, `"Verification link"`.
- **Title Case** for navigation and noun labels: `"All tenants"`, `"Pending"`, `"Active"`,
  `"Suspended"`, `"Staff"`, `"Tenants"`, `"Profiles"`, `"Dashboard"`.
- **Imperative verbs** for actions/buttons: `"Save"`, `"Edit"`, `"Delete"`, `"New"`, `"Preview"`,
  `"Clear search"`, `"Add first company"`.
- Ellipsis on in-flight states: `"Loading..."`.
- Copy is terse; labels are nouns or verb phrases, not full sentences, except short explanatory
  strings (e.g. `"Uploads are not supported yet."`).
- French is a maintained translation (`common.fr.json`, `response-message.fr.json`, `zod.fr.json`),
  not a fallback.
— source: `packages/shared-ts/src/lib/i18n/json/common.en.json`, `common.fr.json`

### i18n rules
- UI strings live in three namespaces mirrored per locale: `common`, `response-message`, `zod`.
  — source: `packages/shared-ts/src/lib/i18n/json/`
- **Never translate `response-message` keys by hand at a mutation call site.** Derive user-facing
  error text through `getFailureMessage(toApiFailure(error), ...)`; the `publy/no-manual-response-message-translation`
  lint rule enforces this. — source: `AGENTS.md` (Frontend Coding Standards), `docs/guides/frontend-error-handling.md`
- Field-level validation messages come from the `zod` namespace via Zod schemas, not ad-hoc strings.
  — source: `AGENTS.md` (C#/JS conventions), `docs/guides/front/conventions.md` (forms)
- Rendering and auth chrome are SSR; authenticated app surfaces are CSR (`ssr: false`). i18n resource
  loading is a `createServerFn` concern only. — source: `docs/guides/front/conventions.md` (Rendering Strategy, Server-Function Boundary)

---

## 2. Foundations

### Colour tokens
All colours are CSS custom properties declared in `apps/front/src/styles/app.css` under `:root`
(light) and `html.dark` (dark), with a `@theme inline` bridge to Tailwind v4 utility names
(`bg-background`, `text-foreground`, `bg-primary`, `border-border`, `ring-ring`, etc.).
— source: `apps/front/src/styles/app.css` (`:root`, `html.dark`, `@theme inline`)

**Semantic groups** (light value → dark value; both columns generated from `apps/front/src/styles/app.css`):

| Group | Light | Dark | Notes |
| --- | --- | --- | --- |
| Primary (chrome accent) | `--publy-primary #fdc700` | `#f0bd00` | Yellow. |
| Primary foreground | `--publy-primary-foreground #733e0a` | `#1a0d00` | Solid-button text on `--publy-primary`. |
| Primary soft | `#fffbeb` | `#2a2400` | Chips / soft pill background. |
| Primary soft foreground | `#733e0a` | `#fbbf24` | Text on primary-soft; the value swaps to yellow in dark. |
| Background / surface | `#ffffff` | `#18181b` | `--publy-background`, `--publy-surface` identical in both themes. |
| Surface raised | `#fafafa` | `#1f1f23` | Overlay/popup base canvases. |
| Surface muted | `#f4f4f5` | `#27272a` | `--publy-surface-muted` (secondary/accent fills). |
| Surface hover | `#fafafa` | `#2f2f33` | |
| Surface active | `#ececee` | `#37373d` | |
| Foreground | `#18181b` | `#fafafa` | Body text. |
| Foreground secondary | `#3f3f46` | `#d4d4d8` | Real content text. |
| Foreground muted | `#71717a` | `#a1a1aa` | Secondary body text (4.5:1 floor — see Contrast). |
| Foreground subtle | `#a1a1aa` | `#71717a` | ~2.5:1; **non-text roles only** (placeholders, eyebrows, separators, decorative icons). |
| Border | `#e4e4e7` | `rgba(255,255,255,0.1)` | Hairline ring colour; full opacity in light. |
| Border strong | `#d4d4d8` | `rgba(255,255,255,0.15)` | Used by `outline` button variant (unconditional, both themes). |
| Danger | `#dc2626` | `#f87171` | `--publy-danger`; destructive actions/alerts. |
| Success | `#047857` | `#34d399` | |
| Warning | `#b45309` | `#fbbf24` | |
| Focus ring | `#a16207` | `#facc15` | `--publy-focus-ring`. |
| Disabled | `#d4d4d8` | `#52525b` | |

The avatar identity palette `--publy-avatar-1…8` (teal, violet, pink, rose, orange, sky, cyan,
magenta) is **theme-invariant** (no `html.dark` counterpart) — WCAG-pinned against fixed white
initials text. — source: `apps/front/src/styles/app.css`, `apps/front/scripts/guards/check-design-system.mts` (`THEME_INVARIANT_TOKENS`), `apps/front/src/styles/avatar-fallback-contrast.test.ts`

Marketing-specific accent `--publy-marketing-eyebrow-accent` (`#8a6a1f` light / `#d97706` dark) is
the only handoff-specified eyebrow colour; do not lighten it. — source: `apps/front/src/styles/app.css`

### Typography
- Fonts: **Geist** (sans, weights 400/500/600) and **Geist Mono** (weights 400/500), self-hosted
  woff2 under `apps/front/public/fonts/geist`, with system fallbacks. — source: `apps/front/src/styles/app.css` (`@font-face`, `--publy-font-sans`, `--publy-font-mono`)
- UI text is dense: the app shell and table body use **13px** (`md:text-[13px]`); badges 11–12px;
  section headings 14–15px; page/modal titles use `text-2xl font-semibold` for dialogs and
  `text-xl font-semibold` for cards. — source: `apps/front/src/styles/app.css` (font-size rules), `apps/front/src/components/ui/card.tsx`
- No bespoke type scale beyond Tailwind utilities mapped to the `--publy-font-*` tokens.

### Spacing & radius
- Radius scales with control height. Canonical tokens: `--publy-radius-sm 0.375rem`, `--publy-radius-md 0.5rem`,
  `--publy-radius-input 10px`, `--publy-radius-chip 8px`, `--publy-radius-small-control 10px`,
  `--publy-radius-medium-control 12px`, `--publy-radius-control 14px`, `--publy-radius-menu-item 9px`,
  `--publy-radius-circular 999px`. — source: `apps/front/src/styles/app.css`
- Concrete control radii (from `button.tsx` / `input.tsx`): buttons `xs 8 / sm 10 / default 12 / lg 14`;
  inputs/selects `10px`; chips/badges `8px`; dropdown/context menu items `9px`; drawer radius `28px`
  (`--publy-modal-radius`). — source: `apps/front/src/components/ui/button.tsx`, `input.tsx`, `badge.tsx`, `dropdown-menu.tsx`, `app.css`
- **`rounded-full` / `999px` is forbidden everywhere except**: avatars, the 36px topbar icon buttons
  (`.app-shell-topbar-action-btn`), and the profile icon-picker's pencil-pin corner badge. Enforced
  by rule `no-rounded-full-or-999-radius` with an exact-selector allowlist. — source: `apps/front/scripts/guards/check-design-system.mts` (`ROUNDED_RULE_ID`), `docs/guides/front/conventions.md` (Corner radius)

### Elevation & z-index ladder
- **Flat surfaces, crisp hairlines.** Cards/sections use a 1px box-shadow ring
  (`box-shadow: var(--publy-shadow-ring)` = `0 0 0 1px var(--publy-border)`), never a drop-shadow or
  elevation. An element must not carry both a real `border` and the ring. — source: `docs/guides/front/conventions.md` (Elevation & borders), `app.css` (`--publy-shadow-ring`)
- Popups use real shadows: `--publy-shadow-menu`, `--publy-shadow-modal`, `--publy-shadow-drawer`
  (re-based on black in `html.dark`). — source: `app.css`
- **Z-index ladder** (every `z-*` utility must route through these; see Guards):
  `raised 10` · `shell-topbar 20` · `selection-bar 40` · `overlay 70` · `drawer-surface 80` ·
  `menu 100` · `select 110` · `toast 120`. — source: `docs/guides/front/z-index-guard.md`, `app.css` (`--publy-z-*`)

### Motion
- Tokens: `--publy-motion-ease cubic-bezier(0.22,1,0.36,1)`, `--publy-motion-fast 120ms`
  (colour), `--publy-motion-medium 240ms` (layout). — source: `app.css`
- Marketing landing adds two durations: `--publy-landing-motion-press 50ms` (direct-manipulation
  feel on press) and `--publy-landing-motion-entrance 560ms` (hero/scroll-reveal arrival). These are
  theme-invariant. — source: `app.css`, `docs/records/2026-08-01-spec-marketing-landing-bands.md`
- No bespoke easing curves outside these tokens.

### Focus rings
- `focus-visible` uses a ring at `--publy-focus-ring` (`focus-visible:ring-ring`), with the width set
  per component in its `cva`/class string:
  - **3px** (`focus-visible:ring-3`): `button.tsx`, `badge.tsx` (`ring-[3px]`), `input.tsx`,
    `textarea.tsx`, `select.tsx`, `switch.tsx`.
  - **2px** (`focus-visible:ring-2`): `checkbox.tsx`.
  The ring colour is contrast-guarded to ≥3:1 against its surface (the focus-indicator floor):
  token math lives in the vitest guard, and the RENDERED indicator is proven in a real browser
  (real primitives, real compiled CSS, real cascade) by `focus-ring-cascade.spec.ts`. — source:
  `apps/front/src/components/ui/button.tsx`, `badge.tsx`, `input.tsx`, `textarea.tsx`,
  `select.tsx`, `switch.tsx`, `checkbox.tsx`, `apps/front/src/styles/focus-ring-contrast.test.ts`
  (tokens), `apps/front/e2e/focus-ring-cascade.spec.ts` (rendered ring)
- Destructive/validation states keep the compliant base ring (`aria-invalid` adds a low-opacity
  destructive ring that must not replace the compliant one). — source:
  `apps/front/src/styles/focus-ring-contrast.test.ts`

### Contrast floors
- Body text: **4.5:1** against its surface (enforced for avatar fallback initials, drawer
  descriptions, and marketing text pairs). — source: `apps/front/src/styles/avatar-fallback-contrast.test.ts`, `drawer-description-contrast.test.ts`, `marketing-contrast.test.ts`
- Large text / focus indicators / UI component graphics: **3:1**. — source: `focus-ring-contrast.test.ts`, `e2e/focus-ring-cascade.spec.ts`, `z-index-guard.md`
- `--publy-foreground-subtle` (~2.5:1) is a **known intentional failure** and is legitimate only for
  non-text or de-emphasised roles (placeholders, eyebrows, helpers, inline metadata/separators). It
  must never be standalone body-size readable text. — source: `docs/guides/front/conventions.md` (Subtle text token), `app.css`

---

## 3. Component layer (`apps/front/src/components/ui/*`)

The component layer wraps `@base-ui/react` headless primitives with `class-variance-authority`
(`cva`) variants and `tailwind-merge` (via the `cn()` helper). `shadcn` is a dev-time
scaffolding/CSS-import dependency only, not a runtime library. — source: `docs/guides/front/conventions.md` (Base UI and Tailwind), `apps/front/src/lib/utils.ts` (`cn`)

**Conventions**
- Every component sets a `data-slot="<name>"` attribute for testing/style targeting.
- Variants are declared with `cva(...)`; the resolved class string is composed through `cn(base,
  variants, className)`, so a caller's `className` can override via `tailwind-merge`.
- Do **not** reach into Base UI protected/internal APIs. — source: `AGENTS.md`, `conventions.md`

**Component families** (purpose · `cva` variants · key tokens read):

| Component | Purpose | Variants | Tokens read |
| --- | --- | --- | --- |
| `button.tsx` | Primary action control | `variant`: default/outline/secondary/ghost/destructive/link · `size`: default/xs/sm/lg/icon/icon-xs/icon-sm/icon-lg | `--publy-radius-*-control`, `--publy-destructive-soft`, `--publy-border-strong`, `ring-ring` |
| `badge.tsx` | Status / count chip | `variant`: default/secondary/destructive/outline/ghost/link | `bg-primary`, `bg-destructive/10`, `border-border` |
| `card.tsx` | Sectioned surface (no cva; `size` prop) | `size`: default/sm; slots: Header/Title/Description/Action/Content/Footer | `--publy-shadow-ring`, `--publy-radius-card` |
| `input.tsx` / `textarea.tsx` | Text entry | none (utility classes) | `--publy-radius-input`, `--publy-shadow-input`, `ring-ring`, `--publy-destructive-soft` |
| `select.tsx` | Trigger-anchored dropdown select | none; `size` data attr | `--publy-radius-input`, `ring-ring`; `alignItemWithTrigger` defaults `false` |
| `dropdown-menu.tsx` | Menu / context menu / submenu | item radius 9px; `showCheckbox` prop | `--publy-radius-menu-item`, `bg-muted` (hover) |
| `switch.tsx` / `checkbox.tsx` | Toggles | `size`: default/sm | `--publy-radius-small-control`, `bg-primary` (checked) |
| `tabs.tsx` | Tab list | `variant`: default/line | `bg-muted`, `border-border` |
| `table.tsx` | Data grid primitives (`TableContainer`, etc.) | none | `--publy-table-header`, `--publy-row-border` |
| `skeleton.tsx` | Loading placeholder | none (allows `rounded-full` for circular shimmer) | surface-muted |
| `tooltip.tsx` | Hover/focus hint | none | `bg-popover` |
| `drawer.tsx` / `confirm-dialog.tsx` | Dialog surfaces (drawer = side panel) | none | `--publy-drawer-width 460px`, `--publy-modal-radius`, `--publy-shadow-drawer` |
| `state-view.tsx` / `state-surface.tsx` | Empty / error / loading primitives | none | tone colour via `--publy-foreground-muted`/`--publy-danger`/`--publy-primary` |
| `search-input.tsx` | List search field | `compact` / `table` | `--publy-data-table-search-input` |
| `label.tsx` | Form label | none | `text-foreground` |
| `loading-spinner.tsx` | Inline spinner | none | `animate-spin` (allowed `rounded-full`) |
| `detail-layout.tsx` | Detail-view grid + DangerZone | none | `--publy-danger-zone-*` |
| `product-page.tsx` | `PageHeader`, `StatusPill`, `DetailRow`, `PillTabs` | none | status tones |
| `stat-card.tsx` | Metric tile | none | `--publy-stat-card-icon` |
| `icon-color-picker.tsx` | Icon+colour chooser | none | `--publy-radius-circular` (pencil pin) |
| `copy-button.tsx` | Copy-to-clipboard | none | `IconCheck`/`IconCopy` |
| `toaster.tsx` | Sonner host (`AppToaster`); mounts the global toast surface | none | `.publy-toast-*` variants (via `toast-variants.ts`) |
| `toast-variants.ts` | Toast variant tokens/tints (success/error/info/warning/loading/default) | none | semantic alert tokens |
| `status-tone.ts` | Status→tone map + `StatusPillTone` type for status pills | none | danger/info/neutral/primary/success/warning |
| `initials-avatar.tsx` | `EntityAvatar`, `AvatarStack`, `BrandTile` (org/people aggregations) | none | `--publy-avatar-1…8`, `--publy-avatar-foreground` |
| `avatar.tsx` / `initials-avatar.tsx` / `person-avatar.tsx` | Identity surfaces | `PersonAvatar` sizes: default/xs/sm/md/lg | `--publy-avatar-1…8`, `--publy-avatar-foreground` |

Avatars: `Avatar`/`AvatarImage`/`AvatarFallback` is the neutral primitive; `PersonAvatar`/`EntityAvatar`
applies the deterministic name-hashed `--publy-avatar-N` palette; `BrandTile`/`AvatarStack` are org/people
aggregations. **front has no `<Image>` primitive** — only raw `<img>` for wordmark/logo and inline SVGs.
— source: `AGENTS.md` (Entity images and avatars), `apps/front/src/components/ui/avatar*.tsx`, `person-avatar.tsx`

---

## 4. Patterns

### App shell & navigation
- Authenticated surfaces use a rail + secondary panel + topbar shell. Rail width `--publy-shell-rail-width 49px`,
  panel `--publy-shell-panel-width 272px`, topbar `--publy-shell-topbar-height 64px`. — source: `app.css`
- Navigation is always a TanStack `<Link>`, **never** a raw `<a href>` (hard reload tears down the SPA
  and drops the query cache). — source: `docs/guides/front/conventions.md` (Navigation & layout)
- **Breadcrumbs** are required: every route declares `staticData.crumbs` (`'shell'` or a
  `(params) => CrumbSpec[]` function). A route with a `$param` segment must name one `entity` crumb
  per segment, in left-to-right order. — source: `docs/guides/front/conventions.md` (Breadcrumb & Route Contract)
- Page-top back-links use `.publy-back-link` (arrow `IconArrowLeft`, not chevron). Error/not-found
  recovery CTAs are `buttonVariants({ variant: 'outline' })` instead. — source: `conventions.md` (Back navigation)
- A resource's sections are **path segments, not `?tab=`**. — source: `conventions.md`

### List pages
- Use the `DataTable` primitive. **First column is the entity link**: the whole cell is a `<Link>`
  (`no-underline`) wrapping icon/avatar + name; the name span carries `.publy-record-link` (underlines
  on hover). The ⋯ row-actions button is horizontally centered. — source: `conventions.md` (Tables)
- **Tables scroll inside the table, never the page.** A top-level list route uses `.publy-page-fill`
  (`flex h-full min-h-0 flex-col`) so the table body's own `overflow-auto` scrolls while the toolbar
  and cursor footer stay pinned. A `DataTable` inside a detail-tab shell must get the same
  bounded-height chain (`bodyScroll="contained"`). Card grids (e.g. Profiles tab) use page-scroll. — source: `conventions.md` (Tables)
- **URL state is snake_case**: `q`, `sort_id`, `sort_order`, `cursor`, `size`. Convert between
  internal state and URL at explicit parse/serialize boundaries. — source: `conventions.md` (URL State), `AGENTS.md` (API contract naming split)
- Cursor/keyset pagination (not offset) for list data. — source: `AGENTS.md` (Cursor/keyset pagination guide)

### Selection mode & bulk actions
- Row selection renders a **floating bottom-center action bar** (`FloatingSelectionBar`), portalled to
  `document.body` (`.app-shell-main` sets `container-type: inline-size`, which would trap a non-portalled
  `position: fixed` bar). The bar uses dedicated inverted `--publy-selection-bar-*` tokens (dark pill
  on light theme, light pill on dark). — source: `conventions.md` (Selection mode & bulk actions), `app.css`
- **Bulk-action menu items always render** — never `disabled`, never conditionally hidden by per-row
  eligibility. Ineligible clicks show an i18n toast. The trigger gates on `BULK_ACTION_MAX_COUNT`. — source: `AGENTS.md` (Bulk-action items), `docs/guides/bulk-action-ux-conventions.md`
- Card-grid selection: the checkbox is **absolutely positioned** in the card's top-left corner; a
  selected card also gets an amber ring (`--publy-primary`). — source: `conventions.md`

### Drawers & dialogs
- Drawers open as a side panel (`--publy-drawer-width 460px`, `--publy-shadow-drawer`); confirm dialogs
  are centred modals (`--publy-modal-radius 28px`). Both read overlay/surface tokens.
- **Description contrast**: drawer/description text must meet 4.5:1 on its surface, enumerated by the
  drawer-description contrast guard (see Guards). The pinned description selectors are
  `.publy-drawer-description`, `.publy-field-switch-description`, `.publy-danger-zone-row-description`.
  — source: `apps/front/src/styles/drawer-description-inventory.ts`, `drawer-description-contrast.test.ts`
- A drawer over a list opens with a PUSH (Back closes it and restores the list entry); every other
  list search write uses `replace: true`. — source: `conventions.md` (Route-Local Private File Naming / drawer-open flags)

### Forms
- React Hook Form + Zod; go through the front form/field wrappers, not raw `register()` on inputs.
  — source: `AGENTS.md` (Frontend Coding Standards)
- Field errors render inline and exhaustively (every field error or a visible root/summary fallback);
  handled 422 validation produces **no duplicate toast**. — source: `conventions.md` (Mutation Feedback Ownership)

### Toasts
- Sonner, `unstyled: true`, presentation owned by `components/ui/toaster.tsx` + `lib/mutation-toast.ts`.
  Variant tints come from the same semantic alert tokens as inline alerts (`.publy-toast-success/error/info/warning/loading/default`).
  — source: `app.css` (`.publy-toast`), `apps/front/src/components/ui/toast-variants.ts`, `conventions.md`
- Each toast variant's contrast is measured live in the browser (see Guards). `richColors` is off
  because Sonner's un-layered stylesheet would defeat the app cascade. — source: `app.css`, `e2e/toast-contrast.spec.ts`

### Empty / error / loading states
- **Every failure state shows its cause in plain words and the next action; never a bare "something went wrong".** This is the owner's product UI rule (decision 2026-08-22, spec `docs/records/2026-08-22-spec-epic-d-publishing-scheduling.md` §1.7, on branch `docs/spec-epic-c-social-accounts`). A failed or paused state names what went wrong in one short sentence and offers the concrete recovery action (Retry / Reconnect the account / Reschedule), not a generic error string. — source: owner decision 2026-08-22, `docs/records/2026-08-22-spec-epic-d-publishing-scheduling.md` §1.7
- One shared primitive `state-view.tsx` (`StateView`, `StateSurface`, `ErrorStateSurface`,
  `NoMatchStateSurface`) at a **single visual scale**: 48px tone-coloured glyph (no disc/ring/box),
  matching title/description/action sizing. Full-page states use `h1`; in-list states use a non-`h1`.
  — source: `conventions.md` (Error & empty states), `apps/front/src/components/ui/state-view.tsx`
- Error views are **flat** (no card/ring/shadow). A 500 offers **Retry + Go to home**; retry must
  refetch client-side, never `window.location`. — source: `conventions.md`
- A malformed/non-GUID id in a detail route renders the **404 not-found view**, not a distinct 400. — source: `conventions.md` (Not-found vs bad-request)
- Loading uses `skeleton.tsx` (and `loading-spinner.tsx` inline). Never ad-hoc conditional rendering. — source: `AGENTS.md`

### Dark mode
- Toggled via `ui-store` and the `.dark` class on `<html>` (`@custom-variant dark (&:is(.dark *))`).
  The toggle is **instant** (no flash). Dark values are authored at implementation time from the
  `gray-ui-csm` template; light is the design canvas. — source: `conventions.md` (Navigation & layout), `app.css` (`@custom-variant dark`), `docs/records/2026-07-09-spec-front-2-gray-ui-stack-migration.md`
- Theme-invariant tokens (avatar palette, auth panel, chrome bevel) intentionally do **not** swap. — source: `check-design-system.mts` (`THEME_INVARIANT_TOKENS`)


### Mutation feedback
- A single global owner (`router.tsx` `MutationCache`) emits one success toast / one general failure
  toast. Query failures stay persistent. Aborts and mutation 401s are silent. — source: `conventions.md` (Mutation Feedback Ownership)

---

## 5. Marketing surfaces

The marketing chrome lives in `apps/front/src/components/marketing/`, mounted by
`layouts/marketing-layout.tsx` for every non-authenticated, non-auth path (including root not-found
and error branches). — source: `conventions.md` (Marketing Surfaces)

- **Two container roles, never a third width**: chrome that is scanned (header + mega panel) =
  `--publy-container-chrome 1280px`; content that is read (body, social-proof, CTA band, footer) =
  `--publy-container-reading 1152px`. Go through `MarketingContainer`; do not re-declare widths inline. — source: `conventions.md`, `app.css`
- Header is sticky with a static bottom hairline (no scroll elevation, no hide-on-scroll); active nav
  = 2px `--publy-primary` underline + `--publy-surface-hover` fill. Height is the single
  `--publy-header-height 64px` (56px below 768). — source: `conventions.md`, `app.css`
- **No dead ends**: `marketing-nav.ts` entries carry an optional `to`; a route-less entry is data,
  dropped by renderers. `marketing-nav.test.ts` checks every declared destination against the real
  route tree. — source: `conventions.md`
- **Contrast is measured, not assumed**: `styles/marketing-contrast.test.ts` pins the pairs the shell
  paints in both themes; small text on a muted surface uses `--publy-foreground-secondary`, not
  `--publy-foreground-muted`. — source: `conventions.md`, `apps/front/src/styles/marketing-contrast.test.ts`
- **Landing bands** (spec `docs/records/2026-08-01-spec-marketing-landing-bands.md`): the landing page keeps its
  hero → claims → tour → bento → timeline → FAQ → closing flow; new bands (pricing always-on;
  customer-logo and social-proof behind `FEATURES.marketing.customerLogos` / `.socialProof`, default
  off) are inserted immediately before the FAQ. Off bands contribute **no** DOM. All copy uses
  `landing-*` i18n keys; no new CSS tokens, raw colours, inline styles, images, avatars, or personal
  names. — source: `docs/records/2026-08-01-spec-marketing-landing-bands.md`
- Cookie consent fails closed (absent/malformed/old → "no optional cookies" + asks again); Accept and
  Reject are equal-sized; preferences open a right-side drawer, not a centred modal; categories use
  squared `Checkbox` (a fully-rounded switch track is guard-banned). — source: `conventions.md`
  (Cookie consent)

---

## 6. Guards that enforce this document

Each guard is machine-checked. Run them with `pnpm --filter front …` (they run inside `just ci-front`
and `pnpm --filter front test`).

| Guard (file) | Rule it enforces | How to run | What red looks like |
| --- | --- | --- | --- |
| `scripts/guards/check-design-system.mts` | Enforces (by `ruleId`): `no-heroui-import`, `no-mui-import`, `no-lucide-import`, `no-heroui-color-scale`, `no-raw-visual-color` (hex/rgb/hsl/`color-mix` outside tokens), `no-native-product-select`, `no-prototype-icons`, `no-icon-font-classes`, `no-native-confirm`, `no-important-foundation`, `no-rounded-full-or-999-radius` (exact-selector allowlist), `no-non-confirmation-centered-overlay`, `no-dialog-popup-primitives`, `no-raw-internal-anchor`, `no-single-star-route-glob`, `token-theme-parity`, `token-must-be-declared`, `status-filter-checkbox-contract`, `stale-guard-debt`, `suppression-inventory-drift`. | `pnpm --filter front check:design-system` | A listed `ruleId` (e.g. `no-rounded-full-or-999-radius`, `no-raw-visual-color`, `token-theme-parity`) with the offending file/line. |
| `scripts/guards/check-zindex-guard.mts` (+ `.test.mts`) | Every `z-*` utility routes through `--publy-z-*`; no raw `z-10`/`z-50`/`[z-index:5]`; scale defined only in `:root` of `app.css`. | `pnpm --filter front check:zindex` (CLI) or `pnpm --filter front test` (suite) | A raw z-index candidate or an emitted `z-index:` not via `var(--publy-z-…)`; a second reachable scale definition. |
| `src/styles/focus-ring-contrast.test.ts` | Focus ring resolves to ≥3:1 against its surface for every Button/Badge variant (incl. `aria-invalid`). | `pnpm --filter front test` | A variant whose resolved ring colour is below `CONTRAST_FLOOR = 3.0`. |
| `src/styles/avatar-fallback-contrast.test.ts` | Each `--publy-avatar-N` bg meets 4.5:1 with white initials, both themes. | `pnpm --filter front test` | A palette token below `SMALL_TEXT_CONTRAST_FLOOR = 4.5`. |
| `src/styles/drawer-description-contrast.test.ts` (+ `e2e/drawer-description-contrast.spec.ts`) | Every drawer description selector meets 4.5:1; inventory matches real call sites. | `pnpm --filter front test` + Playwright | An undeclared `*-description` class, or a listed consumer missing from `drawer-description-inventory.ts`. |
| `e2e/toast-contrast.spec.ts` | Each `toastVariantClassNames` variant's glyph pixels meet contrast after Chromium resolves the cascade. | `pnpm --filter front exec playwright test e2e/toast-contrast.spec.ts` | A measured variant whose text/background pair fails the floor; a variant added to `toast-variants.ts` but not measured. |
| `src/styles/marketing-contrast.test.ts` | Marketing shell text pairs meet contrast in both themes. | `pnpm --filter front test` | A pinned pair below its floor. |

— source: `apps/front/scripts/guards/check-design-system.mts`, `check-zindex-guard.mts`, `apps/front/src/styles/*.test.ts`, `e2e/toast-contrast.spec.ts`

---

## 7. How to change the design

- **Tokens** live in `apps/front/src/styles/app.css` under `:root` and `html.dark`, plus the `@theme inline`
  bridge. Add a token in **both** themes (the token-theme-parity guard fails if a token is declared in
  only one block). Theme-invariant tokens (avatar palette, auth panel, chrome bevel) must be added to
  `THEME_INVARIANT_TOKENS` in `scripts/guards/check-design-system.mts` with a reason, and must **not** get an
  `html.dark` counterpart. — source: `app.css`, `check-design-system.mts`
- **Add a component**: create it under `apps/front/src/components/ui/`, wrap a Base UI primitive, set a
  `data-slot`, declare `cva` variants, compose with `cn()`. Prefer adding to the existing primitive
  layer over one-off route CSS. Do not import MUI/old-front primitives. — source: `conventions.md`, `AGENTS.md`
- **Extend a guard** when you add a new invariant (new radius exception → `ROUNDED_RULE_ID` allowlist;
  new z-tier → add to `:root` scale only; new toast variant → `toast-variants.ts` + a browser measurement).
  Guards fail closed: an unregistered new entity/selector is reported, not silently skipped. — source: `check-design-system.mts`, `check-zindex-guard.mts`, `toast-variants.ts`
- **Approval**: design-language changes are owner-ratified by Radan. New standing decisions go into
  `docs/guides/front/conventions.md` (Product UI Design Preferences); this file is the human/agent
  distillation and must be updated to stay in sync. — source: `conventions.md` (Product UI Design Preferences), `AGENTS.md`

---

## 8. Known inconsistencies

These are factual observations from the tree; this document reports them rather than picking a side.

1. **UI copy case is mixed.** Navigation/noun labels use Title Case (`"All tenants"`, `"Pending"`),
   while status/message strings use sentence case (`"User has no email"`, `"Uploads are not supported yet."`).
   There is no single enforced case rule in the tree — both coexist in `common.en.json`.
   — source: `packages/shared-ts/src/lib/i18n/json/common.en.json`
2. **`conventions.md` references `apps/front` while the archive design references `apps/front-2`.**
   The gray-UI migration design (`docs/records/2026-07-09-spec-front-2-gray-ui-stack-migration.md`)
   describes the stack that became `apps/front`; its component list predates the current `components/ui/*`
   set and is historical, not normative. — source: `docs/records/2026-07-09-spec-front-2-gray-ui-stack-migration.md`, `AGENTS.md`
3. **`--publy-foreground-subtle` is a documented intentional contrast failure** (2.5:1), permitted only
   for non-text roles, yet three classes (`publy-type-helper`, `publy-field-helper`, `publy-type-eyebrow`)
   are pinned to it by the drawer-description guard as intentional exceptions. The token is therefore
   both "fails the floor" and "legitimate in specific places" — the guard records the colour, not 4.5:1
   conformance. — source: `conventions.md` (Subtle text token), `drawer-description-contrast.test.ts`
4. **Radius token naming is partially duplicated.** `--publy-radius-button`/`--publy-radius-card` both
   alias `--publy-radius-control`, while `--publy-radius-sm/md` are independent of the control scale; some
   components read a `--publy-radius-*-control` token directly and others read the alias. Both spellings
   resolve to the same values today but are not centrally unified. — source: `app.css`, `button.tsx`, `card.tsx`
5. **The z-index guard allows exactly one raw `z-index: 5`** (the sticky `.publy-data-table thead`),
   bound to its full ancestor chain and occurrence count. This is a sanctioned exception to the
   "everything routes through the scale" invariant, not a free pass — moving or duplicating the rule reds.
   — source: `docs/guides/front/z-index-guard.md` (Out of scope)
