Status: Historical — not normative
Original location: docs/guides/error-views.md
Archive reason: Retired apps/front guide retained because archived designs depend on its error-view decisions.
Superseded by: docs/guides/frontend-error-handling.md, docs/guides/front-2/conventions.md, and apps/front-2/src/components/ui/state-view.tsx.

# Error Views

> **RETIRED APP — reference only.** This guide describes `apps/front`, the retired MUI + React
> Router v7 frontend. `apps/front` is not built for release, is not deployed, and the owner will not
> edit it again. **Nothing in this guide is a current instruction.** For frontend work see
> [`front-2/index.md`](front-2/index.md) and [`front-2/conventions.md`](front-2/conventions.md).
> It is kept because `apps/front` still exists on disk under a CI characterization job, and because
> some of its intent has not yet been ported to front-2. Its fate is decided in a later wave of the
> documentation remediation.

This codebase has **two** error-view systems by design:

1. **Marketing** — `apps/front/src/routes/marketing/_components/marketing-error-view.tsx` — opinionated marketing visual (gradient numerals, glass card, ambient glows, popular-destinations pill row). Used only inside `MarketingLayout`.
2. **Dashboard + auth** — `apps/front/src/components/error/app-error-view.tsx` — restrained, diagnostic, theme-aligned, MUI-only shell. Used by every other surface.

The two systems do not share a shell. Marketing's brand voice differs from the dashboard's by design, and forcing them into one shell would either bloat it or compromise the visual.

## `<AppErrorView>` shell

Slot-composition shell at `apps/front/src/components/error/app-error-view.tsx`.

The dashboard error visual is intentionally restrained: a neutral (88px) icon circle with a 40px outline-style icon, an optional small monospace status pill (the only tone-colored element), a prominent heading (~24–30 px), a muted body (~14–15 px), default MUI `<Button>` actions, and an optional diagnostic footer for support escalations. No giant numerals. No tone-colored hero visuals. Source: AIDesigner "Dashboard Error" canvas.

> **Why explicit `fontSize` for title/body:** the app's MUI typography is Metronic-compact (h4 = 14 px, body1 = 13 px). That's right for dashboard density but wrong for an attention-grabbing error moment. The shell intentionally overrides with explicit `fontSize` values that match the canvas reference, while keeping `component="h1"` for semantics.

### Props

| Prop | Required | Type | Description |
|---|---|---|---|
| `icon` | yes | `IconifyName` | Always rendered inside an 88px neutral circle at 40px. Prefer outline-style icons for the restrained diagnostic look (e.g. `"solar:magnifer-outline"`, `"solar:forbidden-circle-outline"`). |
| `tone` | yes | `'primary' \| 'error' \| 'warning'` | Colors only the status pill (via `Chip color={tone}`). The icon circle stays neutral. |
| `title` | yes | `string` | Heading text. Renders as semantic `<h1>` with explicit `fontSize: { xs: 24, md: 30 }`. |
| `code` | no | `string` | Short status text for the monospace pill, formatted `<NNN> — <Reason>` (e.g. `"404 — Not Found"`, `"500 — Server Error"`). HTTP reason phrases are kept English-only since they're a developer-facing convention. Omit for non-HTTP errors. |
| `description` | no | `string` | Body text. Omit when the body needs inline JSX (e.g. a link); use the `errorDetails` slot instead. See `ViewTenantSuspended` for an example. |
| `actions` | no | `ReactNode` | One or more `<Button>` elements. Rendered in a `Stack` (column on xs, row on sm+). Use default MUI sizing — do not pass custom `sx` paddings. |
| `errorDetails` | no | `ReactNode` | Optional debug-style block, sits between description and actions. Used by `GenericErrorView` to surface the underlying `Error.message`, and by `ViewTenantSuspended` to render an inline mailto support link inside the body paragraph. |
| `withLayout` | no | `boolean` (default `true`) | When `true`, wraps in `SimpleLayout`. When `false`, wraps in `SimpleCompactContent` (the parent layout owns chrome — used by every `ErrorBoundary` that already lives inside a layout). |
| `diagnosticId` | no | `string` | Optional small monospace footer (e.g. correlation ID + timestamp). Useful for support escalations on 500/generic; omit when there's nothing to show. |

### Theme alignment rules

- **Theme tokens only.** No hex values. The icon circle uses `bgcolor: 'background.paper'` + `borderColor: 'divider'`; the pill uses `Chip color={tone}` (which derives palette tokens internally); body text uses `color: 'text.secondary'`; diagnostic footer uses `color: 'text.disabled'`.
- **Default MUI primitives.** Use `<Chip>`, `<Button>`, default `<Typography variant>` — not custom hex-colored Box wrappers. Buttons use default sizing — do not pass `sx={{ px: 4, py: 1.5, fontWeight: 600 }}` or similar overrides.
- **No marketing tricks.** No `linear-gradient(...)` text effects, no glass `backdrop-filter`, no ambient watermarks. Those belong in `MarketingErrorView`.
- **Tone is restrained.** Tone color appears only on the small status pill. The icon, heading, and body stay neutral.

## Wrapper inventory

The seven wrappers are thin compositions over `AppErrorView`. They exist so call sites can import a meaningfully-named view (`<View404 />`) instead of repeating the slot config inline.

| Wrapper | Tone | Icon | Code | Title key | Actions |
|---|---|---|---|---|---|
| `View400` | warning | `solar:info-circle-outline` | `400 — Bad Request` | `bad-request` | Go home |
| `View401` | primary | `solar:shield-keyhole-outline` | `401 — Unauthorized` | `authentication-required` | Go to login + Go home |
| `View403` | error | `solar:forbidden-circle-outline` | `403 — Forbidden` | `no-permission` | Go home |
| `View404` | primary | `solar:magnifer-outline` | `404 — Not Found` | `page-not-found` | Go home |
| `View500` | error | `solar:danger-triangle-outline` | `500 — Server Error` | `error-500-title` | Reload page |
| `ComingSoonView` | primary | `solar:clock-circle-outline` | — | `coming-soon` | Go home |
| `GenericErrorView` | warning | `solar:danger-triangle-outline` | — | `generic-error-title` | Try again + Go home |
| `TenantSuspendedView` | warning | `solar:shield-keyhole-outline` | — | `tenant-suspended-title` | Go to organizations |

`ComingSoonView` is for routes that are wired in IA but not built yet (or feature-flagged off in this environment) — semantically distinct from `View403` "you don't have permission". Use it for placeholder pages and feature-flag fallbacks.

**Naming conventions:**
- HTTP-status wrappers: file `<NNN>-view.tsx`, named export `View<NNN>` (e.g. `404-view.tsx` exports `View404`).
- Named wrappers (no HTTP status): file `<name>-view.tsx`, named export `<Name>View` (e.g. `tenant-suspended-view.tsx` exports `TenantSuspendedView`).
- All wrappers use named exports (no `export default`).

## ErrorBoundary placement

| Layout | Where | Catches | Renders |
|---|---|---|---|
| `apps/front/src/root.tsx` | top-level fallthrough | anything not caught by a child boundary | `View400` / `View403` / `View404` / `View500` |
| `apps/front/src/routes/marketing/_layout/marketing-layout.tsx` | marketing surface | route 404, marketing loader throws, render exceptions | `MarketingErrorView` |
| `apps/front/src/routes/auth/_layout/auth-layout.tsx` | auth surface | route 404, 401 (no-logout), 403 (no-scope after login), network, render exceptions | `View404` / `View401` / `View403` / `View500` / `GenericErrorView` |
| `apps/front/src/routes/authed/_layout/authed-layout.tsx` | staff + tenant surfaces | API failures (401-with-logout, 403, 403-tenant-suspended, 404, network) | `View401` / `View403` / `TenantSuspendedView` / `View404` / `View500` |

## When to add a new wrapper vs use the shell directly

- **Add a wrapper** if the same slot config is reused 2+ times across the codebase, or if the call site reads cleaner with a meaningful name.
- **Inline `<AppErrorView ... />`** for one-offs (a specific feature page's empty state, a domain-specific 404 with bespoke copy/actions).

## Critical invariant: 401 semantics

The auth surface and the authed surface treat 401 differently:

- **`auth-layout.tsx`** (this surface): 401 means a URL-borne token (invitation, reset) has expired. The user is not logged in. **Do not log them out.** Show `View401` + back-to-login CTA.
- **`authed-layout.tsx`**: 401 means the active session is invalid. **Trigger logout** and redirect to `/auth/login?redirect_cause=invalid_session`.

This split is enforced by RFC 7807 contract on the backend (see AGENTS.md → "RFC 7807 + Frontend Logout Semantics"): only `401` ever means "logout now"; `403` and other codes never do.
