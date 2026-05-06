# Marketing Changelog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/changelog` (redirect) and `/changelog/:year` (timeline page) under MarketingLayout, gated by `FEATURES.marketing.changelog`. Single-page vertical timeline of releases with year-as-pagination via path segments, body content powered by the existing `blog-content-elements.tsx` kit.

**Architecture:** Two routes — bare `/changelog` redirects via a React Router loader to the latest year that has entries; `/changelog/:year` validates the param against the data and renders the page. All entries live in a single `_data/changelog.tsx` (note `.tsx` — bodies are inline JSX). Body content composes from `blog-content-elements.tsx` (Phase 4). Year chips are `<RouterLink>` navigation, not query-param filters. Per-entry anchor + click-to-copy via a shared `copyToClipboard` util extracted from the existing blog ShareRow.

**Tech Stack:** React Router v7 (file-based routing, loaders, redirect helper), MUI v6 (sx prop, Container, Stack, Box, Typography), framer-motion via the existing `m` import (LazyMotion), existing primitives (`MarketingHero`, `CtaBand`, `MarketingErrorView`, `Image`, `Iconify`), the `blog-content-elements.tsx` body kit (Phase 4), nuqs is NOT used here (path segments replace it).

**Spec:** [`docs/superpowers/specs/2026-05-06-marketing-changelog-design.md`](../specs/2026-05-06-marketing-changelog-design.md)

**Verification model:** The marketing surface has no unit tests — every task ends with `just tsc-front`, `just check-write`, and a manual browser check. Final task adds a `npx react-doctor` pass on the touched files.

---

## File map

**New:**

```
apps/front/src/lib/clipboard.ts                                                — extracted copyToClipboard helper
apps/front/src/routes/marketing/_data/changelog.tsx                           — types, entries, helpers
apps/front/src/routes/marketing/_components/entry-type-pill.tsx               — pill per type tag
apps/front/src/routes/marketing/_components/version-pill.tsx                  — #vX-Y-Z anchor + copy
apps/front/src/routes/marketing/_components/changelog-entry.tsx               — single timeline entry
apps/front/src/routes/marketing/_components/changelog-stats.tsx               — gated stats row
apps/front/src/routes/marketing/_components/changelog-year-chips.tsx          — year navigation pills
apps/front/src/routes/marketing/_components/changelog-subscribe-band.tsx      — gated subscribe form
apps/front/src/routes/marketing/changelog/changelog-page.tsx                  — /changelog/:year
apps/front/src/routes/marketing/changelog/changelog-redirect-route.tsx        — bare /changelog
```

**Modified:**

```
apps/front/src/lib/features/flags.ts                                          — add 2 flags
apps/front/src/routes/_tree/marketing.routes.ts                               — register 2 routes
apps/front/src/routes/marketing/_components/blog-article-page.tsx             — swap inline copyToClipboard for shared util
docs/guides/marketing-surface-conventions.md                                  — add primitives table entries + hardcoded-color exception
```

---

## Task 1: Add the two new feature flags

**Files:**
- Modify: `apps/front/src/lib/features/flags.ts`

- [ ] **Step 1: Add the flags inside the `marketing` branch**

Edit `apps/front/src/lib/features/flags.ts`. Find the `marketing:` block and add these two lines just below the existing `changelog: readFlag(...)` entry:

```ts
		// Phase 5 changelog secondary surfaces — default OFF, opt-in once
		// real data / signup endpoint exist
		changelogStats: readFlag('VITE_FEATURE_MARKETING_CHANGELOG_STATS', false),
		changelogSubscribe: readFlag('VITE_FEATURE_MARKETING_CHANGELOG_SUBSCRIBE', false),
```

The full `marketing:` block after the edit should look like:

```ts
	marketing: {
		// Phase 3 supporting pages — built but not all needed at launch
		about: readFlag('VITE_FEATURE_MARKETING_ABOUT', true),
		contact: readFlag('VITE_FEATURE_MARKETING_CONTACT', true),
		security: readFlag('VITE_FEATURE_MARKETING_SECURITY', true),
		// Path segments only — pages not built yet, footer links 404 to
		// MarketingNotFoundPage when enabled
		blog: readFlag('VITE_FEATURE_MARKETING_BLOG', true),
		changelog: readFlag('VITE_FEATURE_MARKETING_CHANGELOG', true),
		// Phase 5 changelog secondary surfaces — default OFF, opt-in once
		// real data / signup endpoint exist
		changelogStats: readFlag('VITE_FEATURE_MARKETING_CHANGELOG_STATS', false),
		changelogSubscribe: readFlag('VITE_FEATURE_MARKETING_CHANGELOG_SUBSCRIBE', false),
		integrations: readFlag('VITE_FEATURE_MARKETING_INTEGRATIONS', true),
		help: readFlag('VITE_FEATURE_MARKETING_HELP', true),
		community: readFlag('VITE_FEATURE_MARKETING_COMMUNITY', true),
	},
```

- [ ] **Step 2: Type-check**

Run: `just tsc-front`
Expected: clean (only the dotenv injection notices, no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/lib/features/flags.ts
git commit -m "feat(front): add marketing.changelogStats and marketing.changelogSubscribe flags

Both default OFF — let the changelog page ship in lean form, opt-in via
env when real data / signup endpoint land."
```

---

## Task 2: Extract copyToClipboard to a shared util

**Files:**
- Create: `apps/front/src/lib/clipboard.ts`
- Modify: `apps/front/src/routes/marketing/_components/blog-article-page.tsx`

- [ ] **Step 1: Create the shared util**

Create `apps/front/src/lib/clipboard.ts` with this exact content:

```ts
// Copy a string to the system clipboard. Returns true on success.
//
// Uses the modern `navigator.clipboard.writeText` API when available; falls
// back to a `window.prompt` (which lets the user manually copy from the
// dialog) on older browsers and SSR-safe in case `navigator` / `window` are
// undefined. Returns false only when neither path is reachable (server-side
// render path with no fallback).
export const copyToClipboard = async (text: string): Promise<boolean> => {
	if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// fall through to prompt fallback
		}
	}

	if (typeof window !== 'undefined') {
		window.prompt('Copy this URL', text);
		return true;
	}

	return false;
};
```

- [ ] **Step 2: Replace the inline helper in blog-article-page.tsx**

Open `apps/front/src/routes/marketing/_components/blog-article-page.tsx`.

Find the inline `copyToClipboard` function declaration (around line 384, starts with `const copyToClipboard = async (text: string): Promise<boolean> => {`) and **delete the entire function block** (about 18 lines, ends at the closing `};`).

Add an import at the top of the file (alongside the existing `#app/components/...` imports):

```ts
import { copyToClipboard } from '#app/lib/clipboard.ts';
```

The remaining `await copyToClipboard(pageUrl)` call inside `ShareRow.handleClick` should now resolve to the imported helper — no other change needed.

- [ ] **Step 3: Type-check + lint**

Run: `just tsc-front && just check-write`
Expected: both clean. (Type-check verifies the import resolves; lint ensures no unused symbols.)

- [ ] **Step 4: Manual smoke check**

Open `/blog/multi-tenant-architecture-lessons` in the browser. Click the **link** icon in the share row at the bottom of the article. Expected: tooltip changes to "Copied!" and the icon swaps to a check for ~2 seconds. Paste somewhere to confirm the URL was actually copied.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/lib/clipboard.ts apps/front/src/routes/marketing/_components/blog-article-page.tsx
git commit -m "refactor(front): extract copyToClipboard to lib/clipboard.ts

Promoted from inline helper in blog-article-page.tsx so the upcoming
changelog VersionPill can reuse it. No behavior change for the blog
ShareRow."
```

---

## Task 3: EntryTypePill component + visual map

**Files:**
- Create: `apps/front/src/routes/marketing/_components/entry-type-pill.tsx`

- [ ] **Step 1: Create the component**

Create `apps/front/src/routes/marketing/_components/entry-type-pill.tsx`:

```tsx
import Box from '@mui/material/Box';

// ----------------------------------------------------------------------

export type ChangelogEntryType =
	| 'feature'
	| 'improvement'
	| 'fix'
	| 'performance'
	| 'security'
	| 'breaking'
	| 'deprecation'
	| 'documentation';

// Visual contract per entry type. Backgrounds tap MUI semantic palette
// where it fits ('error' / 'info' / 'secondary' / 'primary'); 'breaking'
// uses a hardcoded amber (#D97706) added to the marketing-surface-
// conventions.md "approved hardcoded-color exceptions" list.
const ENTRY_TYPE_VISUALS: Record<
	ChangelogEntryType,
	{ bg: string; color: string; label: string }
> = {
	feature: { bg: 'primary.main', color: 'common.white', label: 'Feature' },
	improvement: { bg: 'info.lighter', color: 'info.dark', label: 'Improvement' },
	fix: { bg: 'background.neutral', color: 'text.primary', label: 'Fix' },
	performance: {
		bg: 'secondary.lighter',
		color: 'secondary.dark',
		label: 'Performance',
	},
	security: { bg: 'error.lighter', color: 'error.dark', label: 'Security' },
	// `#D97706` — approved hardcoded color (see marketing-surface-conventions).
	breaking: { bg: '#D97706', color: 'common.white', label: 'Breaking' },
	deprecation: {
		bg: 'text.disabled',
		color: 'common.white',
		label: 'Deprecation',
	},
	documentation: { bg: 'info.lighter', color: 'info.dark', label: 'Docs' },
};

type EntryTypePillProps = {
	type: ChangelogEntryType;
};

export const EntryTypePill = ({ type }: EntryTypePillProps) => {
	const v = ENTRY_TYPE_VISUALS[type];

	return (
		<Box
			component="span"
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				px: '8px',
				py: '2px',
				borderRadius: '6px',
				fontSize: 10,
				fontWeight: 700,
				letterSpacing: '0.05em',
				textTransform: 'uppercase',
				bgcolor: v.bg,
				color: v.color,
			}}
		>
			{v.label}
		</Box>
	);
};
```

- [ ] **Step 2: Type-check**

Run: `just tsc-front`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/_components/entry-type-pill.tsx
git commit -m "feat(front): add EntryTypePill component for changelog entries

8-type union (feature/improvement/fix/performance/security/breaking/
deprecation/documentation) with a per-type visual map. Hardcoded
#D97706 for 'breaking' will be added to the conventions guide's
approved-color-exceptions list."
```

---

## Task 4: VersionPill component (anchor + copy-to-clipboard)

**Files:**
- Create: `apps/front/src/routes/marketing/_components/version-pill.tsx`

- [ ] **Step 1: Create the component**

Create `apps/front/src/routes/marketing/_components/version-pill.tsx`:

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useState } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { copyToClipboard } from '#app/lib/clipboard.ts';

// ----------------------------------------------------------------------

// Convert a semver-style version string into an HTML-id-safe anchor slug.
// 'v1.4.2' → 'v1-4-2'. Dots are valid in HTML ids but ugly in CSS selectors
// (need backslash-escape) — dashes match the rest of our slug conventions.
export const slugifyVersion = (version: string): string => {
	return version.toLowerCase().replace(/\./g, '-');
};

// ----------------------------------------------------------------------

type VersionPillProps = {
	version: string; // 'v1.4.2'
};

export const VersionPill = ({ version }: VersionPillProps) => {
	const [copied, setCopied] = useState(false);
	const slug = slugifyVersion(version);

	const handleClick = async (event: React.MouseEvent<HTMLAnchorElement>) => {
		event.preventDefault();

		// Build the absolute URL so the copied link includes origin + the
		// year route the entry is rendered on.
		const absoluteUrl =
			typeof window !== 'undefined'
				? `${window.location.origin}${window.location.pathname}#${slug}`
				: `#${slug}`;

		const ok = await copyToClipboard(absoluteUrl);

		if (ok) {
			setCopied(true);
			setTimeout(() => {
				return setCopied(false);
			}, 2000);
		}

		// Smooth-scroll the entry into view after the copy succeeds. Each
		// entry has scrollMarginTop in its sx so it parks below the topbar.
		if (typeof document !== 'undefined') {
			const target = document.getElementById(slug);
			target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	};

	return (
		<Stack
			component="a"
			href={`#${slug}`}
			onClick={handleClick}
			direction="row"
			spacing={0.75}
			alignItems="center"
			aria-label={copied ? 'Copied' : `Copy link to ${version}`}
			title={copied ? 'Copied!' : `Copy link to ${version}`}
			sx={{
				display: 'inline-flex',
				px: 1,
				py: '4px',
				borderRadius: '6px',
				bgcolor: 'background.neutral',
				color: 'text.secondary',
				fontFamily:
					'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
				fontSize: 11,
				fontWeight: 500,
				textDecoration: 'none',
				border: '1px solid',
				borderColor: 'transparent',
				cursor: 'pointer',
				transition: 'background-color 200ms ease, border-color 200ms ease',
				'&:hover': {
					bgcolor: 'background.paper',
					borderColor: 'divider',
				},
			}}
		>
			<Box component="span">{`#${version}`}</Box>
			<Iconify
				icon={copied ? 'ph:check-bold' : 'ph:link-bold'}
				width={11}
				sx={{
					color: copied ? 'primary.main' : 'inherit',
					transition: 'color 200ms ease',
				}}
			/>
		</Stack>
	);
};
```

- [ ] **Step 2: Verify icons are registered**

Both `ph:check-bold` and `ph:link-bold` are already in the icon registry (the blog ShareRow uses them). No icon-set update needed.

- [ ] **Step 3: Type-check**

Run: `just tsc-front`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/routes/marketing/_components/version-pill.tsx
git commit -m "feat(front): add VersionPill — mono #vX-Y-Z anchor with copy-on-click

Click → preventDefault, copy absolute URL, swap link icon to check for
2s, smooth-scroll the matching entry into view. Reuses the shared
copyToClipboard util."
```

---

## Task 5: Changelog data module (types + helpers + placeholder entries)

**Files:**
- Create: `apps/front/src/routes/marketing/_data/changelog.tsx`

- [ ] **Step 1: Create the data module**

Create `apps/front/src/routes/marketing/_data/changelog.tsx` (note `.tsx`):

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import {
	BLOG_CODE_INLINE_SX,
	BLOG_LINK_SX,
	BLOG_OL_SX,
	BLOG_P_SX,
	BlogCallout,
	BlogCodeBlock,
	Token,
} from '#app/routes/marketing/_components/blog-content-elements.tsx';
import type { ChangelogEntryType } from '#app/routes/marketing/_components/entry-type-pill.tsx';

// ----------------------------------------------------------------------

// Re-export so consumers can import both the type and the entries from
// one module without bouncing through entry-type-pill.tsx.
export type { ChangelogEntryType };

export type ChangelogEntry = {
	version: string;            // 'v1.4.2' — also serves as the anchor source
	date: string;               // ISO 'YYYY-MM-DD'
	title: string;
	types: ChangelogEntryType[]; // multi-tag supported
	body: ReactNode;             // inline JSX, composes from blog-content-elements
	heroImageSlug?: string;      // optional Unsplash slug for an inline image
	relatedBlogSlug?: string;    // optional companion blog post → "Read full release notes →"
	published?: boolean;         // hide without deleting; treat undefined as published
};

// ----------------------------------------------------------------------

// Placeholder entries. Sorted desc by date (most recent first). Replace
// pre-launch with real release notes. The helpers below derive years +
// per-year filtering from this single array.
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
	{
		version: 'v1.4.2',
		date: '2026-04-28',
		title: 'Cross-tab theme sync',
		types: ['feature'],
		relatedBlogSlug: 'multi-tenant-architecture-lessons',
		heroImageSlug: '1551288049-bebda4e38f71',
		body: (
			<>
				<Typography sx={BLOG_P_SX}>
					Theme switches now propagate across every open dashboard tab in
					under 200ms — no refresh, no flicker. Power users running multiple
					queue windows on a second monitor reported the visual disparity
					was worth fixing first.
				</Typography>
				<Typography sx={BLOG_P_SX}>
					The fix uses{' '}
					<Box component="code" sx={BLOG_CODE_INLINE_SX}>
						BroadcastChannel
					</Box>{' '}
					with a{' '}
					<Box component="code" sx={BLOG_CODE_INLINE_SX}>
						localStorage
					</Box>{' '}
					fallback for browsers that throttle inactive-tab events. The
					optimistic-update path means the local DOM updates instantly even
					before the preference round-trips to the server.
				</Typography>
			</>
		),
	},
	{
		version: 'v1.4.1',
		date: '2026-04-21',
		title: 'Fixed dashboard topbar bottom border regression',
		types: ['fix'],
		body: (
			<Typography sx={BLOG_P_SX}>
				A recent infrastructure deploy introduced a CSS regression that
				dropped the 1px inset border on the main application header at
				non-retina pixel ratios. Resolved globally by enforcing sub-pixel
				rendering on every sticky navigation shell.
			</Typography>
		),
	},
	{
		version: 'v1.4.0',
		date: '2026-04-14',
		title: 'New marketing site & homepage redesign',
		types: ['feature', 'breaking'],
		body: (
			<>
				<Typography sx={BLOG_P_SX}>
					The PublyApp public surface has been completely overhauled —
					transparent pricing, a dedicated engineering blog, this changelog
					you're reading, and a top-to-bottom design refresh.
				</Typography>
				<BlogCallout variant="warning" title="Heads up">
					Legacy API v1 endpoints (published before 2024) are now
					officially deprecated from public documentation. They keep
					working through Q3 2026; sunset date is on the API status page.
				</BlogCallout>
			</>
		),
	},
	{
		version: 'v1.3.5',
		date: '2026-04-07',
		title: 'Approval workflows for team plans',
		types: ['feature'],
		body: (
			<>
				<Typography sx={BLOG_P_SX}>
					Team admins can now define sequential approval chains across
					departments. Assigned gatekeepers approve, reject with feedback,
					or directly edit queued content. Audit logs ship in the queue
					composer sidebar.
				</Typography>
				<Box component="ol" sx={BLOG_OL_SX}>
					<li>Set up roles in Team settings → Approval workflows</li>
					<li>Pin gatekeepers to specific content types or networks</li>
					<li>Drafts auto-route based on author + content type rules</li>
				</Box>
			</>
		),
	},
	{
		version: 'v1.3.4',
		date: '2026-03-31',
		title: 'Bulk schedule import from CSV + recurring queues',
		types: ['feature', 'improvement'],
		body: (
			<>
				<Typography sx={BLOG_P_SX}>
					Heavy-duty CSV parser support for mapping custom column schemas
					directly into your advocate queue. New conflict-resolution modal
					flags timestamp clashes with existing recurring slots before
					they ship.
				</Typography>
				<BlogCodeBlock language="CSV" withChrome={false}>
					{`scheduled_at,network,channel,body
2026-04-01T09:00:00Z,linkedin,@brand,"Q2 launch — see thread"
2026-04-01T09:30:00Z,twitter,@brand,"1/ Today we're rolling out…"`}
				</BlogCodeBlock>
			</>
		),
	},
	{
		version: 'v1.3.3',
		date: '2026-03-24',
		title: 'Faster initial load on the queue dashboard',
		types: ['performance'],
		body: (
			<Typography sx={BLOG_P_SX}>
				The queue dashboard's initial paint dropped from 1.8s to 720ms
				(p75) after we deferred the analytics widgets to a second render
				pass and split the queue grid out of the main bundle.
			</Typography>
		),
	},
	{
		version: 'v1.3.2',
		date: '2026-03-17',
		title: 'Rate-limit hardening on the public API',
		types: ['security'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Per-tenant request quotas are now enforced at the edge instead of
				the application tier. Expected impact: zero (most tenants are well
				under quota); upper bound is 1000 req/min per token, see the API
				docs for new {' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					X-RateLimit-*
				</Box>{' '}
				headers.
			</Typography>
		),
	},
	{
		version: 'v1.3.1',
		date: '2026-03-10',
		title: 'Updated API docs for the new analytics endpoints',
		types: ['documentation'],
		body: (
			<Typography sx={BLOG_P_SX}>
				The{' '}
				<Box component="a" href="#" sx={BLOG_LINK_SX}>
					API reference
				</Box>{' '}
				now covers the new /v2/analytics endpoints with full request /
				response examples and copy-paste curl snippets. Includes the
				v2 cursor-pagination model.
			</Typography>
		),
	},
	{
		version: 'v1.3.0',
		date: '2026-02-28',
		title: 'Brand voice profiles + tone consistency checker',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				Define a brand voice profile per workspace; the composer flags
				tone drift before publish. Currently English-only — Spanish and
				French are next.
			</Typography>
		),
	},
	{
		version: 'v1.2.9',
		date: '2026-02-14',
		title: 'Legacy webhook payload schema deprecation',
		types: ['deprecation'],
		body: (
			<Typography sx={BLOG_P_SX}>
				The pre-2024 webhook payload shape (snake_case, no envelope) is
				deprecated. v2 payloads (camelCase, wrapped in{' '}
				<Box component="code" sx={BLOG_CODE_INLINE_SX}>
					{'{ event, data }'}
				</Box>
				) have been the default for new endpoints since Jan. Migration
				guide on the docs site; sunset date Q4 2026.
			</Typography>
		),
	},
	{
		version: 'v1.2.8',
		date: '2025-12-12',
		title: 'Holiday-mode auto-pause for the entire workspace',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				One toggle pauses all queues + suppresses non-urgent notifications
				until a date you set. Resumes automatically; no need to remember
				on January 2nd.
			</Typography>
		),
	},
	{
		version: 'v1.2.7',
		date: '2025-11-04',
		title: 'Dark mode in the dashboard (finally)',
		types: ['feature'],
		body: (
			<Typography sx={BLOG_P_SX}>
				The dashboard now respects your system preference and exposes a
				manual toggle in the top-right. Marketing surface stayed light-only;
				dark for the dashboard is opt-in per workspace.
			</Typography>
		),
	},
];

// ----------------------------------------------------------------------
// Helpers — derive years + per-year filtering from CHANGELOG_ENTRIES.
// All consumers should go through these; never iterate CHANGELOG_ENTRIES
// directly outside this module.

export const getPublishedEntries = (): ChangelogEntry[] => {
	return CHANGELOG_ENTRIES.filter((e) => {
		return e.published !== false;
	});
};

const yearOf = (entry: ChangelogEntry): number => {
	return new Date(entry.date).getUTCFullYear();
};

// Available years, deduped, sorted descending. Empty array if no entries.
export const getAvailableYears = (): number[] => {
	const years = new Set<number>();
	for (const entry of getPublishedEntries()) {
		years.add(yearOf(entry));
	}
	return Array.from(years).sort((a, b) => {
		return b - a;
	});
};

export const getLatestYear = (): number | null => {
	const years = getAvailableYears();
	return years.length > 0 ? years[0]! : null;
};

// Entries for a given year, sorted desc by date. Returns [] if year empty.
export const getEntriesForYear = (year: number): ChangelogEntry[] => {
	return getPublishedEntries()
		.filter((e) => {
			return yearOf(e) === year;
		})
		.sort((a, b) => {
			return new Date(b.date).getTime() - new Date(a.date).getTime();
		});
};
```

- [ ] **Step 2: Type-check**

Run: `just tsc-front`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/_data/changelog.tsx
git commit -m "feat(front): add changelog data module with 12 placeholder entries

Single source of truth: types, entries, helpers (getAvailableYears,
getLatestYear, getEntriesForYear, getPublishedEntries). Entry bodies
compose from blog-content-elements.tsx (Phase 4 kit). Mix of all 8
entry types across 2026 + 2025 to exercise the full visual range."
```

---

## Task 6: ChangelogEntry component

**Files:**
- Create: `apps/front/src/routes/marketing/_components/changelog-entry.tsx`

- [ ] **Step 1: Create the component**

Create `apps/front/src/routes/marketing/_components/changelog-entry.tsx`:

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import {
	BlogFigure,
} from '#app/routes/marketing/_components/blog-content-elements.tsx';
import { EntryTypePill } from '#app/routes/marketing/_components/entry-type-pill.tsx';
import {
	slugifyVersion,
	VersionPill,
} from '#app/routes/marketing/_components/version-pill.tsx';
import type { ChangelogEntry as ChangelogEntryType } from '#app/routes/marketing/_data/changelog.tsx';

// ----------------------------------------------------------------------

const formatDate = (
	iso: string,
): { dayMonth: string; year: string; full: string } => {
	const d = new Date(iso);
	const dayMonth = d
		.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
		.toUpperCase();
	const year = d.toLocaleDateString('en-US', { year: 'numeric' });
	const full = d
		.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: '2-digit',
		})
		.toUpperCase();
	return { dayMonth, year, full };
};

// ----------------------------------------------------------------------

const unsplashCover = (slug: string): string => {
	return `https://images.unsplash.com/photo-${slug}?w=800&h=450&fit=crop&auto=format&q=80`;
};

// ----------------------------------------------------------------------

type ChangelogEntryProps = {
	entry: ChangelogEntryType;
};

export const ChangelogEntry = ({ entry }: ChangelogEntryProps) => {
	const slug = slugifyVersion(entry.version);
	const date = formatDate(entry.date);

	return (
		<Box
			id={slug}
			sx={{
				display: 'grid',
				gridTemplateColumns: { xs: '1fr', lg: '140px 1fr' },
				alignItems: 'flex-start',
				// scrollMarginTop parks the entry below the fixed topbar when
				// targeted via #anchor (direct URL load OR VersionPill click).
				scrollMarginTop: 'calc(var(--layout-header-desktop-height) + 24px)',
			}}
		>
			{/* Date column — sticky on lg+, hidden on xs/sm/md. */}
			<Box
				sx={{
					display: { xs: 'none', lg: 'block' },
					position: 'sticky',
					top: 'calc(var(--layout-header-desktop-height) + 32px)',
					pr: 6,
					textAlign: 'right',
					alignSelf: 'flex-start',
				}}
			>
				<Typography
					sx={{
						fontSize: 24,
						fontWeight: 700,
						color: 'text.primary',
						lineHeight: 1,
						letterSpacing: '-0.01em',
					}}
				>
					{date.dayMonth}
				</Typography>
				<Typography
					sx={{
						fontSize: 11,
						fontWeight: 700,
						letterSpacing: '0.12em',
						textTransform: 'uppercase',
						color: 'text.secondary',
						mt: 0.75,
					}}
				>
					{date.year}
				</Typography>
			</Box>

			{/* Content column — node dot + dashed line live on the left rail. */}
			<Box
				sx={{
					position: 'relative',
					pl: { xs: 3, lg: 5 },
					pb: { xs: 8, md: 10 },
					ml: { xs: 1, lg: 0 },
					borderLeft: '1px dashed',
					borderLeftColor: 'divider',
				}}
			>
				{/* Node dot (green) — punched out of the dashed line via ring. */}
				<Box
					aria-hidden="true"
					sx={{
						position: 'absolute',
						top: 4,
						left: '-5.5px',
						width: 10,
						height: 10,
						borderRadius: '50%',
						bgcolor: 'primary.main',
						boxShadow: '0 0 0 4px var(--mui-palette-background-default)',
					}}
				/>

				{/* Mobile-only inline date — the desktop date column is hidden. */}
				<Typography
					sx={{
						display: { xs: 'block', lg: 'none' },
						fontSize: 13,
						fontWeight: 700,
						color: 'text.primary',
						mb: 2,
					}}
				>
					{date.full}
				</Typography>

				{/* Pills row: version + types */}
				<Stack
					direction="row"
					spacing={1.25}
					alignItems="center"
					sx={{ flexWrap: 'wrap', mb: 2 }}
				>
					<VersionPill version={entry.version} />
					{entry.types.map((type) => {
						return <EntryTypePill key={type} type={type} />;
					})}
				</Stack>

				<Typography
					component="h3"
					sx={{
						fontSize: { xs: 20, md: 22 },
						fontWeight: 700,
						color: 'text.primary',
						letterSpacing: '-0.01em',
						mb: 2,
					}}
				>
					{entry.title}
				</Typography>

				<Box>{entry.body}</Box>

				{entry.heroImageSlug ? (
					<BlogFigure
						src={unsplashCover(entry.heroImageSlug)}
						alt={entry.title}
						ratio="16/9"
					/>
				) : null}

				{entry.relatedBlogSlug ? (
					<Box
						component={RouterLink}
						href={`/blog/${entry.relatedBlogSlug}`}
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 0.75,
							mt: 2,
							color: 'primary.main',
							fontSize: 14,
							fontWeight: 600,
							textDecoration: 'none',
							'&:hover': { textDecoration: 'underline' },
							'& .arrow': { transition: 'transform 200ms ease' },
							'&:hover .arrow': { transform: 'translateX(3px)' },
						}}
					>
						Read full release notes
						<Iconify
							icon="ph:arrow-right-bold"
							width={14}
							className="arrow"
						/>
					</Box>
				) : null}
			</Box>
		</Box>
	);
};
```

- [ ] **Step 2: Type-check**

Run: `just tsc-front`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/_components/changelog-entry.tsx
git commit -m "feat(front): add ChangelogEntry — sticky date + dashed timeline + body

2-col grid on lg+ with sticky date column (140px). Mobile collapses to a
single column with inline date above the content. Owns the dashed line +
green node dot + scrollMarginTop for #anchor parking. Composes
VersionPill, EntryTypePill, and BlogFigure for optional inline images."
```

---

## Task 7: ChangelogStats component (gated)

**Files:**
- Create: `apps/front/src/routes/marketing/_components/changelog-stats.tsx`

- [ ] **Step 1: Create the component**

Create `apps/front/src/routes/marketing/_components/changelog-stats.tsx`:

```tsx
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

// ----------------------------------------------------------------------

type Stat = {
	value: string;
	label: string;
	highlight?: boolean;
};

type ChangelogStatsProps = {
	releasesShipped: number;
	featuresYtd: number;
	uptime: string; // e.g. '99.97%'
};

export const ChangelogStats = ({
	releasesShipped,
	featuresYtd,
	uptime,
}: ChangelogStatsProps) => {
	const stats: Stat[] = [
		{ value: releasesShipped.toString(), label: 'Releases shipped' },
		{ value: featuresYtd.toString(), label: 'Features in 2026' },
		{ value: uptime, label: 'Uptime SLA', highlight: true },
	];

	return (
		<Container maxWidth="md" sx={{ pb: { xs: 4, md: 6 } }}>
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				divider={
					<Box
						sx={{
							display: { xs: 'block', sm: 'block' },
							width: { xs: '100%', sm: '1px' },
							height: { xs: '1px', sm: 'auto' },
							bgcolor: 'divider',
						}}
					/>
				}
				sx={{
					borderRadius: '20px',
					border: '1px solid',
					borderColor: 'divider',
					bgcolor: 'background.paper',
					boxShadow: '0 1px 2px rgba(31,41,55,0.03)',
					overflow: 'hidden',
				}}
			>
				{stats.map((stat) => {
					return (
						<Stack
							key={stat.label}
							alignItems="center"
							justifyContent="center"
							spacing={1}
							sx={{ flex: 1, py: { xs: 4, md: 5 }, px: 3 }}
						>
							<Typography
								sx={{
									fontSize: { xs: 28, md: 32 },
									fontWeight: 700,
									color: stat.highlight ? 'primary.main' : 'text.primary',
									letterSpacing: '-0.02em',
									lineHeight: 1,
								}}
							>
								{stat.value}
							</Typography>
							<Typography
								sx={{
									fontSize: 10,
									fontWeight: 700,
									letterSpacing: '0.12em',
									textTransform: 'uppercase',
									color: 'text.secondary',
								}}
							>
								{stat.label}
							</Typography>
						</Stack>
					);
				})}
			</Stack>
		</Container>
	);
};
```

- [ ] **Step 2: Type-check**

Run: `just tsc-front`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/_components/changelog-stats.tsx
git commit -m "feat(front): add ChangelogStats (gated) — 3 stat cards in a divided row"
```

---

## Task 8: ChangelogYearChips component

**Files:**
- Create: `apps/front/src/routes/marketing/_components/changelog-year-chips.tsx`

- [ ] **Step 1: Create the component**

Create `apps/front/src/routes/marketing/_components/changelog-year-chips.tsx`:

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';

import { RouterLink } from '#app/components/router-link.tsx';

// ----------------------------------------------------------------------

type ChangelogYearChipsProps = {
	years: number[];      // available years, sorted desc
	activeYear: number;
};

export const ChangelogYearChips = ({
	years,
	activeYear,
}: ChangelogYearChipsProps) => {
	// Only one year worth navigating between → render nothing. Saves a
	// noisy single-pill row when the catalogue is small.
	if (years.length <= 1) {
		return null;
	}

	return (
		<Stack
			direction="row"
			spacing={1}
			justifyContent="center"
			sx={{ flexWrap: 'wrap', mb: { xs: 6, md: 8 }, px: 2 }}
			role="navigation"
			aria-label="Changelog year navigation"
		>
			{years.map((year) => {
				const active = year === activeYear;
				return (
					<Box
						key={year}
						component={RouterLink}
						href={`/changelog/${year}`}
						aria-current={active ? 'page' : undefined}
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							px: 2,
							py: '6px',
							borderRadius: '10px',
							fontSize: 12,
							fontWeight: 600,
							textDecoration: 'none',
							border: '1px solid',
							borderColor: active ? 'primary.main' : 'divider',
							bgcolor: active ? 'primary.main' : 'background.paper',
							color: active ? 'common.white' : 'text.primary',
							boxShadow: active
								? '0 6px 16px 0 rgba(16,185,129,0.25)'
								: '0 1px 2px 0 rgba(0,0,0,0.04)',
							transition:
								'background-color 200ms ease, color 200ms ease, border-color 200ms ease',
							'&:hover': active
								? undefined
								: { bgcolor: 'background.neutral' },
						}}
					>
						{year}
					</Box>
				);
			})}
		</Stack>
	);
};
```

- [ ] **Step 2: Type-check**

Run: `just tsc-front`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/_components/changelog-year-chips.tsx
git commit -m "feat(front): add ChangelogYearChips — RouterLink-based year navigation

Renders nothing when only one year exists. Active year gets the primary
fill + glow shadow. Each chip is a real RouterLink (path-segment
navigation, not query-param filter)."
```

---

## Task 9: ChangelogSubscribeBand component (gated)

**Files:**
- Create: `apps/front/src/routes/marketing/_components/changelog-subscribe-band.tsx`

- [ ] **Step 1: Create the component**

Create `apps/front/src/routes/marketing/_components/changelog-subscribe-band.tsx`:

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';

// ----------------------------------------------------------------------

export const ChangelogSubscribeBand = () => {
	return (
		<Box
			sx={{
				mt: { xs: 6, md: 10 },
				p: { xs: 4, md: 5 },
				borderRadius: '20px',
				border: '1px solid',
				borderColor: 'divider',
				bgcolor: 'background.neutral',
			}}
		>
			<Stack
				direction={{ xs: 'column', md: 'row' }}
				alignItems={{ xs: 'flex-start', md: 'center' }}
				justifyContent="space-between"
				spacing={{ xs: 3, md: 5 }}
			>
				<Stack
					direction={{ xs: 'column', sm: 'row' }}
					alignItems={{ xs: 'flex-start', sm: 'center' }}
					spacing={2}
					sx={{ flex: 1 }}
				>
					<Box
						sx={{
							width: 48,
							height: 48,
							borderRadius: '50%',
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							bgcolor: 'background.paper',
							color: 'primary.main',
							border: '1px solid',
							borderColor: 'divider',
							flexShrink: 0,
						}}
					>
						<Iconify icon="ph:envelope-bold" width={20} />
					</Box>
					<Box>
						<Typography
							component="p"
							sx={{ fontSize: 18, fontWeight: 700, color: 'text.primary' }}
						>
							Get the changelog in your inbox
						</Typography>
						<Typography
							sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}
						>
							One email per release. Zero marketing fluff.
						</Typography>
					</Box>
				</Stack>

				<Box
					component="form"
					onSubmit={(e: React.FormEvent) => {
						e.preventDefault();
					}}
					sx={{
						display: 'flex',
						gap: 1,
						width: { xs: '100%', md: 'auto' },
						minWidth: { md: 360 },
					}}
				>
					<Box
						component="input"
						type="email"
						placeholder="you@company.com"
						aria-label="Email address"
						required
						sx={{
							flex: 1,
							py: 1.25,
							px: 1.75,
							fontSize: 14,
							borderRadius: '12px',
							border: '1px solid',
							borderColor: 'divider',
							bgcolor: 'background.paper',
							color: 'text.primary',
							outline: 'none',
							transition: 'border-color 200ms ease, box-shadow 200ms ease',
							'&:focus': {
								borderColor: 'primary.main',
								boxShadow: '0 0 0 3px rgba(16,185,129,0.15)',
							},
						}}
					/>
					<Box
						component="button"
						type="submit"
						sx={{
							py: 1.25,
							px: 2.5,
							fontSize: 14,
							fontWeight: 700,
							borderRadius: '12px',
							border: 'none',
							cursor: 'pointer',
							bgcolor: 'text.primary',
							color: 'background.paper',
							transition: 'opacity 200ms ease',
							'&:hover': { opacity: 0.85 },
						}}
					>
						Subscribe
					</Box>
				</Box>
			</Stack>
		</Box>
	);
};
```

- [ ] **Step 2: Type-check**

Run: `just tsc-front`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/_components/changelog-subscribe-band.tsx
git commit -m "feat(front): add ChangelogSubscribeBand (gated) — email signup

Form is preventDefault no-op for v1 (no backend, mirrors blog newsletter
card). Wire to a real signup endpoint before flipping the
marketing.changelogSubscribe flag in production."
```

---

## Task 10: ChangelogPage (the year route)

**Files:**
- Create: `apps/front/src/routes/marketing/changelog/changelog-page.tsx`

- [ ] **Step 1: Create the page**

Create `apps/front/src/routes/marketing/changelog/changelog-page.tsx`:

```tsx
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useParams } from 'react-router';

import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { FEATURES } from '#app/lib/features/flags.ts';
import { ChangelogEntry } from '#app/routes/marketing/_components/changelog-entry.tsx';
import { ChangelogStats } from '#app/routes/marketing/_components/changelog-stats.tsx';
import { ChangelogSubscribeBand } from '#app/routes/marketing/_components/changelog-subscribe-band.tsx';
import { ChangelogYearChips } from '#app/routes/marketing/_components/changelog-year-chips.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import {
	getAvailableYears,
	getEntriesForYear,
} from '#app/routes/marketing/_data/changelog.tsx';

// ----------------------------------------------------------------------

const isValidYearString = (year: string | undefined): year is string => {
	return typeof year === 'string' && /^\d{4}$/.test(year);
};

// ----------------------------------------------------------------------

const ChangelogPage = () => {
	const { year: yearParam } = useParams<{ year?: string }>();

	if (!isValidYearString(yearParam)) {
		throw new Response('Not Found', { status: 404 });
	}

	const year = parseInt(yearParam, 10);
	const availableYears = getAvailableYears();

	if (!availableYears.includes(year)) {
		throw new Response('Not Found', { status: 404 });
	}

	const entries = getEntriesForYear(year);

	return (
		<>
			<MarketingHero
				eyebrow="Changelog"
				eyebrowIcon="ph:rocket-launch-fill"
				title="What's new in PublyApp"
				subhead="Product updates, fixes, and behind-the-scenes wins. Updated weekly."
			/>

			{FEATURES.marketing.changelogStats ? (
				<ChangelogStats
					releasesShipped={128}
					featuresYtd={47}
					uptime="99.97%"
				/>
			) : null}

			<ChangelogYearChips years={availableYears} activeYear={year} />

			<Container maxWidth="md" sx={{ pb: { xs: 8, md: 12 } }}>
				{entries.length === 0 ? (
					<Stack
						alignItems="center"
						spacing={2}
						sx={{
							py: { xs: 8, md: 12 },
							textAlign: 'center',
							borderRadius: '20px',
							border: '1px dashed',
							borderColor: 'divider',
							bgcolor: 'background.neutral',
						}}
					>
						<Box
							sx={{
								width: 56,
								height: 56,
								borderRadius: '50%',
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								bgcolor: 'background.paper',
								color: 'text.secondary',
								border: '1px solid',
								borderColor: 'divider',
							}}
						>
							<Iconify icon="ph:rocket-launch-fill" width={24} />
						</Box>
						<Typography
							sx={{ fontSize: 18, fontWeight: 700, color: 'text.primary' }}
						>
							No releases for {year}
						</Typography>
						<Typography
							sx={{ fontSize: 14, color: 'text.secondary', maxWidth: 380 }}
						>
							Try another year above — we shipped plenty.
						</Typography>
					</Stack>
				) : (
					<Stack spacing={0}>
						{entries.map((entry) => {
							return <ChangelogEntry key={entry.version} entry={entry} />;
						})}
					</Stack>
				)}

				{FEATURES.marketing.changelogSubscribe ? (
					<ChangelogSubscribeBand />
				) : null}
			</Container>

			<CtaBand
				eyebrowLabel="Start scaling today"
				title={'Start using the latest\nfeatures today'}
				subhead="Join thousands of teams turning their followers into active brand advocates."
				ctaLabel="Start for Free"
				ctaHref={FRONT_PATH_NAMES.auth.signup}
				microcopy="14-day free trial. No credit card required."
			/>
		</>
	);
};

export default ChangelogPage;

// ----------------------------------------------------------------------

type MetaArgs = { params: { year?: string } };

export const meta = ({ params }: MetaArgs) => {
	const yearParam = params.year ?? '';
	const year = parseInt(yearParam, 10);
	const entries = Number.isFinite(year) ? getEntriesForYear(year) : [];
	const description = `${entries.length} releases shipped in ${yearParam}. Features, fixes, and behind-the-scenes wins.`;

	return [
		{ title: `Changelog · ${yearParam} | ${APP_NAME}` },
		{ name: 'description', content: description },
		{ property: 'og:title', content: `Changelog · ${yearParam} | ${APP_NAME}` },
		{ property: 'og:description', content: description },
		{ property: 'og:type', content: 'website' },
	];
};
```

- [ ] **Step 2: Type-check**

Run: `just tsc-front`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/changelog/changelog-page.tsx
git commit -m "feat(front): add ChangelogPage (/changelog/:year)

Validates :year against /^\\d{4}\$/ AND getAvailableYears() — invalid →
404 via the marketing catch-all. Composes MarketingHero +
(optional)Stats + YearChips + Entries + (optional)Subscribe + CtaBand.
Empty year defensively renders an inline empty state."
```

---

## Task 11: ChangelogRedirectRoute (the bare URL)

**Files:**
- Create: `apps/front/src/routes/marketing/changelog/changelog-redirect-route.tsx`

- [ ] **Step 1: Create the redirect route**

Create `apps/front/src/routes/marketing/changelog/changelog-redirect-route.tsx`:

```tsx
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { redirect } from 'react-router';

import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import { getLatestYear } from '#app/routes/marketing/_data/changelog.tsx';

// ----------------------------------------------------------------------

// React Router loader — runs BEFORE the route component renders. If we
// have entries, redirect to the latest year (302). Otherwise return null
// so the component can render its empty state.
export const loader = () => {
	const latest = getLatestYear();
	if (latest !== null) {
		return redirect(`/changelog/${latest}`);
	}
	return null;
};

// ----------------------------------------------------------------------

// Reached only when the loader returned null (no published entries).
// The page mirrors the shape of the year route's empty state but at
// the top-level (no year context).
const ChangelogRedirectRoute = () => {
	return (
		<>
			<MarketingHero
				eyebrow="Changelog"
				eyebrowIcon="ph:rocket-launch-fill"
				title="What's new in PublyApp"
				subhead="Product updates, fixes, and behind-the-scenes wins. Updated weekly."
			/>

			<Container maxWidth="md" sx={{ pb: { xs: 8, md: 12 } }}>
				<Stack
					alignItems="center"
					spacing={2.5}
					sx={{
						py: { xs: 10, md: 14 },
						textAlign: 'center',
						borderRadius: '20px',
						border: '1px dashed',
						borderColor: 'divider',
						bgcolor: 'background.neutral',
					}}
				>
					<Box
						sx={{
							width: 56,
							height: 56,
							borderRadius: '50%',
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							bgcolor: 'background.paper',
							color: 'text.secondary',
							border: '1px solid',
							borderColor: 'divider',
						}}
					>
						<Iconify icon="ph:rocket-launch-fill" width={24} />
					</Box>
					<Typography
						sx={{ fontSize: 18, fontWeight: 700, color: 'text.primary' }}
					>
						No releases yet
					</Typography>
					<Typography
						sx={{ fontSize: 14, color: 'text.secondary', maxWidth: 420 }}
					>
						We're still warming up the press. New releases will land here
						soon — come back in a week.
					</Typography>
					<Box
						component={RouterLink}
						href="/"
						sx={{
							mt: 1,
							display: 'inline-flex',
							alignItems: 'center',
							gap: 0.75,
							color: 'primary.main',
							fontSize: 14,
							fontWeight: 600,
							textDecoration: 'none',
							'&:hover': { textDecoration: 'underline' },
						}}
					>
						Back to home
						<Iconify icon="ph:arrow-right-bold" width={14} />
					</Box>
				</Stack>
			</Container>

			<CtaBand
				eyebrowLabel="Start scaling today"
				title={'Start using the latest\nfeatures today'}
				subhead="Join thousands of teams turning their followers into active brand advocates."
				ctaLabel="Start for Free"
				ctaHref={FRONT_PATH_NAMES.auth.signup}
				microcopy="14-day free trial. No credit card required."
			/>
		</>
	);
};

export default ChangelogRedirectRoute;

// ----------------------------------------------------------------------

export const meta = () => [
	{ title: `Changelog | ${APP_NAME}` },
	{
		name: 'description',
		content: 'Product updates, fixes, and behind-the-scenes wins.',
	},
];
```

- [ ] **Step 2: Type-check**

Run: `just tsc-front`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/changelog/changelog-redirect-route.tsx
git commit -m "feat(front): add ChangelogRedirectRoute for the bare /changelog URL

Loader either redirects to /changelog/{latest year} (302) or returns
null and the route renders an empty-state page when no entries exist."
```

---

## Task 12: Register the routes

**Files:**
- Modify: `apps/front/src/routes/_tree/marketing.routes.ts`

- [ ] **Step 1: Add the route registrations**

Edit `apps/front/src/routes/_tree/marketing.routes.ts`. Find the existing `FEATURES.marketing.blog` spread and add an analogous block right after it (and before the catch-all `route('*', …)`):

```ts
		...(FEATURES.marketing.changelog
			? [
					route(
						'changelog',
						'routes/marketing/changelog/changelog-redirect-route.tsx',
					),
					route(
						'changelog/:year',
						'routes/marketing/changelog/changelog-page.tsx',
					),
				]
			: []),
```

The full `marketing.routes.ts` file should now look like:

```ts
import { index, layout, route } from '@react-router/dev/routes';

import { FEATURES } from '../../lib/features/flags.ts';

// Marketing routes — supporting pages (about/contact/security/blog/changelog)
// are flag-guarded. Disabled routes fall through to the catch-all 404 naturally.
export const marketingRoutes = [
	layout('routes/marketing/_layout/marketing-layout.tsx', [
		index('routes/marketing/home/home-page.tsx'),
		route('pricing', 'routes/marketing/pricing/pricing-page.tsx'),
		route('terms', 'routes/marketing/terms/terms-page.tsx'),
		route('privacy', 'routes/marketing/privacy/privacy-page.tsx'),
		route('cookies', 'routes/marketing/cookies/cookies-page.tsx'),
		...(FEATURES.marketing.about
			? [route('about', 'routes/marketing/about/about-page.tsx')]
			: []),
		...(FEATURES.marketing.contact
			? [route('contact', 'routes/marketing/contact/contact-page.tsx')]
			: []),
		...(FEATURES.marketing.security
			? [route('security', 'routes/marketing/security/security-page.tsx')]
			: []),
		...(FEATURES.marketing.blog
			? [
					route('blog', 'routes/marketing/blog/blog-index-page.tsx'),
					route('blog/:slug', 'routes/marketing/blog/blog-article-route.tsx'),
				]
			: []),
		...(FEATURES.marketing.changelog
			? [
					route(
						'changelog',
						'routes/marketing/changelog/changelog-redirect-route.tsx',
					),
					route(
						'changelog/:year',
						'routes/marketing/changelog/changelog-page.tsx',
					),
				]
			: []),
		route('*', 'routes/marketing/_errors/marketing-not-found-page.tsx'),
	]),
];
```

Also update the leading comment to mention `changelog` (already done in the snippet above).

- [ ] **Step 2: Type-check**

Run: `just tsc-front`
Expected: clean — the typegen pass picks up the new routes.

- [ ] **Step 3: Manual smoke check (the page is now reachable)**

Start the dev server (`just dev-front`) if not running. Then:

1. Visit `/changelog` → should 302 to `/changelog/2026`
2. Verify the page renders: hero, year chips (2026/2025 active), 10 entries for 2026, CtaBand
3. Click `2025` chip → URL becomes `/changelog/2025`, 2 entries render
4. Click a `#vX-Y-Z` pill → tooltip "Copied!", icon swaps for 2s, page scrolls so the entry sits below the topbar
5. Direct-load `/changelog/2026#v1-4-2` in a new tab → page loads, browser auto-scrolls to that entry below the topbar
6. Visit `/changelog/foo` → marketing 404 view
7. Visit `/changelog/2099` → marketing 404 view
8. (Optional) Set `VITE_FEATURE_MARKETING_CHANGELOG_STATS=true` in `.env.development` and reload → stats row appears
9. (Optional) Set `VITE_FEATURE_MARKETING_CHANGELOG_SUBSCRIBE=true` and reload → subscribe band appears
10. (Optional) Set `VITE_FEATURE_MARKETING_CHANGELOG=false` and reload → both routes 404

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/routes/_tree/marketing.routes.ts
git commit -m "feat(front): register /changelog and /changelog/:year routes

Both flag-guarded by FEATURES.marketing.changelog (existing). Falls
through to the marketing catch-all 404 cleanly when disabled."
```

---

## Task 13: Update marketing-surface-conventions.md

**Files:**
- Modify: `docs/guides/marketing-surface-conventions.md`

- [ ] **Step 1: Add `#D97706` to the approved hardcoded-color exceptions**

Edit `docs/guides/marketing-surface-conventions.md`. Find the **"Approved hardcoded-color exceptions"** section. Add a new bullet after the existing entries:

```md
| `#D97706` (warning amber) — used on the Changelog `breaking` entry-type pill | Deliberate semantic color: brighter than `warning.dark` (#B45309) so the pill reads at small sizes against muted bg. Treated as the canon "Breaking" tone across the marketing surface. |
```

(The exact format depends on whether the section is a table or a bulleted list — check the existing entries and match.)

- [ ] **Step 2: Add the new primitives to the shipped-primitives table**

Find the **"Shipped shared primitives"** table. Add three new rows at the bottom:

```md
| `ChangelogEntry` | Single timeline entry: 2-col on lg+ (140px sticky date + content column with dashed left rail + green node dot), single-column on mobile with inline date. Composes VersionPill, EntryTypePill, BlogFigure (optional), related-blog RouterLink (optional). `scrollMarginTop` parks the entry below the fixed topbar when targeted via #anchor. | `/changelog/:year` |
| `VersionPill` | Mono `#vX-Y-Z` anchor pill with click-to-copy (uses the shared `copyToClipboard` from `lib/clipboard.ts`). Click → preventDefault, copy absolute URL, swap link icon to check for 2s, smooth-scroll the matching entry into view. Renders as `<a href="#vX-Y-Z">` for keyboard + middle-click compatibility. | `ChangelogEntry` |
| `EntryTypePill` | Small uppercase pill per `ChangelogEntryType` (8 types: feature/improvement/fix/performance/security/breaking/deprecation/documentation). Visual map lives in the component file. `breaking` uses hardcoded `#D97706` (see approved-color exceptions). | `ChangelogEntry` |
```

- [ ] **Step 3: Type-check (markdown is not type-checked, but verify the file is valid)**

Run: `cat docs/guides/marketing-surface-conventions.md | head -200` to spot-check the section is well-formed.

- [ ] **Step 4: Commit**

```bash
git add docs/guides/marketing-surface-conventions.md
git commit -m "docs(marketing): codify Phase 5 primitives + #D97706 color exception"
```

---

## Task 14: Final verification + cleanup commit if needed

**Files:** none directly — this task runs all the checks and only commits if any auto-fixed.

- [ ] **Step 1: oxlint + oxfmt full pass**

Run: `just check-write`
Expected: `Found 0 warnings and 0 errors.` from oxlint, then oxfmt rewrites if any file needs reformatting.

If files were rewritten, stage and commit them:

```bash
git status
# If any files modified by oxfmt:
git add -u
git commit -m "chore(front): apply oxfmt to Phase 5 changelog files"
```

- [ ] **Step 2: TypeScript full pass**

Run: `just tsc-front`
Expected: clean (only the dotenv injection notices).

- [ ] **Step 3: react-doctor on touched files**

Run: `cd apps/front && npx react-doctor@latest . --verbose --diff`
Expected: a summary like "X warnings across Y files" — filter the output for the changelog/touched files only.

If any warnings appear in our touched files (`apps/front/src/lib/clipboard.ts`, `apps/front/src/routes/marketing/_components/changelog-*.tsx`, `apps/front/src/routes/marketing/_components/{entry-type,version}-pill.tsx`, `apps/front/src/routes/marketing/_data/changelog.tsx`, `apps/front/src/routes/marketing/changelog/*.tsx`, `apps/front/src/routes/_tree/marketing.routes.ts`, `apps/front/src/lib/features/flags.ts`):

- `no-array-index-as-key` → use `key={item.someStableId}` not `key={i}`
- `no-render-in-render` → extract the render helper into a proper `<ProperComponent />`
- `no-giant-component` → split the offending file into named sub-components within the same file (mirror the pattern used in `multi-tenant-architecture-lessons-article.tsx` from Phase 4)
- `no-nested-ternary` → use `let + if/else` and/or extract the branches into a helper component
- Other rules: read the in-place suggestion and apply it

If the only warnings are in pre-existing code outside the touched files, that's fine — they're not in scope for this task.

- [ ] **Step 4: Manual end-to-end smoke**

Re-run the manual checks from Task 12 Step 3 to confirm nothing regressed after lint/format passes:

1. `/changelog` → redirects to `/changelog/{latest year}`
2. `/changelog/{latest year}` → renders correctly
3. Other-year chip click → navigates and renders that year
4. `#vX-Y-Z` click → copies + scrolls
5. Invalid year → marketing 404
6. Toggle each flag → verify expected on/off behavior

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feature/marketing-changelog
gh pr create --title "feat(front): Phase 5 — /changelog page" --body "$(cat <<'PRBODY'
## Summary

- Closes the last unfinished page from the original 11-page marketing scope (issue #344)
- `/changelog` (bare) redirects to `/changelog/{latest year}` via React Router loader
- `/changelog/:year` renders a single-page vertical timeline of releases for that year
- 8-type entry classification with per-entry anchor + click-to-copy, optional `relatedBlogSlug` companion link
- New flags `marketing.changelogStats` + `marketing.changelogSubscribe` (default OFF)
- Body content reuses the `blog-content-elements.tsx` kit shipped in Phase 4

## Spec
docs/superpowers/specs/2026-05-06-marketing-changelog-design.md

## Test plan
- [ ] `just tsc-front` clean
- [ ] `just check-write` clean
- [ ] react-doctor 0 issues on touched files
- [ ] `/changelog` 302s to `/changelog/{latest year}`
- [ ] `/changelog/2026` renders all 2026 entries sorted desc
- [ ] Year chip click navigates between years; active state correct
- [ ] `#vX-Y-Z` click copies absolute URL + scrolls below topbar
- [ ] Direct-load with `#vX-Y-Z` parks the entry below the topbar
- [ ] `/changelog/foo` and `/changelog/2099` → marketing 404
- [ ] Each FEATURES flag toggle behaves correctly (route/stats/subscribe)
- [ ] Empty-catalogue state renders when every entry is unpublished

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
)"
```

---

## Self-review notes

**Spec coverage check** — every spec section maps to a task:

- Routes (`/changelog`, `/changelog/:year`): Tasks 10, 11, 12 ✓
- Data module + helpers: Task 5 ✓
- 8-type classification: Task 3 (visual map) + Task 5 (type union) ✓
- Anchor + copy: Task 4 ✓
- `relatedBlogSlug` link: Task 6 ✓
- Year chips as navigation: Task 8 ✓
- Body kit reuse from Phase 4: Task 5 imports from `blog-content-elements.tsx` ✓
- Two new flags: Task 1 ✓
- SEO `meta` per year: Task 10 ✓
- Sticky desktop date + inline mobile date: Task 6 ✓
- Approved-color exception for `#D97706`: Task 13 ✓
- Conventions table updates: Task 13 ✓
- `copyToClipboard` extraction: Task 2 ✓
- Validation + 404 for invalid `:year`: Task 10 ✓
- Bare-URL empty state: Task 11 ✓
- Per-year empty state: Task 10 ✓

**Type consistency** — the `ChangelogEntryType` union is defined in `entry-type-pill.tsx` (Task 3) and re-exported from `_data/changelog.tsx` (Task 5). `ChangelogEntry` type defined in Task 5; consumed by Tasks 6 and 10. `slugifyVersion` defined in Task 4; consumed by Task 6. `copyToClipboard` defined in Task 2; consumed by Tasks 2 (existing blog), 4 (VersionPill).

**No placeholders** — every code block is the exact content to paste, every command is exact, every commit message is exact.
