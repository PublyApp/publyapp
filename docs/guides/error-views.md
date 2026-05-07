# Error Views

This codebase has **two** error-view systems by design:

1. **Marketing** — `apps/front/src/routes/marketing/_components/marketing-error-view.tsx` — opinionated marketing visual (gradient numerals, glass card, ambient glows, popular-destinations pill row). Used only inside `MarketingLayout`.
2. **Dashboard + auth** — `apps/front/src/components/error/app-error-view.tsx` — theme-aligned, MUI-only, slot-composition shell. Used by every other surface.

The two systems do not share a shell. Marketing's brand voice differs from the dashboard's by design, and forcing them into one shell would either bloat it or compromise the visual.

## `<AppErrorView>` shell

Slot-composition shell at `apps/front/src/components/error/app-error-view.tsx`.

### Props

| Prop | Required | Type | Description |
|---|---|---|---|
| `numeral` | one of | `string` | e.g. `"404"`. Renders as a large `Typography variant="h1"` colored by the active tone. Mutually exclusive with `icon`. |
| `icon` | one of | `IconifyName` | e.g. `"solar:shield-keyhole-bold-duotone"`. Renders inside a circular tonal container. Mutually exclusive with `numeral`. |
| `title` | yes | `string` | Heading text. |
| `description` | no | `string` | Body text. Omit when the body needs inline JSX (e.g. a link); use the `errorDetails` slot instead. See `ViewTenantSuspended` for an example. |
| `tone` | yes | `'primary' \| 'error' \| 'warning'` | Drives the visual's color via `theme.palette[tone].main` / `.lighter`. |
| `actions` | no | `ReactNode` | One or more `<Button>` elements. Rendered in a `Stack` (column on xs, row on sm+). |
| `errorDetails` | no | `ReactNode` | Optional debug-style block, sits between description and actions. Used by `GenericErrorView` to surface the underlying `Error.message`, and by `ViewTenantSuspended` to render an inline mailto support link inside the body paragraph. |
| `withLayout` | no | `boolean` (default `true`) | When `true`, wraps in `SimpleLayout`. When `false`, wraps in `SimpleCompactContent` (the parent layout owns chrome — used by every `ErrorBoundary` that already lives inside a layout). |

### Theme alignment rules

- No hardcoded hex values
- No `linear-gradient(...)` text effects (those are reserved for the marketing surface)
- Only `theme.palette.X.main` / `.lighter`
- Only `sx`-prop spacing
- MUI components only

## Wrapper inventory

The seven wrappers are thin compositions over `AppErrorView`. They exist so call sites can import a meaningfully-named view (`<View403 />`) instead of repeating the slot config inline.

| Wrapper | Tone | Visual | Title key | Actions |
|---|---|---|---|---|
| `View400` (default export) | warning | numeral `400` | `bad-request` | Go home |
| `View401` | primary | icon `solar:shield-keyhole-bold-duotone` | `authentication-required` | Go to login + Go home |
| `View403` | error | numeral `403` | `no-permission` | Go home |
| `View500` | error | icon `solar:danger-triangle-bold` | `error-500-title` | Reload page |
| `NotFoundView` | primary | numeral `404` | `page-not-found` | Go home |
| `GenericErrorView` | warning | icon `solar:danger-triangle-bold` | `generic-error-title` | Try again + Go home |
| `ViewTenantSuspended` | warning | icon `solar:shield-keyhole-bold-duotone` | `tenant-suspended-title` | Go to organizations |

## ErrorBoundary placement

| Layout | Where | Catches | Renders |
|---|---|---|---|
| `apps/front/src/root.tsx` | top-level fallthrough | anything not caught by a child boundary | `View400` / `View403` / `NotFoundView` / `View500` |
| `apps/front/src/routes/marketing/_layout/marketing-layout.tsx` | marketing surface | route 404, marketing loader throws, render exceptions | `MarketingErrorView` |
| `apps/front/src/routes/auth/_layout/auth-layout.tsx` | auth surface | route 404, 401 (no-logout), network, render exceptions | `NotFoundView` / `View401` / `View500` / `GenericErrorView` |
| `apps/front/src/routes/authed/_layout/authed-layout.tsx` | staff + tenant surfaces | API failures (401-with-logout, 403, 403-tenant-suspended, 404, network) | `View401` / `View403` / `ViewTenantSuspended` / `NotFoundView` / `View500` |

## When to add a new wrapper vs use the shell directly

- **Add a wrapper** if the same slot config is reused 2+ times across the codebase, or if the call site reads cleaner with a meaningful name.
- **Inline `<AppErrorView ... />`** for one-offs (a specific feature page's empty state, a domain-specific 404 with bespoke copy/actions).

## Critical invariant: 401 semantics

The auth surface and the authed surface treat 401 differently:

- **`auth-layout.tsx`** (this surface): 401 means a URL-borne token (invitation, reset) has expired. The user is not logged in. **Do not log them out.** Show `View401` + back-to-login CTA.
- **`authed-layout.tsx`**: 401 means the active session is invalid. **Trigger logout** and redirect to `/auth/login?redirect_cause=invalid_session`.

This split is enforced by RFC 7807 contract on the backend (see AGENTS.md → "RFC 7807 + Frontend Logout Semantics"): only `401` ever means "logout now"; `403` and other codes never do.
