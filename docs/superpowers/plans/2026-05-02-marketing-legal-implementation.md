# Phase 2 — Marketing Legal Trio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/terms`, `/privacy`, and `/cookies` as three SSR marketing pages rendered through one shared slot-based `LegalDocPage` primitive, sourced from AIDesigner canvases `4a0e2717` (Terms), `09f5881d` (Privacy), `d9e26780` (Cookies).

**Architecture:** Three single-file route pages compose `LegalDocPage` (a slot-based shell that owns layout + sticky right-side TOC sidebar + active-section highlighting + last-updated band). Each page imports its metadata (title, eyebrow, lastUpdated, TOC, SECTION_IDS) from a per-doc TS module under `_data/legal-*.ts` and renders the prose body as JSX `children`. A new generic `useActiveTocSection` hook (lives in `apps/front/src/hooks/`, reusable by future blog/docs surfaces) drives the active-state via `IntersectionObserver`. Body copy is canvas-derived placeholder. Dark mode is pure token-driven (no `// dark-diff:` overrides expected).

**Tech Stack:** React 19, React Router v7 (file-based routes), MUI v6 (`sx` prop only — no Tailwind, no `className` for styling), Iconify (`ph:*` Phosphor icons) only if a callout uses one, AIDesigner MCP (`mcp__aidesigner__get_canvas`) for fetching canvas HTML during translation, `format-time.ts` utilities for rendering `lastUpdated`.

**Spec:** `docs/superpowers/specs/2026-05-02-marketing-legal-design.md`

**Predecessor (shipped Phase 1):** `docs/superpowers/plans/2026-05-01-marketing-pricing-implementation.md`

---

## Reference: how to fetch a canvas

Several tasks below say "fetch the canvas." Use the AIDesigner MCP tool:

```
mcp__aidesigner__get_canvas with canvas_id: "4a0e2717-f7d6-4041-8ad4-b4ed18e6f16f"   // Terms
mcp__aidesigner__get_canvas with canvas_id: "09f5881d-7fec-49db-9b4b-77eba2c61de4"   // Privacy
mcp__aidesigner__get_canvas with canvas_id: "d9e26780-40d7-4d60-88c4-f6abf50aaafb"   // Cookies
```

The returned HTML is Tailwind-based. Treat it as the source of truth for visual layout, copy, section ordering, anchor IDs (or normalize to kebab-case), and the cookies-only inventory table + "Open cookie preferences" callout. Translate to MUI `sx` using `docs/guides/tailwind-to-sx-mapping.md` and the conventions in `docs/guides/marketing-surface-conventions.md`. No dark canvases exist for legal pages — derive dark mode from theme tokens only.

---

## Task 1: Add `terms` / `privacy` / `cookies` to `FRONT_PATH_NAMES.marketing`

**Files:**
- Modify: `packages/shared-ts/lib/constants.ts` (extend the existing `marketing` object inside `FRONT_PATH_NAMES`)

- [ ] **Step 1: Add the three new path keys**

Locate the existing `marketing` namespace inside `FRONT_PATH_NAMES`. It currently has only `pricing`. Add three sibling keys after it.

Before:
```ts
marketing: {
  pricing: makePath('pricing'),
},
```

After:
```ts
marketing: {
  pricing: makePath('pricing'),
  terms: makePath('terms'),
  privacy: makePath('privacy'),
  cookies: makePath('cookies'),
},
```

The `makePath` helper is already imported in this file. No other changes.

- [ ] **Step 2: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit (no new errors).

- [ ] **Step 3: Commit**

```bash
git add packages/shared-ts/lib/constants.ts
git commit -m "feat(front): add legal trio paths to FRONT_PATH_NAMES.marketing"
```

---

## Task 2: Create `useActiveTocSection` hook

**Files:**
- Create: `apps/front/src/hooks/use-active-toc-section.ts`

This hook is generic (placed in `hooks/`, not in the marketing folder) so future blog article and docs TOCs can reuse it. It watches a list of element IDs via `IntersectionObserver` and returns the currently-active one.

- [ ] **Step 1: Write the hook file**

Create `apps/front/src/hooks/use-active-toc-section.ts` with these contents:

```ts
import { useEffect, useState } from 'react';

// ----------------------------------------------------------------------

type UseActiveTocSectionOptions = {
	ids: string[];
	rootMargin?: string;
};

/**
 * Tracks which heading is "currently active" while scrolling through a
 * long document. Returns the id of the most recently entered heading.
 *
 * Default rootMargin '-20% 0px -70% 0px' defines the active band as the
 * top 30% of the viewport — a heading becomes active when it enters that
 * band, which feels right for long-scroll docs (the heading you're
 * currently reading is near the top of where your eyes are).
 *
 * SSR-safe: bails out when window is undefined.
 */
export const useActiveTocSection = ({
	ids,
	rootMargin = '-20% 0px -70% 0px',
}: UseActiveTocSectionOptions): string | null => {
	const [activeId, setActiveId] = useState<string | null>(null);

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		if (ids.length === 0) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries.filter((entry) => {
					return entry.isIntersecting;
				});

				if (visible.length > 0) {
					setActiveId(visible[0].target.id);
				}
			},
			{ rootMargin, threshold: 0 },
		);

		const elements = ids
			.map((id) => {
				return document.getElementById(id);
			})
			.filter((el): el is HTMLElement => {
				return el !== null;
			});

		for (const el of elements) {
			observer.observe(el);
		}

		return () => {
			return observer.disconnect();
		};
	}, [ids, rootMargin]);

	return activeId;
};
```

Note: the `for…of` loop matches the project's "no `Array.reduce`/no `forEach`-for-side-effects" preference where applicable. The `.filter((el): el is HTMLElement => {…})` type predicate narrows nullable results.

- [ ] **Step 2: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/hooks/use-active-toc-section.ts
git commit -m "feat(front): add useActiveTocSection hook (IntersectionObserver-based)"
```

---

## Task 3: Create `LegalDocPage` slot-based primitive

**Files:**
- Create: `apps/front/src/routes/marketing/_components/legal-doc-page.tsx`

Owns: hero band (eyebrow + h1 + "Last updated {date}"), 2-column desktop layout (TOC right ≈240px, content left ≈720px), sticky TOC sidebar anchored to `var(--layout-header-desktop-height)`, TOC link rendering with active state, `scrollMarginTop` on h2[id] children inside the body slot.

The page consumer renders all body JSX as `children`.

- [ ] **Step 1: Write the primitive**

Create `apps/front/src/routes/marketing/_components/legal-doc-page.tsx`:

```tsx
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import { useActiveTocSection } from '#app/hooks/use-active-toc-section.ts';
import { fDate } from '#app/utils/format-time.ts';

// ----------------------------------------------------------------------

export type TocItem = {
	id: string;
	label: string;
};

type LegalDocPageProps = {
	eyebrow: string;
	title: string;
	lastUpdated: string; // ISO date string, e.g. '2026-05-02'
	toc: TocItem[];
	children: ReactNode;
};

// ----------------------------------------------------------------------

const TocSidebar = ({
	toc,
	activeId,
}: {
	toc: TocItem[];
	activeId: string | null;
}) => {
	return (
		<Box
			component="nav"
			aria-label="Table of contents"
			sx={(theme) => ({
				position: 'sticky',
				top: 'var(--layout-header-mobile-height)',
				[theme.breakpoints.up('md')]: {
					top: 'var(--layout-header-desktop-height)',
				},
				width: 240,
				flexShrink: 0,
				alignSelf: 'flex-start',
				py: 4,
			})}
		>
			<Typography
				sx={{
					fontSize: 11,
					fontWeight: 700,
					textTransform: 'uppercase',
					letterSpacing: '0.1em',
					color: 'text.secondary',
					mb: 2,
					pl: 1.5,
				}}
			>
				On this page
			</Typography>
			<Stack spacing={0.5}>
				{toc.map((item) => {
					const isActive = activeId === item.id;

					return (
						<Box
							key={item.id}
							component="a"
							href={`#${item.id}`}
							sx={{
								display: 'block',
								fontSize: 13,
								fontWeight: isActive ? 600 : 400,
								color: isActive ? 'primary.main' : 'text.secondary',
								borderLeft: '2px solid',
								borderColor: isActive ? 'primary.main' : 'transparent',
								pl: 1.5,
								py: 0.5,
								textDecoration: 'none',
								transition: 'color 200ms ease, border-color 200ms ease',
								'&:hover': {
									color: 'text.primary',
								},
							}}
						>
							{item.label}
						</Box>
					);
				})}
			</Stack>
		</Box>
	);
};

// ----------------------------------------------------------------------

export const LegalDocPage = ({
	eyebrow,
	title,
	lastUpdated,
	toc,
	children,
}: LegalDocPageProps) => {
	const ids = toc.map((item) => {
		return item.id;
	});
	const activeId = useActiveTocSection({ ids });

	return (
		<Box component="section">
			<Container maxWidth="lg" sx={{ pt: { xs: 6, md: 10 }, pb: { xs: 8, md: 12 } }}>
				{/* Hero band */}
				<Stack spacing={2} sx={{ mb: { xs: 6, md: 8 }, maxWidth: 720 }}>
					<Typography
						sx={{
							fontSize: 12,
							fontWeight: 700,
							textTransform: 'uppercase',
							letterSpacing: '0.12em',
							color: 'primary.main',
						}}
					>
						{eyebrow}
					</Typography>
					<Typography
						component="h1"
						sx={{
							fontSize: { xs: 32, md: 44 },
							fontWeight: 700,
							lineHeight: 1.15,
							letterSpacing: '-0.02em',
							color: 'text.primary',
						}}
					>
						{title}
					</Typography>
					<Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
						Last updated {fDate(lastUpdated, 'MMMM D, YYYY')}
					</Typography>
				</Stack>

				{/* 2-column body: TOC right (lg+), content left */}
				<Box
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', lg: 'row-reverse' },
						gap: { xs: 4, lg: 8 },
						alignItems: 'flex-start',
					}}
				>
					{/* TOC sidebar — desktop only */}
					<Box sx={{ display: { xs: 'none', lg: 'block' } }}>
						<TocSidebar toc={toc} activeId={activeId} />
					</Box>

					{/* Body content slot */}
					<Box
						sx={(theme) => ({
							flex: 1,
							maxWidth: 720,
							color: 'text.primary',
							// h2[id] anchor scroll lands below the sticky topbar (16px buffer)
							'& h2[id]': {
								scrollMarginTop: 'calc(var(--layout-header-mobile-height) + 16px)',
								[theme.breakpoints.up('md')]: {
									scrollMarginTop: 'calc(var(--layout-header-desktop-height) + 16px)',
								},
							},
						})}
					>
						{children}
					</Box>
				</Box>
			</Container>
		</Box>
	);
};
```

Notes:
- `TocItem` is exported so per-doc data modules can import it for typing.
- `useActiveTocSection` is called with the IDs derived from the `toc` prop — single-source-of-truth from the consumer.
- Hover convention respected: only `color`/`borderColor` transition on hover for TOC links, no bg flips, no transform (TOC links are dense vertical list — transform-on-hover would feel jittery).
- No `// dark-diff:` overrides — every color uses a theme token that dark-swaps.
- TOC heading is "On this page" (not "Table of contents") to match common docs idiom; `aria-label` on the nav is the accessible long form.

- [ ] **Step 2: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/_components/legal-doc-page.tsx
git commit -m "feat(front): add slot-based LegalDocPage primitive (hero + sticky TOC)"
```

---

## Task 4: Implement Terms of Use (data module + page)

**Files:**
- Create: `apps/front/src/routes/marketing/_data/legal-terms.ts`
- Create: `apps/front/src/routes/marketing/terms/terms-page.tsx`

**Canvas:** `4a0e2717-f7d6-4041-8ad4-b4ed18e6f16f` (light only — dark from tokens)

- [ ] **Step 1: Fetch the canvas**

Use `mcp__aidesigner__get_canvas` with `canvas_id: "4a0e2717-f7d6-4041-8ad4-b4ed18e6f16f"`.

In your scratch notes, capture:
- The exact title (e.g. "Terms of Use")
- The eyebrow text (e.g. "Legal")
- Every h2 heading in document order, with its body content (paragraphs / lists)
- Any inline emphasis, links, or formatting that appears in the body

Normalize each h2 to a kebab-case anchor ID (e.g. "Acceptance of Terms" → `acceptance-of-terms`).

- [ ] **Step 2: Write the data module**

Create `apps/front/src/routes/marketing/_data/legal-terms.ts`. Replace the placeholder section list with the actual h2s from the canvas — keep one entry per h2 in document order:

```ts
import type { TocItem } from '#app/routes/marketing/_components/legal-doc-page.tsx';

// ----------------------------------------------------------------------

export const TERMS_LAST_UPDATED = '2026-05-02'; // ISO date

// One entry per h2 in document order. The page imports this and uses
// each value as the `id` on its corresponding <Typography variant="h2" id={...}>.
export const TERMS_SECTION_IDS = {
	acceptance: 'acceptance-of-terms',
	accountRegistration: 'account-registration',
	// ... add one entry per h2 from canvas 4a0e2717
} as const;

export const TERMS_TOC: TocItem[] = [
	{ id: TERMS_SECTION_IDS.acceptance, label: 'Acceptance of Terms' },
	{ id: TERMS_SECTION_IDS.accountRegistration, label: 'Account Registration' },
	// ... mirror the SECTION_IDS list, one entry per h2, in document order
];
```

The two const arrays MUST stay in sync — same number of entries, same order, same IDs.

- [ ] **Step 3: Write the page**

Create `apps/front/src/routes/marketing/terms/terms-page.tsx`:

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { LegalDocPage } from '#app/routes/marketing/_components/legal-doc-page.tsx';
import {
	TERMS_LAST_UPDATED,
	TERMS_SECTION_IDS,
	TERMS_TOC,
} from '#app/routes/marketing/_data/legal-terms.ts';

// ----------------------------------------------------------------------

const TermsPage = () => {
	return (
		<LegalDocPage
			eyebrow="Legal"
			title="Terms of Use"
			lastUpdated={TERMS_LAST_UPDATED}
			toc={TERMS_TOC}
		>
			<Stack spacing={6}>
				{/* Section 1 — replace heading text + body with canvas content */}
				<Box component="section">
					<Typography
						component="h2"
						id={TERMS_SECTION_IDS.acceptance}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						Acceptance of Terms
					</Typography>
					<Typography sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}>
						{/* canvas-derived placeholder prose for "Acceptance of Terms" */}
					</Typography>
				</Box>

				{/* Section 2 — same shape as Section 1, repeated for every h2 in TERMS_SECTION_IDS / TERMS_TOC */}
				<Box component="section">
					<Typography
						component="h2"
						id={TERMS_SECTION_IDS.accountRegistration}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						Account Registration
					</Typography>
					<Typography sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}>
						{/* canvas-derived placeholder prose */}
					</Typography>
				</Box>

				{/* ... one <Box component="section"> per h2 in TERMS_SECTION_IDS, in document order ... */}
			</Stack>
		</LegalDocPage>
	);
};

export default TermsPage;
```

Pattern rules:
- Every h2 in the page MUST have `id={TERMS_SECTION_IDS.x}` — never a string literal. The `as const` typing on `TERMS_SECTION_IDS` will catch typos at build time.
- Every h2 MUST appear in the same order as `TERMS_TOC` (otherwise the active-section observer surfaces the wrong link as you scroll).
- For lists in the canvas body, use MUI `<Box component="ul" sx={{ pl: 3, color: 'text.secondary', '& li': { mb: 1 } }}>…</Box>` rather than raw `<ul>`.
- For inline emphasis: `<Box component="strong" sx={{ color: 'text.primary' }}>…</Box>`.
- For inline links: `<Box component="a" href={…} sx={{ color: 'primary.main', textDecoration: 'underline' }}>…</Box>`.

- [ ] **Step 4: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit. If TS errors mention `TERMS_SECTION_IDS`, an h2 references an ID not present in the const — fix the page or the data module so they match.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/marketing/_data/legal-terms.ts \
        apps/front/src/routes/marketing/terms/terms-page.tsx
git commit -m "feat(front): add /terms page (data module + JSX body from canvas 4a0e2717)"
```

---

## Task 5: Implement Privacy Policy (data module + page)

**Files:**
- Create: `apps/front/src/routes/marketing/_data/legal-privacy.ts`
- Create: `apps/front/src/routes/marketing/privacy/privacy-page.tsx`

**Canvas:** `09f5881d-7fec-49db-9b4b-77eba2c61de4` (light only — dark from tokens)

- [ ] **Step 1: Fetch the canvas**

Use `mcp__aidesigner__get_canvas` with `canvas_id: "09f5881d-7fec-49db-9b4b-77eba2c61de4"`.

Capture: title ("Privacy Policy"), eyebrow ("Privacy" or "Legal" — match the canvas), every h2 in document order with body, any inline lists or links.

Normalize each h2 to a kebab-case anchor ID.

- [ ] **Step 2: Write the data module**

Create `apps/front/src/routes/marketing/_data/legal-privacy.ts`:

```ts
import type { TocItem } from '#app/routes/marketing/_components/legal-doc-page.tsx';

// ----------------------------------------------------------------------

export const PRIVACY_LAST_UPDATED = '2026-05-02'; // ISO date

export const PRIVACY_SECTION_IDS = {
	overview: 'overview',
	dataWeCollect: 'data-we-collect',
	// ... one entry per h2 from canvas 09f5881d
} as const;

export const PRIVACY_TOC: TocItem[] = [
	{ id: PRIVACY_SECTION_IDS.overview, label: 'Overview' },
	{ id: PRIVACY_SECTION_IDS.dataWeCollect, label: 'Data We Collect' },
	// ... mirror SECTION_IDS, one per h2, document order
];
```

- [ ] **Step 3: Write the page**

Create `apps/front/src/routes/marketing/privacy/privacy-page.tsx` following the same shape as `terms-page.tsx` from Task 4 — one `<Box component="section">` per h2, `id={PRIVACY_SECTION_IDS.x}` on each h2, prose populated from canvas.

Pull the eyebrow value from the canvas (likely "Privacy" or "Legal"); the title is "Privacy Policy".

- [ ] **Step 4: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/marketing/_data/legal-privacy.ts \
        apps/front/src/routes/marketing/privacy/privacy-page.tsx
git commit -m "feat(front): add /privacy page (data module + JSX body from canvas 09f5881d)"
```

---

## Task 6: Implement Cookie Policy (data module + page + inline table + callout)

**Files:**
- Create: `apps/front/src/routes/marketing/_data/legal-cookies.ts`
- Create: `apps/front/src/routes/marketing/cookies/cookies-page.tsx`

**Canvas:** `d9e26780-40d7-4d60-88c4-f6abf50aaafb` (light only — dark from tokens)

This page has two divergences from the Terms/Privacy pattern. Both live as inline `<Box>` JSX in the page (NOT in the primitive — they're one-page concerns).

- [ ] **Step 1: Fetch the canvas**

Use `mcp__aidesigner__get_canvas` with `canvas_id: "d9e26780-40d7-4d60-88c4-f6abf50aaafb"`.

Capture in scratch notes:
- Title ("Cookie Policy"), eyebrow
- Every h2 in document order with body
- The full **3-column cookie inventory table** (cookie name, purpose, duration — confirm column headers from canvas)
- The **"Open cookie preferences" callout box** content + which section it appears in

- [ ] **Step 2: Write the data module**

Create `apps/front/src/routes/marketing/_data/legal-cookies.ts`. Include section IDs for both prose sections AND the special blocks (table + callout don't need their own IDs unless they get their own h2):

```ts
import type { TocItem } from '#app/routes/marketing/_components/legal-doc-page.tsx';

// ----------------------------------------------------------------------

export const COOKIES_LAST_UPDATED = '2026-05-02'; // ISO date

export const COOKIES_SECTION_IDS = {
	whatAreCookies: 'what-are-cookies',
	cookiesWeUse: 'cookies-we-use',
	managingPreferences: 'managing-preferences',
	// ... one entry per h2 from canvas d9e26780
} as const;

export const COOKIES_TOC: TocItem[] = [
	{ id: COOKIES_SECTION_IDS.whatAreCookies, label: 'What Are Cookies' },
	{ id: COOKIES_SECTION_IDS.cookiesWeUse, label: 'Cookies We Use' },
	{ id: COOKIES_SECTION_IDS.managingPreferences, label: 'Managing Preferences' },
	// ... mirror SECTION_IDS
];

// Typed inventory rows so the page table has type safety on column access.
export type CookieInventoryRow = {
	name: string;
	purpose: string;
	duration: string;
};

export const COOKIES_INVENTORY: CookieInventoryRow[] = [
	// Populate from canvas. Example shape:
	// { name: 'session_token', purpose: 'Authenticates your session', duration: '30 days' },
];
```

- [ ] **Step 3: Write the page with inline table + callout**

Create `apps/front/src/routes/marketing/cookies/cookies-page.tsx`. Uses the same per-section pattern as Tasks 4–5 PLUS two inline blocks. Table goes inside the "Cookies We Use" section; callout goes inside the "Managing Preferences" section (or wherever the canvas places it).

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';

import { LegalDocPage } from '#app/routes/marketing/_components/legal-doc-page.tsx';
import {
	COOKIES_INVENTORY,
	COOKIES_LAST_UPDATED,
	COOKIES_SECTION_IDS,
	COOKIES_TOC,
} from '#app/routes/marketing/_data/legal-cookies.ts';

// ----------------------------------------------------------------------

const CookieInventoryTable = () => {
	return (
		<Box
			component="table"
			sx={{
				width: '100%',
				borderCollapse: 'collapse',
				fontSize: 14,
				my: 3,
				'& th, & td': {
					textAlign: 'left',
					px: 2,
					py: 1.5,
					borderBottom: '1px solid',
					borderColor: 'divider',
				},
				'& th': {
					fontSize: 12,
					fontWeight: 700,
					textTransform: 'uppercase',
					letterSpacing: '0.08em',
					color: 'text.secondary',
				},
				'& td': {
					color: 'text.primary',
				},
			}}
		>
			<Box component="thead">
				<Box component="tr">
					<Box component="th">Cookie</Box>
					<Box component="th">Purpose</Box>
					<Box component="th">Duration</Box>
				</Box>
			</Box>
			<Box component="tbody">
				{COOKIES_INVENTORY.map((row) => {
					return (
						<Box component="tr" key={row.name}>
							<Box
								component="td"
								sx={{ fontFamily: 'monospace', fontSize: 13, color: 'text.primary' }}
							>
								{row.name}
							</Box>
							<Box component="td" sx={{ color: 'text.secondary' }}>
								{row.purpose}
							</Box>
							<Box component="td" sx={{ color: 'text.secondary' }}>
								{row.duration}
							</Box>
						</Box>
					);
				})}
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

const CookiePreferencesCallout = () => {
	return (
		<Box
			sx={(theme) => ({
				mt: 3,
				p: 3,
				borderRadius: '12px',
				border: '1px solid',
				borderColor: varAlpha(theme.vars.palette.primary.mainChannel, 0.24),
				bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.06),
			})}
		>
			<Typography
				sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary', mb: 1 }}
			>
				Manage your cookie preferences
			</Typography>
			<Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 2 }}>
				{/* canvas-derived callout body text */}
			</Typography>
			<Box
				component="button"
				type="button"
				onClick={() => {
					// Placeholder until the consent banner ships (out of scope per spec)
					// eslint-disable-next-line no-console
					console.info('[cookies] open preferences clicked');
				}}
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 1,
					fontSize: 13,
					fontWeight: 600,
					px: 2,
					py: 1,
					border: 'none',
					borderRadius: '8px',
					bgcolor: 'primary.main',
					color: 'common.white',
					cursor: 'pointer',
					transition: 'transform 240ms ease, box-shadow 240ms ease',
					'&:hover': {
						transform: 'translateY(-1px)',
						boxShadow: `0 8px 16px -4px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.35)}`,
					},
				}}
			>
				Open cookie preferences
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

const CookiesPage = () => {
	return (
		<LegalDocPage
			eyebrow="Legal"
			title="Cookie Policy"
			lastUpdated={COOKIES_LAST_UPDATED}
			toc={COOKIES_TOC}
		>
			<Stack spacing={6}>
				{/* "What Are Cookies" — plain prose section */}
				<Box component="section">
					<Typography
						component="h2"
						id={COOKIES_SECTION_IDS.whatAreCookies}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						What Are Cookies
					</Typography>
					<Typography sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}>
						{/* canvas-derived placeholder prose */}
					</Typography>
				</Box>

				{/* "Cookies We Use" — prose + inline inventory table */}
				<Box component="section">
					<Typography
						component="h2"
						id={COOKIES_SECTION_IDS.cookiesWeUse}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						Cookies We Use
					</Typography>
					<Typography sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}>
						{/* canvas-derived intro prose */}
					</Typography>
					<CookieInventoryTable />
				</Box>

				{/* "Managing Preferences" — prose + inline callout */}
				<Box component="section">
					<Typography
						component="h2"
						id={COOKIES_SECTION_IDS.managingPreferences}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						Managing Preferences
					</Typography>
					<Typography sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}>
						{/* canvas-derived prose */}
					</Typography>
					<CookiePreferencesCallout />
				</Box>

				{/* ... any further sections from the canvas, plain-prose pattern ... */}
			</Stack>
		</LegalDocPage>
	);
};

export default CookiesPage;
```

Notes:
- The callout button is `<Box component="button">`, not MUI `<Button>` — matches the convention codified in `docs/guides/marketing-surface-conventions.md` after Phase 1's MUI Button hover-bg cascade saga.
- The button's onClick is a console placeholder; the actual cookie consent banner is explicitly out of scope per the spec.
- Table uses `<Box component="table">` with sx-styled th/td selectors, mirroring the `/pricing` comparison table pattern.

- [ ] **Step 4: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/marketing/_data/legal-cookies.ts \
        apps/front/src/routes/marketing/cookies/cookies-page.tsx
git commit -m "feat(front): add /cookies page with inline inventory table + preferences callout (canvas d9e26780)"
```

---

## Task 7: Wire all 3 routes in `marketing.routes.ts`

**Files:**
- Modify: `apps/front/src/routes/_tree/marketing.routes.ts`

- [ ] **Step 1: Add the three new routes inside the existing `MarketingLayout` block**

Open `apps/front/src/routes/_tree/marketing.routes.ts`. The file currently looks like:

```ts
import { index, layout, route } from '@react-router/dev/routes';

// Marketing routes
export const marketingRoutes = [
	layout('routes/marketing/_layout/marketing-layout.tsx', [
		index('routes/marketing/home/home-page.tsx'),
		route('pricing', 'routes/marketing/pricing/pricing-page.tsx'),
	]),
];
```

Add three sibling routes after `pricing`:

```ts
import { index, layout, route } from '@react-router/dev/routes';

// Marketing routes
export const marketingRoutes = [
	layout('routes/marketing/_layout/marketing-layout.tsx', [
		index('routes/marketing/home/home-page.tsx'),
		route('pricing', 'routes/marketing/pricing/pricing-page.tsx'),
		route('terms', 'routes/marketing/terms/terms-page.tsx'),
		route('privacy', 'routes/marketing/privacy/privacy-page.tsx'),
		route('cookies', 'routes/marketing/cookies/cookies-page.tsx'),
	]),
];
```

Plain-string paths match the existing `route('pricing', …)` convention. All three routes inherit `MarketingLayout` (so they get `ScrollProgress` + `BackToTopButton` + `HomeFooter` automatically).

- [ ] **Step 2: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/_tree/marketing.routes.ts
git commit -m "feat(front): wire /terms, /privacy, /cookies routes under MarketingLayout"
```

---

## Task 8: Final verification + browser walkthrough (light + dark)

**Files:** none (verification only)

This task is purely verification. No commits unless a fix is needed.

- [ ] **Step 1: Type-check, lint/format, knip**

Run all three sequentially (don't batch — failures cascade):

```bash
just tsc-front
just check-write
just knip
```

Expected: each command exits clean.

- [ ] **Step 2: Start the dev server**

Open two terminals if not already running:

```bash
just dev-api    # Terminal 1
just dev-front  # Terminal 2
```

Wait for `apps/front` to print its `localhost:5050` ready line.

- [ ] **Step 3: Smoke-test each route in the browser**

For each of `http://localhost:5050/terms`, `/privacy`, `/cookies`:

1. **Light mode** (default):
   - Hero band renders: eyebrow + h1 + "Last updated May 2, 2026" (or whatever date)
   - TOC sidebar appears on the right at viewport width ≥ `lg` (1200px)
   - TOC sidebar disappears at viewport width < `lg`; reading column goes full-width
   - Click a TOC link in the middle of the list → page scrolls; the matching h2 lands just below the sticky topbar (no occlusion)
   - Scroll manually past several h2s → the active TOC item updates (primary color + bold + left accent border) as each h2 enters the top 30% of the viewport
   - `ScrollProgress` bar at top of page works; `BackToTop` button appears after scrolling
   - `HomeFooter` appears at bottom

2. **Dark mode** (toggle via the user account avatar / settings):
   - Page bg, body text, TOC, all dividers render correctly with no light-on-light or dark-on-dark contrast issues
   - Active TOC item still uses `primary.main` (visible on dark bg)
   - Cookies inventory table rows are readable
   - Cookies preferences callout button stays primary green (does not flip white-on-hover or any other regression — verify per Phase 1's MUI-button gotcha)

3. **Dev tools console**:
   - No errors (red). Warnings about React strict mode double-invocations are fine.
   - No `iconify-icon` network 404s (we shouldn't be loading any unregistered icons; if a callout uses one, it must be in `apps/front/src/components/iconify/icon-sets.ts`)

- [ ] **Step 4: Verify nothing else regressed**

Quick smoke on `/` and `/pricing` to confirm Phase 1 surfaces still render correctly (the new hook + primitive shouldn't affect them, but a regression in the shared `MarketingLayout` would surface here).

- [ ] **Step 5: Final state check**

Run: `git status`
Expected: clean (no uncommitted changes from the verification step).

If any browser smoke surfaced a fix, commit it with a descriptive `fix(front): …` message and re-run Steps 1 + 3 for the affected page.

---

## What's NOT in this plan (per spec out-of-scope)

- **Real lawyer-vetted legal copy** — placeholder ships now; content PR follows
- **Cookie consent banner** — `CookiePreferencesCallout` button is a console-log placeholder
- **Mobile TOC sheet/drawer** — TOC hides at `< lg`; long-scroll-to-find pattern
- **h3 sub-anchors in TOC** — `TocItem` shape supports `subsections?: TocItem[]` non-breakingly; add when needed
- **CSS smooth-scroll** — relying on browser default
- **Hash-on-mount active-state initialization** — observer picks it up after first paint
- **Layout chrome** (mega-menu nav, expanded footer) — Phase 1+ deferral
- **Marketing primitive extraction** (`MarketingHero`, `ContentBand`, `CtaBand`) — extracted on second consumer per Phase 1 conventions; Phase 2 only ships `LegalDocPage` because it has 3 immediate consumers
- **i18n on legal copy** — English-only matches Phase 1 precedent
