# Cross-surface ErrorView refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a slot-composition `AppErrorView` shell, refactor the 7 dashboard error wrappers to use it, apply a theme-aligned visual refresh, add a missing auth-layout `ErrorBoundary`, and document the result.

**Architecture:** New shell module at `apps/front/src/components/error/app-error-view.tsx` with `numeral | icon` mutual-exclusivity in props, `tone: 'primary' | 'error' | 'warning'` driving theme palette tokens, `varFade('inUp')` motion replacing per-block `varBounce`. Existing 7 wrappers become thin (~25-line) composition wrappers; their public APIs, exports, and call-site behavior are preserved.

**Tech Stack:** React 19, MUI v6, framer-motion (via `m`), React Router v7, the project's existing `Iconify` + `useTranslate` + `useHomePath` + `useRouter` primitives.

**Spec:** `docs/superpowers/specs/2026-05-07-cross-surface-error-view-design.md`

**Branch:** `feature/cross-surface-error-views` (already created; spec already committed)

---

## Pre-flight context (read before starting)

- **No automated frontend tests in this repo** — quality gates per task are: `just check-write` (oxlint + oxfmt), `just tsc-front` (TypeScript), and a manual smoke verification of the affected route.
- **Backward compatibility is non-negotiable.** All 26 existing call sites of the 7 wrappers must compile and render without changes. Do not alter wrapper export shapes:
  - `View400` — default export only (`export default View400`)
  - `View401`, `View403`, `View500`, `NotFoundView`, `GenericErrorView`, `ViewTenantSuspended` — named exports
- **The 401-no-logout invariant in the auth boundary is critical.** Auth-surface 401s come from URL-borne tokens (invitation, reset). The user is not logged in, so logout would be wrong. Show the view + back-to-login CTA.
- **Marketing surface stays untouched.** `apps/front/src/routes/marketing/_components/marketing-error-view.tsx` and `marketing-layout.tsx`'s `ErrorBoundary` are off-limits. If you touch them, you have gone out of scope.
- **Theme alignment rules** (codified in the shell's visual): no hardcoded hex values; no `linear-gradient(...)` text effects; only `theme.palette.X.main` / `.lighter` for color; only `sx`-prop spacing.

---

## Task 1: Build the AppErrorView shell

**Files:**
- Create: `apps/front/src/components/error/app-error-view.tsx`

The shell is theme-aware, MUI-only, and renders one of `numeral` or `icon` (enforced via discriminated-union props). The 7 wrappers will consume this in subsequent tasks; this task introduces the file in isolation, with no consumers yet — verification is type-check + lint only.

- [ ] **Step 1: Write the new shell file**

Create `apps/front/src/components/error/app-error-view.tsx` with this content:

```tsx
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import type { ReactNode } from 'react';

import { SimpleCompactContent } from '#app/layouts/simple/content.tsx';
import { SimpleLayout } from '#app/layouts/simple/layout.tsx';

import { MotionContainer } from '../animate/motion-container';
import { varFade } from '../animate/variants';
import { Iconify } from '../iconify/iconify';
import type { IconifyName } from '../iconify/register-icons';

// ----------------------------------------------------------------------

type AppErrorTone = 'primary' | 'error' | 'warning';

type AppErrorViewBaseProps = {
	title: string;
	// Optional — wrappers may render their body via the `errorDetails`
	// slot when inline JSX is needed (e.g. ViewTenantSuspended's mailto link).
	description?: string;
	actions?: ReactNode;
	errorDetails?: ReactNode;
	tone: AppErrorTone;
	withLayout?: boolean;
};

type AppErrorViewWithNumeral = AppErrorViewBaseProps & {
	numeral: string;
	icon?: never;
};

type AppErrorViewWithIcon = AppErrorViewBaseProps & {
	icon: IconifyName;
	numeral?: never;
};

export type AppErrorViewProps = AppErrorViewWithNumeral | AppErrorViewWithIcon;

const FADE_DISTANCE = 24;

export const AppErrorView = (props: AppErrorViewProps) => {
	const {
		title,
		description,
		actions,
		errorDetails,
		tone,
		withLayout = true,
	} = props;

	const renderVisual = () => {
		if ('numeral' in props && props.numeral !== undefined) {
			return (
				<Typography
					variant="h1"
					sx={(theme) => ({
						fontSize: { xs: '6rem', md: '8rem' },
						fontWeight: 800,
						lineHeight: 1,
						color: theme.palette[tone].main,
						mb: 2,
					})}
				>
					{props.numeral}
				</Typography>
			);
		}

		if ('icon' in props && props.icon !== undefined) {
			return (
				<Box
					sx={(theme) => ({
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: 120,
						height: 120,
						borderRadius: '50%',
						bgcolor: theme.palette[tone].lighter,
						mb: 3,
					})}
				>
					<Iconify
						icon={props.icon}
						width={64}
						sx={(theme) => ({ color: theme.palette[tone].main })}
					/>
				</Box>
			);
		}

		return null;
	};

	const renderContent = () => {
		return (
			<Container
				component={MotionContainer}
				sx={{ textAlign: 'center', py: { xs: 5, md: 10 } }}
			>
				<m.div variants={varFade('inUp', { distance: FADE_DISTANCE })}>
					{renderVisual()}
				</m.div>

				<m.div variants={varFade('inUp', { distance: FADE_DISTANCE })}>
					<Typography variant="h3" sx={{ mb: 2, fontWeight: 700 }}>
						{title}
					</Typography>
				</m.div>

				{description !== undefined && (
					<m.div variants={varFade('inUp', { distance: FADE_DISTANCE })}>
						<Typography
							sx={{
								color: 'text.secondary',
								mb: errorDetails ? 2 : 4,
								maxWidth: 480,
								mx: 'auto',
								lineHeight: 1.6,
							}}
						>
							{description}
						</Typography>
					</m.div>
				)}

				{errorDetails && (
					<m.div variants={varFade('inUp', { distance: FADE_DISTANCE })}>
						<Box sx={{ mb: 4 }}>{errorDetails}</Box>
					</m.div>
				)}

				{actions && (
					<m.div variants={varFade('inUp', { distance: FADE_DISTANCE })}>
						<Stack
							direction={{ xs: 'column', sm: 'row' }}
							spacing={2}
							justifyContent="center"
						>
							{actions}
						</Stack>
					</m.div>
				)}
			</Container>
		);
	};

	if (!withLayout) {
		return (
			<SimpleCompactContent layoutQuery="md">
				{renderContent()}
			</SimpleCompactContent>
		);
	}

	return (
		<SimpleLayout slotProps={{ content: { compact: true } }}>
			{renderContent()}
		</SimpleLayout>
	);
};
```

- [ ] **Step 2: Verify lint + format passes**

Run: `just check-write`
Expected: no lint or format errors on the new file. If oxfmt rewrites whitespace, that is fine — the rewrite is the fix.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `just tsc-front`
Expected: 0 errors. The discriminated union enforces that callers pass exactly one of `numeral` or `icon`.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/components/error/app-error-view.tsx
git commit -m "feat(front): add AppErrorView slot-composition shell

Introduces the shared error-view shell that the seven existing
dashboard wrappers will consume in follow-up commits. Theme-aligned
(palette tokens only, no hex/gradient text), MUI-only, varFade
motion. Mutual-exclusivity of numeral vs icon enforced at the type
level via a discriminated union.

Refs #371

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Migrate NotFoundView to AppErrorView

**Files:**
- Modify: `apps/front/src/components/error/not-found-view.tsx`

`NotFoundView` is migrated first because it has the most call sites (root error boundary, staff catch-all, tenant catch-all, authed error boundary) — verifying it visually exercises the shell across the most surfaces in one shot.

- [ ] **Step 1: Replace the file's contents**

Overwrite `apps/front/src/components/error/not-found-view.tsx` with:

```tsx
import Button from '@mui/material/Button';

import { useHomePath } from '#app/hooks/use-home-path.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { RouterLink } from '../router-link';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type NotFoundViewProps = {
	withLayout?: boolean;
	title?: string;
	description?: string;
};

export const NotFoundView = ({
	withLayout = true,
	title,
	description,
}: NotFoundViewProps) => {
	const { t } = useTranslate();
	const homePath = useHomePath();

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="primary"
			numeral="404"
			title={title || t('page-not-found')}
			description={description || t('not-found-sentence')}
			actions={
				<Button
					component={RouterLink}
					href={homePath}
					size="large"
					variant="contained"
				>
					{t('go-to-home')}
				</Button>
			}
		/>
	);
};
```

- [ ] **Step 2: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors.

- [ ] **Step 3: Manual smoke (light + dark mode)**

Start the dev server: `just dev-front`
Navigate to:
- `/staff/this-route-does-not-exist` — should render the new visual via `StaffNotFoundPage` → `NotFoundView`.
- `/<a-tenant-id>/this-route-does-not-exist` (substitute a real tenant id from the dev DB) — same, via `TenantNotFoundPage`.

Toggle dark mode via the dashboard color-scheme toggle. Verify the 404 numeral uses `theme.palette.primary.main` in both modes (no hardcoded color).

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/components/error/not-found-view.tsx
git commit -m "refactor(front): migrate NotFoundView to AppErrorView

Replaces the duplicated scaffold with a thin wrapper over the new
shared shell. Behavior preserved: same translation keys, same default
title/description override semantics, same withLayout default. All
existing call sites unaffected.

Refs #371

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Migrate View400 and View403 (the other numeral wrappers)

**Files:**
- Modify: `apps/front/src/components/error/400-view.tsx`
- Modify: `apps/front/src/components/error/403-view.tsx`

Both use a numeral as the visual identifier. `View400` keeps its `default` export (root.tsx imports it that way); `View403` keeps its named export.

- [ ] **Step 1: Replace `400-view.tsx`**

Overwrite `apps/front/src/components/error/400-view.tsx` with:

```tsx
import Button from '@mui/material/Button';

import { useHomePath } from '#app/hooks/use-home-path.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { RouterLink } from '../router-link';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type View400Props = {
	withLayout?: boolean;
	title?: string;
	description?: string;
};

const View400 = ({ withLayout = true, title, description }: View400Props) => {
	const { t } = useTranslate();
	const homePath = useHomePath();

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="warning"
			numeral="400"
			title={title ?? t('bad-request')}
			description={description ?? t('bad-request-sentence')}
			actions={
				<Button
					component={RouterLink}
					href={homePath}
					size="large"
					variant="contained"
					sx={{ px: 4, py: 1.5, fontWeight: 600 }}
				>
					{t('go-to-home')}
				</Button>
			}
		/>
	);
};

export default View400;
```

- [ ] **Step 2: Replace `403-view.tsx`**

Overwrite `apps/front/src/components/error/403-view.tsx` with:

```tsx
import Button from '@mui/material/Button';

import { useHomePath } from '#app/hooks/use-home-path.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { RouterLink } from '../router-link';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type View403Props = {
	withLayout?: boolean;
};

export const View403 = ({ withLayout = true }: View403Props) => {
	const { t } = useTranslate();
	const homePath = useHomePath();

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="error"
			numeral="403"
			title={t('no-permission')}
			description={t('forbidden-description')}
			actions={
				<Button
					component={RouterLink}
					href={homePath}
					size="large"
					variant="contained"
					sx={{ px: 4, py: 1.5 }}
				>
					{t('go-to-home')}
				</Button>
			}
		/>
	);
};
```

- [ ] **Step 3: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors. The existing call site `import View400 from './components/error/400-view';` in `apps/front/src/root.tsx` still resolves to the default export; `import { View403 }` resolves to the named export.

- [ ] **Step 4: Manual smoke**

With the dev server running, in the browser:
- Visit a route the current user doesn't have permission for (e.g., a tenant user browsing `/staff/...`) → should render `View403` via the authed-layout boundary.
- Trigger a 400 (e.g., POST a malformed request through any form) — root boundary catches and renders `View400`. If no easy 400 path exists, temporarily `throw new Response('', { status: 400 })` from a loader to verify visually, then revert the temp throw.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/components/error/400-view.tsx apps/front/src/components/error/403-view.tsx
git commit -m "refactor(front): migrate View400 and View403 to AppErrorView

Both are numeral-based wrappers with single 'go home' actions. Default
export preserved on View400 (root.tsx imports it as default). Named
export preserved on View403.

Refs #371

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Migrate View401, View500, ViewTenantSuspended (the icon wrappers)

**Files:**
- Modify: `apps/front/src/components/error/401-view.tsx`
- Modify: `apps/front/src/components/error/500-view.tsx`
- Modify: `apps/front/src/components/error/tenant-suspended-view.tsx`

All three use an icon (no numeral) as the visual identifier.

- [ ] **Step 1: Replace `401-view.tsx`**

Overwrite `apps/front/src/components/error/401-view.tsx` with:

```tsx
import Button from '@mui/material/Button';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { useTranslate } from '#app/hooks/use-translate.ts';

import { RouterLink } from '../router-link';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type View401Props = {
	withLayout?: boolean;
};

export const View401 = ({ withLayout = true }: View401Props) => {
	const { t } = useTranslate();

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="primary"
			icon="solar:shield-keyhole-bold-duotone"
			title={t('authentication-required')}
			description={t('unauthorized-description')}
			actions={
				<>
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.auth.login}
						size="large"
						variant="contained"
					>
						{t('go-to-login')}
					</Button>
					<Button
						component={RouterLink}
						href="/"
						size="large"
						variant="outlined"
					>
						{t('go-to-home')}
					</Button>
				</>
			}
		/>
	);
};
```

- [ ] **Step 2: Replace `500-view.tsx`**

Overwrite `apps/front/src/components/error/500-view.tsx` with:

```tsx
import Button from '@mui/material/Button';

import { useRouter } from '#app/hooks/use-router.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { Iconify } from '../iconify/iconify';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type View500Props = {
	withLayout?: boolean;
};

export const View500 = ({ withLayout = true }: View500Props) => {
	const { t } = useTranslate();
	const router = useRouter();

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="error"
			icon="solar:danger-triangle-bold"
			title={t('error-500-title')}
			description={t('error-500-description')}
			actions={
				<Button
					size="large"
					variant="contained"
					color="primary"
					onClick={() => router.refresh()}
					startIcon={<Iconify icon="solar:restart-bold" width={20} />}
				>
					{t('reload-page')}
				</Button>
			}
		/>
	);
};
```

- [ ] **Step 3: Replace `tenant-suspended-view.tsx`**

Overwrite `apps/front/src/components/error/tenant-suspended-view.tsx` with:

```tsx
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { useTranslate } from '#app/hooks/use-translate.ts';

import { RouterLink } from '../router-link';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type ViewTenantSuspendedProps = {
	withLayout?: boolean;
};

export const ViewTenantSuspended = ({
	withLayout = true,
}: ViewTenantSuspendedProps) => {
	const { t } = useTranslate();

	const description = (
		<Typography
			component="span"
			sx={{ color: 'text.secondary', lineHeight: 1.6 }}
		>
			{t('tenant-suspended-description')}{' '}
			<Link
				href="mailto:support@example.com"
				color="inherit"
				sx={{ fontWeight: 'bold' }}
			>
				{t('contact-support')}
			</Link>
		</Typography>
	);

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="warning"
			icon="solar:shield-keyhole-bold-duotone"
			title={t('tenant-suspended-title')}
			errorDetails={description}
			actions={
				<Button
					component={RouterLink}
					href={FRONT_PATH_NAMES.tenant().organizations}
					size="large"
					variant="contained"
					sx={{ px: 4, py: 1.5 }}
				>
					{t('go-to-my-organizations')}
				</Button>
			}
		/>
	);
};
```

> Note on `ViewTenantSuspended`: the original embeds a `<Link>` (mailto support) inside the description paragraph. Since `AppErrorView`'s `description` prop is a plain `string`, we render the inline-link paragraph via the `errorDetails` slot (which accepts `ReactNode`) and omit `description` entirely. The shell renders nothing in the description position when `description` is undefined. Visual outcome preserved: a paragraph with an inline support link, sitting where the original description sat.

- [ ] **Step 4: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors.

- [ ] **Step 5: Manual smoke**

- `View401`: trigger a 401 in an authed flow (e.g., manually expire your session cookie in DevTools Application tab and reload `/staff` — the authed-layout boundary will route to `View401` before logout fires; or test via the new auth-layout boundary in Task 6).
- `View500`: take the API offline (`docker stop <api-container>`) and reload an authed dashboard route → authed-layout boundary's `kind === 'network'` branch renders `View500`.
- `ViewTenantSuspended`: harder to trigger naturally; if seeding a suspended tenant is not feasible in dev, temporarily change the `if (failure.status === 403 && failure.translationKey === 'tenant-suspended')` branch in `authed-layout.tsx` to always render `<ViewTenantSuspended />` to verify visually, then revert the temp change.

- [ ] **Step 6: Commit**

```bash
git add apps/front/src/components/error/401-view.tsx apps/front/src/components/error/500-view.tsx apps/front/src/components/error/tenant-suspended-view.tsx
git commit -m "refactor(front): migrate icon-based error wrappers to AppErrorView

View401, View500, and ViewTenantSuspended now share the new shell.
Visual semantics preserved (refresh button on 500, mailto support
link on tenant-suspended, dual back-to-login + go-home on 401).
ViewTenantSuspended uses the errorDetails slot to render its inline
mailto link inside a paragraph.

Refs #371

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Migrate GenericErrorView (uses errorDetails slot)

**Files:**
- Modify: `apps/front/src/components/error/generic-error-view.tsx`

`GenericErrorView` is the only wrapper that renders an optional debug-style error message block when an `Error` is passed in. The shell exposes the `errorDetails` slot for exactly this purpose.

- [ ] **Step 1: Replace the file's contents**

Overwrite `apps/front/src/components/error/generic-error-view.tsx` with:

```tsx
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import { useHomePath } from '#app/hooks/use-home-path.ts';
import { useRouter } from '#app/hooks/use-router.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { RouterLink } from '../router-link';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type GenericErrorViewProps = {
	withLayout?: boolean;
	title?: string;
	description?: string;
	error?: Error | string;
};

export const GenericErrorView = ({
	withLayout = true,
	title,
	description,
	error,
}: GenericErrorViewProps) => {
	const { t } = useTranslate();
	const router = useRouter();
	const homePath = useHomePath();

	const errorMessage = error instanceof Error ? error.message : error;

	const errorDetails = errorMessage ? (
		<Box
			sx={{
				p: 2,
				borderRadius: 1,
				bgcolor: 'error.lighter',
				border: 1,
				borderColor: 'error.light',
			}}
		>
			<Typography
				variant="body2"
				sx={{
					color: 'error.dark',
					fontFamily: 'monospace',
					wordBreak: 'break-word',
				}}
			>
				{errorMessage}
			</Typography>
		</Box>
	) : undefined;

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="warning"
			icon="solar:danger-triangle-bold"
			title={title || t('generic-error-title')}
			description={description || t('generic-error-description')}
			errorDetails={errorDetails}
			actions={
				<>
					<Button
						size="large"
						variant="contained"
						onClick={() => router.refresh()}
					>
						{t('try-again')}
					</Button>
					<Button
						component={RouterLink}
						href={homePath}
						size="large"
						variant="outlined"
					>
						{t('go-to-home')}
					</Button>
				</>
			}
		/>
	);
};
```

- [ ] **Step 2: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors.

- [ ] **Step 3: Manual smoke**

`GenericErrorView` is wired in via:
- `authed-layout.tsx`'s ErrorBoundary catch-all (any non-`problem` non-`network` error) — but the current code falls through to `View500` for that case (line 276 of `authed-layout.tsx`), so `GenericErrorView` is currently *not* reachable from the authed boundary. It will be wired into the auth-layout boundary in Task 6.

Until Task 6 is done, verify visually by temporarily inserting `<GenericErrorView error={new Error('Smoke test message')} />` somewhere and reloading. Revert after verification.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/components/error/generic-error-view.tsx
git commit -m "refactor(front): migrate GenericErrorView to AppErrorView

Preserves the optional Error debug block by rendering it through
the shell's errorDetails slot. Two-button action layout (Try again +
Go home) preserved.

Refs #371

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Add the auth-layout ErrorBoundary

**Files:**
- Modify: `apps/front/src/routes/auth/_layout/auth-layout.tsx`

The auth layout currently has no `ErrorBoundary` export — render exceptions and loader throws fall through to `root.tsx`'s generic boundary. This task adds an auth-aware boundary that maps failures to the existing wrappers (now sharing the new shell).

**The 401-no-logout invariant is the most important behavioral guarantee in this PR.**

- [ ] **Step 1: Add imports + ErrorBoundary export**

Append the following imports to the existing import block at the top of `apps/front/src/routes/auth/_layout/auth-layout.tsx` (alphabetize as needed; see existing order):

```tsx
import { isRouteErrorResponse } from 'react-router';

import { GenericErrorView } from '#app/components/error/generic-error-view.tsx';
import { NotFoundView } from '#app/components/error/not-found-view.tsx';
import { View401 } from '#app/components/error/401-view.tsx';
import { View500 } from '#app/components/error/500-view.tsx';
import { toApiFailure } from '#app/lib/api-failure/index.ts';
```

`isRouteErrorResponse` may already be imported elsewhere from `react-router`; check the existing import line and add the symbol there if so. The other 5 imports are new.

- [ ] **Step 2: Append the ErrorBoundary export**

Add the following at the end of `apps/front/src/routes/auth/_layout/auth-layout.tsx` (after the existing `HydrateFallback` export):

```tsx
export const ErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
	const { t } = useTranslate();
	const failure = toApiFailure(error);

	const renderInLayout = (view: React.ReactNode) => {
		return (
			<AuthSplitLayout
				slotProps={{
					section: { title: t('auth-welcome-title'), subtitle: '' },
				}}
			>
				{view}
			</AuthSplitLayout>
		);
	};

	// Route 404 (typo'd /auth/X)
	if (isRouteErrorResponse(error) && error.status === 404) {
		return renderInLayout(<NotFoundView withLayout={false} />);
	}

	// CRITICAL: a 401 in the auth surface does NOT trigger logout. The user
	// is not logged in to begin with — auth-surface 401s typically come from
	// expired URL-borne tokens (invitation, reset). Show the view + back-to-
	// login CTA. Contrast with authed-layout.tsx where 401 → logout.
	if (failure.kind === 'problem' && failure.status === 401) {
		return renderInLayout(<View401 withLayout={false} />);
	}

	// Network failure (auth server unreachable)
	if (failure.kind === 'network') {
		return renderInLayout(<View500 withLayout={false} />);
	}

	// Render exception / unknown — generic with back-to-sign-in
	return renderInLayout(<GenericErrorView withLayout={false} />);
};
```

The `useTranslate` hook is already imported in this file (used by the existing `AuthLayout` component), so no extra import is needed for that.

- [ ] **Step 3: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors.

- [ ] **Step 4: Manual smoke — 404 path**

Start dev server. Visit `/auth/this-route-does-not-exist`.
Expected: the `AuthSplitLayout` chrome renders with the 404 numeral inside (refreshed look). Confirm light + dark mode.

- [ ] **Step 5: Manual smoke — 401 no-logout invariant**

Inside `apps/front/src/routes/auth/_layout/auth-layout.tsx`, temporarily insert `throw new Response('', { status: 401, statusText: 'Unauthorized' });` at the start of the `clientLoader` (line ~76), save, and reload `/auth/login`.

Expected:
- The page renders `<View401 />` inside `AuthSplitLayout`.
- The user is **not** redirected to `/auth/login?redirect_cause=invalid_session` (which would indicate a logout was triggered).
- The browser's session cookie is **not** cleared.
- Two buttons visible: "Go to login" and "Go to home".

After verifying, **revert the temporary throw** before committing.

- [ ] **Step 6: Manual smoke — network failure**

Take the API offline (`docker stop <api-container>` or similar — the project's `just dev-db` stops both DB and API). Reload `/auth/login`.
Expected: `<View500 />` renders inside `AuthSplitLayout`. Bring the API back up afterwards.

- [ ] **Step 7: Commit**

```bash
git add apps/front/src/routes/auth/_layout/auth-layout.tsx
git commit -m "feat(front): add auth-layout ErrorBoundary (no-logout on 401)

Closes the gap where auth-flow render exceptions and loader throws
fell through to the generic root boundary. Maps failures to the
existing wrappers inside AuthSplitLayout chrome.

Critical invariant: a 401 in the auth surface does not trigger
logout (auth-surface 401s come from expired URL-borne tokens like
invitation/reset, not from session expiry). Contrast with
authed-layout.tsx where 401 → logout.

Refs #371

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Documentation guide + AGENTS.md cross-ref

**Files:**
- Create: `docs/guides/error-views.md`
- Modify: `AGENTS.md` (one-line pointer to the new guide)

- [ ] **Step 1: Write the guide**

Create `docs/guides/error-views.md` with:

```markdown
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
```

- [ ] **Step 2: Add a one-line cross-ref to AGENTS.md**

Find the "Frontend Architecture" section in `AGENTS.md` and add a bullet pointing at the new guide. Specifically, locate the existing line:

```
For detailed frontend architecture patterns (API client integration, getting clients in hooks/browser/SSR,
data fetching patterns by route type, and optimized prefetching), see:
[`docs/guides/frontend-architecture.md`](docs/guides/frontend-architecture.md)
```

Immediately after that block (still inside the "Frontend Architecture (React Router v7)" section), insert:

```
For the cross-surface error view system (the `AppErrorView` shell, wrapper inventory, ErrorBoundary placement
map, and the 401-no-logout invariant for the auth surface), see:
[`docs/guides/error-views.md`](docs/guides/error-views.md)
```

- [ ] **Step 3: Verify the markdown renders**

Manually open both files in a markdown previewer (or `gh issue create --preview` style — VS Code's built-in `Cmd+Shift+V` works). Confirm tables render and links resolve.

- [ ] **Step 4: Commit**

```bash
git add docs/guides/error-views.md AGENTS.md
git commit -m "docs(front): add cross-surface error views guide

Documents the AppErrorView shell, the 7 wrappers, the four
ErrorBoundary locations, and the critical 401-semantics split
between auth-layout (no logout) and authed-layout (logout).
AGENTS.md gets a one-line cross-ref under Frontend Architecture.

Refs #371

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Final verification + manual smoke checklist

**Files:** none modified in this task — this is a verification gate before opening the PR.

- [ ] **Step 1: Full lint + format pass**

Run: `just check-write`
Expected: 0 errors.

- [ ] **Step 2: Full TypeScript pass**

Run: `just tsc-front`
Expected: 0 errors. If `just tsc-front` reports drift in *unrelated* files, leave them alone — the scope of this PR is the error views.

- [ ] **Step 3: Walk the manual smoke checklist (light AND dark mode for every entry)**

Start the dev server (`just dev-front`), then verify each row renders the expected view with the refreshed visual:

| Path / trigger | Expected view | Layout chrome |
|---|---|---|
| `/blah-bad-marketing-path` | `MarketingErrorView` (404) — **unchanged from develop** | `MarketingLayout` |
| `/auth/this-does-not-exist` | `NotFoundView` (refreshed) | `AuthSplitLayout` |
| temp 401 throw in auth-layout `clientLoader` | `View401` + no logout, no cookie clearing | `AuthSplitLayout` |
| auth flow with API offline | `View500` | `AuthSplitLayout` |
| `/staff/this-does-not-exist` | `NotFoundView` (refreshed) | staff layout |
| `/<tenant-id>/this-does-not-exist` | `NotFoundView` (refreshed) | tenant layout |
| 403 from a staff endpoint (e.g. tenant user on `/staff`) | `View403` (refreshed) | authed layout |
| Authed query with API offline | `View500` (refreshed) | authed layout |

For each row: in DevTools → Application → Storage, confirm the session cookie state matches expectation (preserved on auth-401, cleared on authed-401).

- [ ] **Step 4: Type-consistency self-check**

Open each modified file and grep for the symbols below — every reference should still resolve:
- `AppErrorView`, `AppErrorViewProps`
- The 7 wrappers (`View400`, `View401`, `View403`, `View500`, `NotFoundView`, `GenericErrorView`, `ViewTenantSuspended`)

Run: `git grep -E '\b(View400|View401|View403|View500|NotFoundView|GenericErrorView|ViewTenantSuspended|AppErrorView)\b' apps/front/src`
Expected: ≥ 26 matches across call sites + the new shell.

- [ ] **Step 5: Open the PR**

```bash
git push -u origin feature/cross-surface-error-views
gh pr create --title "feat(front): cross-surface error views" --body "$(cat <<'EOF'
## Summary

- New `AppErrorView` slot-composition shell at `apps/front/src/components/error/app-error-view.tsx`
- 7 dashboard wrappers refactored to thin compositions; behavior + exports + 26 call sites unchanged
- Theme-aligned visual refresh (palette tokens, no gradient text, `varFade` motion)
- New `auth-layout.tsx` `ErrorBoundary` covering 404 / 401-no-logout / network / render-exception
- `MarketingErrorView` intentionally untouched (distinct surface design language)
- New `docs/guides/error-views.md` + AGENTS.md cross-ref

Closes #371

## Test plan

- [ ] `just check-write`
- [ ] `just tsc-front`
- [ ] Manual smoke (light + dark mode):
  - [ ] `/blah-bad-marketing-path` → `MarketingErrorView` unchanged
  - [ ] `/auth/this-does-not-exist` → 404 in `AuthSplitLayout`
  - [ ] auth-401 → `View401` no logout, no cookie clearing
  - [ ] auth flow with API offline → `View500` in `AuthSplitLayout`
  - [ ] `/staff/this-does-not-exist` → refreshed `NotFoundView`
  - [ ] `/<tenant-id>/this-does-not-exist` → refreshed `NotFoundView`
  - [ ] 403 from a staff endpoint → refreshed `View403`
  - [ ] Authed query with API offline → refreshed `View500`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes (already applied)

- Spec coverage: every acceptance criterion in `docs/superpowers/specs/2026-05-07-cross-surface-error-view-design.md` maps to at least one task above (shell → Task 1; 7 wrappers → Tasks 2–5; auth boundary → Task 6; docs → Task 7; verification → Task 8).
- No placeholders: every step has concrete code or commands.
- Type consistency: `AppErrorViewProps`, `AppErrorTone`, the 7 wrapper names, and `IconifyName` / `MotionContainer` / `varFade` import paths are identical across all tasks.
- The 401-no-logout invariant is called out in three places (Task 6 step 2 comment, Task 6 step 5 verification, Task 7 docs guide) so it cannot be silently regressed.
