# Cross-surface ErrorView refactor — design spec

**Date:** 2026-05-07
**Issue:** [#371 — Phase 6: unified cross-surface ErrorPage refactor (auth + dashboard)](https://github.com/radandevist/publyapp-5/issues/371)
**PR scope:** single PR, dashboard + auth surfaces only — marketing intentionally untouched

## Goal

Eliminate ~840 lines of duplicated scaffolding across the seven `apps/front/src/components/error/*-view.tsx` files by extracting a single slot-composition shell (`AppErrorView`), apply a theme-aligned visual refresh to the dashboard error views, and add a missing auth-layout `ErrorBoundary` so auth-flow render exceptions and loader throws stop falling through to the generic root boundary.

`MarketingErrorView` is intentionally **not** migrated — marketing's design language (gradient numerals, glass card, ambient glows) differs from the dashboard's by design, and forcing them into a shared shell would either bloat the shell or compromise the visual.

## Scope decisions (locked)

| # | Decision | Rationale |
|---|---|---|
| 1 | Refactor + dashboard visual refresh; leave `MarketingErrorView` alone | Two distinct surfaces, two distinct visual languages |
| 2 | Slot-composition API on the shell; existing wrappers stay as thin wrappers | Backward-compatible for all 26 call sites; matches current per-view differences |
| 3 | Auth-layout `ErrorBoundary` covers 401 / 404 / network failure / render-exception fallthrough | Maps to real failure modes in `auth/login`, `auth/signup`, `auth/verifyEmail`, `auth/resetPassword`, `auth/acceptInvitation` |
| 4 | No OAuth-cancelled stub | No OAuth callback route exists in the codebase yet — would be speculative code |

## Current state of the world (pre-refactor)

| Surface | catch-all 404 | ErrorBoundary | Notes |
|---|---|---|---|
| Marketing (`marketing-layout.tsx`) | ✓ `MarketingNotFoundPage` | ✓ uses `MarketingErrorView` | leave alone |
| **Auth (`auth-layout.tsx`)** | ✗ | **✗ — falls through to root** | **gap closed in this PR** |
| Authed parent (`authed-layout.tsx`) | n/a | ✓ rich `ApiFailure`-aware mapping | already correct, untouched |
| Staff (`staff-layout.tsx`) | ✓ `StaffNotFoundPage` (uses `NotFoundView`) | inherits from Authed | only inherits visual refresh |
| Tenant (`tenant-layout.tsx`) | ✓ `TenantNotFoundPage` (uses `NotFoundView`) | inherits from Authed | only inherits visual refresh |
| Root (`root.tsx`) | n/a | ✓ `400/403/404 → View*`, default `View500` | untouched |

## Architecture

### New module

`apps/front/src/components/error/app-error-view.tsx` — pure structural shell, theme-aligned, MUI-only.

### File layout after refactor

```
apps/front/src/components/error/
├── app-error-view.tsx         (NEW — the shared shell)
├── 400-view.tsx               (thin wrapper, exports View400)
├── 401-view.tsx               (thin wrapper, exports View401)
├── 403-view.tsx               (thin wrapper, exports View403)
├── 500-view.tsx               (thin wrapper, exports View500)
├── not-found-view.tsx         (thin wrapper, exports NotFoundView)
├── generic-error-view.tsx     (thin wrapper, exports GenericErrorView)
└── tenant-suspended-view.tsx  (thin wrapper, exports ViewTenantSuspended)
```

### Backward compatibility

All 26 existing call sites of `<NotFoundView />`, `<View400 />`, `<View401 />`, `<View403 />`, `<View500 />`, `<GenericErrorView />`, `<ViewTenantSuspended />` continue to work unchanged. No call-site migration in this PR.

## `AppErrorView` shell API

### Props

```ts
type AppErrorViewProps = {
  // Visual identifier — exactly one of `numeral` or `icon` must be provided.
  numeral?: string;                 // e.g. "404", "500"
  icon?: IconifyName;               // e.g. "solar:shield-keyhole-bold-duotone"

  // Required
  title: string;

  // Optional — wrappers may render their body content via the
  // `errorDetails` slot when inline JSX is needed (see ViewTenantSuspended).
  description?: string;

  // Optional content
  actions?: ReactNode;              // one or more <Button> elements
  errorDetails?: ReactNode;         // optional debug-style block (used only by GenericErrorView)

  // Visual tone — drives icon container bg + numeral color via theme.palette[tone]
  // Required (no default). Each wrapper picks the right tone; see the
  // wrapper migration table for the canonical mapping.
  tone: 'primary' | 'error' | 'warning';

  // Layout wrapping (preserves existing API on wrappers)
  withLayout?: boolean;             // default true → wraps in SimpleLayout
};
```

### Internal anatomy

Centered vertical Stack inside a `Container`:

1. **Icon-container OR numeral** — visual identifier
   - Numeral: `Typography variant="h1"` with `color: theme.palette[tone].main`, `fontSize: { xs: '6rem', md: '8rem' }`, `fontWeight: 800`
   - Icon: rendered inside a circular `Box` with `bgcolor: theme.palette[tone].lighter`, `width/height: 120`; the `Iconify` is `width={64}` with `color: theme.palette[tone].main`
2. **Title** — `Typography variant="h3"`, neutral `text.primary`, centered
3. **Description** — `Typography` with `color: 'text.secondary'`, `maxWidth: 480`, centered, `mx: 'auto'`
4. **Optional `errorDetails`** — slot exposed for `GenericErrorView`
5. **Actions** — `Stack direction={{ xs: 'column', sm: 'row' }}` of buttons, primary first

### Motion

`varFade('inUp', { distance: 24 })` applied once to the entire composition (replaces the per-block `varBounce('in')` treatment in the existing views). Subtle, professional, dashboard-appropriate.

### Wrapping logic (preserved from existing views)

```tsx
withLayout
  ? <SimpleLayout slotProps={{ content: { compact: true } }}>{content}</SimpleLayout>
  : <SimpleCompactContent layoutQuery="md">{content}</SimpleCompactContent>
```

### Theme alignment rules (codified)

- **No hardcoded hex values** — all colors via `theme.palette.X.main` / `.lighter`
- **No `linear-gradient(...)` text effects** — solid theme colors only on numerals (gradient text is reserved for the marketing surface)
- **All spacing via `theme.spacing`** through the `sx` prop
- **MUI components only** — never raw HTML elements

## Wrapper migration

Per-wrapper config (each wrapper's job is to fill the shell's slots — no scaffolding logic):

| Wrapper | Tone | Visual | Title key | Description key | Actions |
|---|---|---|---|---|---|
| `View400` | warning | numeral `400` | `bad-request` | `bad-request-sentence` | Go home |
| `View401` | primary | icon `solar:shield-keyhole-bold-duotone` | `authentication-required` | `unauthorized-description` | Go to login + Go home |
| `View403` | error | numeral `403` | `no-permission` | `forbidden-description` | Go home |
| `View500` | error | icon `solar:danger-triangle-bold` | `error-500-title` | `error-500-description` | Reload page (`router.refresh()`) |
| `NotFoundView` | primary | numeral `404` | `page-not-found` | `not-found-sentence` | Go home |
| `GenericErrorView` | warning | icon `solar:danger-triangle-bold` | `generic-error-title` | `generic-error-description` | Try again (`router.refresh()`) + Go home |
| `ViewTenantSuspended` | warning | icon `solar:shield-keyhole-bold-duotone` | `tenant-suspended-title` | rendered via `errorDetails` slot — `tenant-suspended-description` + inline mailto support link | Go to organizations |

`GenericErrorView` is the only wrapper that uses the optional `errorDetails` slot (preserves its existing `Error` debug block behavior).

## Auth-layout `ErrorBoundary`

### File

`apps/front/src/routes/auth/_layout/auth-layout.tsx` gets a new `ErrorBoundary` export.

### Implementation

```tsx
export const ErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
  const { t } = useTranslate();
  const failure = toApiFailure(error);

  const renderInLayout = (view: ReactNode) => (
    <AuthSplitLayout
      slotProps={{ section: { title: t('auth-welcome-title'), subtitle: '' } }}
    >
      {view}
    </AuthSplitLayout>
  );

  // Route 404 (typo'd /auth/X)
  if (isRouteErrorResponse(error) && error.status === 404) {
    return renderInLayout(<NotFoundView withLayout={false} />);
  }

  // Auth-flow specific failures (typically expired invitation/reset tokens)
  if (failure.kind === 'problem' && failure.status === 401) {
    // CRITICAL: do NOT auto-logout here.
    // The user isn't logged in — auth-surface 401s mean the link-borne token expired.
    return renderInLayout(<View401 withLayout={false} />);
  }

  // Network failure (auth server unreachable)
  if (failure.kind === 'network') {
    return renderInLayout(<View500 withLayout={false} />);
  }

  // Render exception / unknown
  return renderInLayout(<GenericErrorView withLayout={false} />);
};
```

### Critical invariant

**A 401 in the auth surface does NOT trigger logout.** This contrasts with `authed-layout.tsx` where 401 means "session expired during an authed session, log out and redirect to login." In the auth surface, the user is by definition not logged in, so 401 means "the URL-embedded token (invitation, reset) has expired" — show the view + back-to-sign-in CTA.

### No new view files

The auth surface reuses the existing wrappers (`NotFoundView`, `View401`, `View500`, `GenericErrorView`), all of which now share the new `AppErrorView` shell. Auth surface inherits the visual refresh for free.

## Documentation guide

`docs/guides/error-views.md` — short, links into AGENTS.md. Contents:

1. **Two surfaces, two visual languages** — explains why `MarketingErrorView` is intentionally separate
2. **`AppErrorView` shell API** — props table, mutual exclusivity of `numeral` vs `icon`, `tone` semantics
3. **Existing wrapper inventory** — table mapping each wrapper to its tone, visual, and i18n keys (mirrors the table above)
4. **`ErrorBoundary` placement map** — where boundaries live and what they catch:
   - `root.tsx` → top-level fallthrough (already exists)
   - `marketing-layout.tsx` → marketing routes (already exists, uses `MarketingErrorView`)
   - `auth-layout.tsx` → auth routes (NEW in this PR, uses `AppErrorView` wrappers)
   - `authed-layout.tsx` → staff + tenant scopes (already exists, uses `AppErrorView` wrappers)
5. **When to add a new wrapper vs use the shell directly** — wrapper if the same slot-content is reused 2+ times; otherwise inline `<AppErrorView ... />`
6. **Cross-reference** to AGENTS.md → "RFC 7807 + Frontend Logout Semantics" (the 401 invariant the new auth-layout boundary respects)

A one-line pointer to this guide is added in AGENTS.md under the "Frontend Architecture" section.

## Testing strategy

The repo has no automated frontend tests yet (per AGENTS.md). Quality gates:

| Gate | Command | What it catches |
|---|---|---|
| Lint + format | `just check-write` | style regressions |
| Type check | `just tsc-front` | broken slot props, signature drift on the 26 call sites |
| Manual visual smoke | `just dev-front`, click-through each error path | visual regressions |
| Manual auth-401 verification | trigger expired invitation flow, or temporarily `throw new Response('', { status: 401 })` from an auth loader | confirms 401 does not trigger logout |

### Manual smoke checklist (verify in light AND dark mode)

- `/marketing/<bad-path>` → marketing 404 (regression check only — must look identical to pre-refactor)
- `/auth/<bad-path>` → auth 404 inside `AuthSplitLayout`
- expired invitation token → auth 401 inside `AuthSplitLayout` (no logout)
- network offline + auth flow → auth 500 inside `AuthSplitLayout`
- render exception in any auth child → auth GenericErrorView inside `AuthSplitLayout`
- `/staff/<bad-path>` → `NotFoundView` (refreshed look)
- `/tenant/{id}/<bad-path>` → `NotFoundView` (refreshed look)
- 403 from a staff endpoint → `View403` (refreshed look)
- network offline + dashboard query → `View500` (refreshed look)

## Out of scope

- Migrating `MarketingErrorView` to the shared shell — locked to scope decision 1
- Adding OAuth-cancelled view — locked to scope decision 4
- Touching the `authed-layout.tsx` `ErrorBoundary` mapping logic — already correct
- Touching the `root.tsx` `ErrorBoundary` mapping logic — already correct
- Migrating any of the 26 call sites away from the wrapper API
- New i18n keys — all wrappers reuse existing keys
- Visual changes to the marketing surface
- Server-side error handling (RFC 7807 — already established)

## Acceptance criteria

- [ ] `AppErrorView` shell exists at `apps/front/src/components/error/app-error-view.tsx` with the slot API documented above
- [ ] All 7 existing wrappers re-implemented as thin wrappers over `AppErrorView` — no scaffolding code remaining outside the shell
- [ ] All 26 existing call sites compile and render without changes
- [ ] `auth-layout.tsx` exports an `ErrorBoundary` covering 404 / 401 (no-logout) / network / render-exception
- [ ] No raw "Application Error" or React error overlay reachable via the manual smoke checklist
- [ ] Visual refresh applied: `varFade` motion (not `varBounce`), solid theme colors (no gradient text), MUI-only, theme palette tokens only
- [ ] Marketing surface visually unchanged (`MarketingErrorView` not modified)
- [ ] `docs/guides/error-views.md` written
- [ ] AGENTS.md cross-references the new guide
- [ ] `just check-write` passes
- [ ] `just tsc-front` passes

## References

- Issue [#371](https://github.com/radandevist/publyapp-5/issues/371) — parent
- PR [#367](https://github.com/radandevist/publyapp-5/pull/367) — landed `MarketingErrorView` (the marketing seed)
- AGENTS.md → "RFC 7807 + Frontend Logout Semantics"
- AGENTS.md → "Frontend Coding Standards" (MUI v6, `sx` prop, no Tailwind, arrow components, Iconify icons)
- `apps/front/src/components/error/` — pre-refactor wrappers
- `apps/front/src/routes/auth/_layout/auth-layout.tsx` — the gap to close
- `apps/front/src/routes/marketing/_components/marketing-error-view.tsx` — the surface intentionally not unified
