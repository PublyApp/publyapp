# Phase 3 — Marketing Company Trio + 404 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four marketing routes — `/about`, `/contact`, `/security`, marketing 404 — backed by three new shared primitives (`MarketingHero`, `ContentBand`, `CtaBand`) extracted in this same phase. Two retroactive refactors land alongside so existing consumers (`pricing-hero`, `HomeCta`) inherit the new primitives.

**Architecture:** Static SSR pages composing the new primitives (and the existing `MarketingLayout` chrome). Per-page placeholder data lives in `_data/*.ts` modules. Contact ships with a real RHF + Zod form whose submit triggers a `mailto:` link (no backend in this phase). Marketing 404 is a catch-all `route('*', ...)` inside `MarketingLayout` (matches existing `staff/*` + `tenant/*` per-scope 404 convention). Dark mode handled purely by theme tokens — no `// dark-diff:` overrides expected anywhere in Phase 3 code.

**Tech Stack:** React 19, React Router v7 (file-based routes), MUI v6 (`sx` prop only — no Tailwind, no `className` for styling), framer-motion (existing motion patterns from `HomeCta`), Iconify (`ph:*` Phosphor icons), React Hook Form + Zod via `Form` / `Field.*` wrappers from `#app/components/hook-form/`, AIDesigner MCP (`mcp__aidesigner__get_canvas`) for fetching canvas HTML during translation.

**Spec:** `docs/superpowers/specs/2026-05-03-marketing-company-trio-and-404-design.md`

**Predecessors (shipped):**
- `docs/superpowers/plans/2026-05-01-marketing-pricing-implementation.md` (Phase 1)
- `docs/superpowers/plans/2026-05-02-marketing-legal-implementation.md` (Phase 2)

---

## Reference: how to fetch a canvas

Several tasks below say "fetch the canvas." Use the AIDesigner MCP tool:

```
mcp__aidesigner__get_canvas with canvas_id: "778a0d63-2e0b-4b2c-9e4e-a2e7e88b2957"   // About
mcp__aidesigner__get_canvas with canvas_id: "78b2258b-7518-43e4-86ce-ad50bbe37a87"   // Contact
mcp__aidesigner__get_canvas with canvas_id: "9e9499b8-10e0-47de-b7f8-206c4e8a9110"   // Security
mcp__aidesigner__get_canvas with canvas_id: "06818f67-4e71-4281-bba5-a8bb1575590e"   // 404
```

The returned HTML is Tailwind-based. Treat it as the source of truth for visual layout, copy, icon choices, spacing, and section ordering. Translate to MUI `sx` using `docs/guides/tailwind-to-sx-mapping.md` and follow the conventions in `docs/guides/marketing-surface-conventions.md`. No dark canvases exist for Phase 3 — derive dark mode from theme tokens only.

---

## Task 1: Add `about` / `contact` / `security` to `FRONT_PATH_NAMES.marketing`

**Files:**
- Modify: `packages/shared-ts/lib/constants.ts` (extend the existing `marketing` object inside `FRONT_PATH_NAMES`)

- [ ] **Step 1: Add the three new path keys**

Locate the existing `marketing` namespace inside `FRONT_PATH_NAMES`. It currently has `pricing`, `terms`, `privacy`, `cookies`. Add three sibling keys after them.

Before:
```ts
marketing: {
  pricing: makePath('pricing'),
  terms: makePath('terms'),
  privacy: makePath('privacy'),
  cookies: makePath('cookies'),
},
```

After:
```ts
marketing: {
  pricing: makePath('pricing'),
  terms: makePath('terms'),
  privacy: makePath('privacy'),
  cookies: makePath('cookies'),
  about: makePath('about'),
  contact: makePath('contact'),
  security: makePath('security'),
},
```

The `makePath` helper is already imported in this file. No other changes.

(No path constant for the marketing 404 — it's a catch-all, not a named route.)

- [ ] **Step 2: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit (no new errors).

- [ ] **Step 3: Commit**

```bash
git add packages/shared-ts/lib/constants.ts
git commit -m "feat(front): add company trio paths to FRONT_PATH_NAMES.marketing"
```

---

## Task 2: Build `MarketingHero` primitive (prop-based)

**Files:**
- Create: `apps/front/src/routes/marketing/_components/marketing-hero.tsx`

A prop-based primitive that locks the brand-consistent heading triplet (eyebrow + h1 + subhead) and an optional CTA pair across all marketing pages. Drives consistency between `/pricing`, `/about`, `/contact`, `/security`, marketing 404, and any future marketing page.

- [ ] **Step 1: Write the primitive**

Create `apps/front/src/routes/marketing/_components/marketing-hero.tsx` with these contents:

```tsx
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';

import { RouterLink } from '#app/components/router-link.tsx';

// ----------------------------------------------------------------------

type CtaConfig = {
	label: string;
	href: string;
};

type MarketingHeroProps = {
	eyebrow: string;
	title: string;
	subhead: string;
	primaryCta?: CtaConfig;
	secondaryCta?: CtaConfig;
};

// ----------------------------------------------------------------------

const isExternalHref = (href: string): boolean => {
	return href.startsWith('http') || href.startsWith('mailto:');
};

const PrimaryCtaButton = ({ cta }: { cta: CtaConfig }) => {
	const external = isExternalHref(cta.href);
	return (
		<Box
			component={external ? 'a' : RouterLink}
			href={cta.href}
			sx={(theme) => ({
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				py: 1.75,
				px: 3.5,
				borderRadius: 2,
				fontWeight: 700,
				fontSize: 16,
				textDecoration: 'none',
				cursor: 'pointer',
				bgcolor: 'primary.main',
				color: 'common.white',
				boxShadow: `0 12px 24px -12px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.5)}`,
				transition: 'transform 240ms ease, box-shadow 240ms ease',
				'&:hover': {
					transform: 'translateY(-2px)',
					boxShadow: `0 16px 32px -12px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.6)}`,
				},
			})}
		>
			{cta.label}
		</Box>
	);
};

const SecondaryCtaButton = ({ cta }: { cta: CtaConfig }) => {
	const external = isExternalHref(cta.href);
	return (
		<Box
			component={external ? 'a' : RouterLink}
			href={cta.href}
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				py: 1.75,
				px: 3.5,
				borderRadius: 2,
				fontWeight: 600,
				fontSize: 16,
				textDecoration: 'none',
				cursor: 'pointer',
				bgcolor: 'transparent',
				color: 'text.primary',
				border: '1px solid',
				borderColor: 'divider',
				transition: 'transform 240ms ease, box-shadow 240ms ease',
				'&:hover': {
					transform: 'translateY(-2px)',
					boxShadow: '0 8px 16px -8px rgba(17,24,39,0.10)',
				},
			}}
		>
			{cta.label}
		</Box>
	);
};

// ----------------------------------------------------------------------

export const MarketingHero = ({
	eyebrow,
	title,
	subhead,
	primaryCta,
	secondaryCta,
}: MarketingHeroProps) => {
	return (
		<Box component="section">
			<Container maxWidth="lg" sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 6, md: 8 } }}>
				<Stack spacing={3} sx={{ maxWidth: 760, mx: 'auto', textAlign: 'center' }}>
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
							fontSize: { xs: 36, md: 56 },
							fontWeight: 800,
							lineHeight: 1.1,
							letterSpacing: '-0.02em',
							color: 'text.primary',
						}}
					>
						{title}
					</Typography>
					<Typography
						sx={{
							fontSize: { xs: 16, md: 18 },
							color: 'text.secondary',
							lineHeight: 1.6,
							maxWidth: 640,
							mx: 'auto',
						}}
					>
						{subhead}
					</Typography>
					{(primaryCta || secondaryCta) && (
						<Stack
							direction={{ xs: 'column', sm: 'row' }}
							spacing={2}
							sx={{ justifyContent: 'center', pt: 2 }}
						>
							{primaryCta ? <PrimaryCtaButton cta={primaryCta} /> : null}
							{secondaryCta ? <SecondaryCtaButton cta={secondaryCta} /> : null}
						</Stack>
					)}
				</Stack>
			</Container>
		</Box>
	);
};
```

Notes on conventions:
- CTAs use `<Box component={RouterLink|'a'}>` not MUI `<Button>` per `marketing-surface-conventions.md` (avoids the `--variant-hover-bg` CSS-variable cascade trap).
- `isExternalHref` switches the underlying component for `mailto:` and `http` URLs (RouterLink doesn't navigate to external schemes).
- Hover discipline respected: only `transform` + `boxShadow` change; bg/color/border stay stable.
- Centered hero — pages that want left-aligned heros can compose a different layout outside this primitive (matches the parent spec's "every page gets a hero, but each is allowed its own variation" rule).
- Pure theme tokens — no hardcoded colors except the standard shadow recipe.

- [ ] **Step 2: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/_components/marketing-hero.tsx
git commit -m "feat(front): add MarketingHero primitive (prop-based, with optional CTA pair)"
```

---

## Task 3: Build `ContentBand` primitive (slot-based)

**Files:**
- Create: `apps/front/src/routes/marketing/_components/content-band.tsx`

A slot-based primitive: common section header (eyebrow + h2 + optional subhead) with arbitrary `children` body. Pages decide their internal layout (grid / split / table / single column).

- [ ] **Step 1: Write the primitive**

Create `apps/front/src/routes/marketing/_components/content-band.tsx` with these contents:

```tsx
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

// ----------------------------------------------------------------------

type ContentBandProps = {
	eyebrow?: string;
	title: string;
	subhead?: string;
	bg?: 'default' | 'neutral';
	children: ReactNode;
};

// ----------------------------------------------------------------------

export const ContentBand = ({
	eyebrow,
	title,
	subhead,
	bg = 'default',
	children,
}: ContentBandProps) => {
	return (
		<Box
			component="section"
			sx={{
				bgcolor: bg === 'neutral' ? 'background.neutral' : 'background.default',
				py: { xs: 8, md: 12 },
			}}
		>
			<Container maxWidth="lg">
				<Stack spacing={2} sx={{ maxWidth: 720, mb: { xs: 5, md: 7 } }}>
					{eyebrow ? (
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
					) : null}
					<Typography
						component="h2"
						sx={{
							fontSize: { xs: 28, md: 36 },
							fontWeight: 700,
							lineHeight: 1.2,
							letterSpacing: '-0.01em',
							color: 'text.primary',
						}}
					>
						{title}
					</Typography>
					{subhead ? (
						<Typography
							sx={{
								fontSize: { xs: 15, md: 16 },
								color: 'text.secondary',
								lineHeight: 1.6,
							}}
						>
							{subhead}
						</Typography>
					) : null}
				</Stack>
				{children}
			</Container>
		</Box>
	);
};
```

Notes:
- `bg` prop defaults to `'default'`; pages can pass `'neutral'` to alternate band backgrounds for visual rhythm.
- Header uses `mb` instead of `Stack spacing` against `children` so consumer pages start their grid/layout flush at a predictable y-offset.
- Pure theme tokens — `background.default` and `background.neutral` both auto-swap in dark mode.

- [ ] **Step 2: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/_components/content-band.tsx
git commit -m "feat(front): add ContentBand primitive (slot-based section wrapper)"
```

---

## Task 4: Extract `CtaBand` from `HomeCta` AND refactor `HomeCta` (single task — never break home between commits)

**Files:**
- Create: `apps/front/src/routes/marketing/_components/cta-band.tsx`
- Modify: `apps/front/src/routes/marketing/home/_parts/home-cta.tsx`

The `HomeCta` component currently embeds the entire dark `#242424` card markup inline. Extract it into `CtaBand` (prop-based) and refactor `HomeCta` to a thin wrapper passing the homepage's specific copy as props. This task ships in ONE commit so the homepage never breaks between commits.

- [ ] **Step 1: Write the new `CtaBand` primitive**

Create `apps/front/src/routes/marketing/_components/cta-band.tsx`:

```tsx
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { varAlpha } from 'minimal-shared/utils';

import { MotionViewport, varFade } from '#app/components/animate/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';

// ----------------------------------------------------------------------

const noiseOverlayUrl =
	"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

// ----------------------------------------------------------------------

type CtaBandProps = {
	eyebrowLabel: string;
	title: string;
	subhead: string;
	ctaLabel: string;
	ctaHref: string;
	microcopy: string;
};

// ----------------------------------------------------------------------

const isExternalHref = (href: string): boolean => {
	return href.startsWith('http') || href.startsWith('mailto:');
};

// ----------------------------------------------------------------------

export const CtaBand = ({
	eyebrowLabel,
	title,
	subhead,
	ctaLabel,
	ctaHref,
	microcopy,
}: CtaBandProps) => {
	const ctaIsExternal = isExternalHref(ctaHref);

	return (
		<Box component="section" sx={{ pt: 5, pb: 14, px: { xs: 2, md: 3 } }}>
			<Container maxWidth="lg" component={MotionViewport}>
				<m.div variants={varFade('inUp', { distance: 24 })}>
					<Box
						sx={{
							bgcolor: '#242424',
							borderRadius: '40px',
							p: { xs: 6, md: 10 },
							textAlign: 'center',
							position: 'relative',
							overflow: 'hidden',
							boxShadow: '0 24px 48px -20px rgba(0,0,0,0.30)',
							border: '1px solid rgba(255,255,255,0.10)',
						}}
					>
						<Box
							sx={(theme) => ({
								position: 'absolute',
								inset: 0,
								borderRadius: '40px',
								pointerEvents: 'none',
								background: `radial-gradient(circle at 0% 100%, ${varAlpha(theme.vars.palette.primary.mainChannel, 0.1)} 0%, transparent 35%)`,
							})}
						/>
						<Box
							sx={{
								position: 'absolute',
								top: 0,
								left: 0,
								right: 0,
								height: '1px',
								background:
									'linear-gradient(to right, transparent, rgba(255,255,255,0.10), transparent)',
								pointerEvents: 'none',
							}}
						/>
						<Box
							sx={{
								position: 'absolute',
								inset: 0,
								backgroundImage: noiseOverlayUrl,
								opacity: 0.04,
								mixBlendMode: 'overlay',
								pointerEvents: 'none',
								borderRadius: '40px',
							}}
						/>

						<Box sx={{ position: 'relative', zIndex: 1 }}>
							<Box
								sx={{
									display: 'inline-block',
									px: 2,
									py: 0.75,
									bgcolor: 'rgba(255,255,255,0.10)',
									backdropFilter: 'blur(12px)',
									border: '1px solid rgba(255,255,255,0.20)',
									color: 'common.white',
									borderRadius: 999,
									fontSize: 12,
									fontWeight: 700,
									mb: 3,
									letterSpacing: '0.05em',
									textTransform: 'uppercase',
								}}
							>
								<Iconify
									icon="ph:lightning-fill"
									width={14}
									sx={{ verticalAlign: 'text-bottom', mr: 0.5 }}
								/>{' '}
								{eyebrowLabel}
							</Box>

							<Typography
								component="h2"
								sx={{
									fontSize: { xs: 36, md: 56 },
									color: 'common.white',
									fontWeight: 800,
									mb: 3,
									lineHeight: 1.1,
									letterSpacing: '-0.02em',
									whiteSpace: 'pre-line',
								}}
							>
								{title}
							</Typography>

							<Typography
								sx={{
									color: 'primary.lighter',
									fontSize: 18,
									maxWidth: 640,
									mx: 'auto',
									mb: 5,
									fontWeight: 500,
								}}
							>
								{subhead}
							</Typography>

							<Box
								component={m.div}
								initial="rest"
								animate="rest"
								whileHover="hover"
								whileTap={{ scale: 0.97 }}
								variants={{
									rest: { y: 0, scale: 1 },
									hover: { y: -6, scale: 1.04 },
								}}
								transition={{
									type: 'spring',
									stiffness: 400,
									damping: 18,
								}}
								sx={{ display: 'inline-flex', mx: 'auto' }}
							>
								<Button
									component={ctaIsExternal ? 'a' : RouterLink}
									href={ctaHref}
									endIcon={
										<Box
											component={m.div}
											variants={{
												rest: { x: 0, scale: 1 },
												hover: { x: 4, scale: 1.1 },
											}}
											transition={{
												type: 'spring',
												stiffness: 500,
												damping: 16,
											}}
											sx={{
												width: 32,
												height: 32,
												borderRadius: '50%',
												bgcolor: 'rgba(255,255,255,0.15)',
												display: 'inline-flex',
												alignItems: 'center',
												justifyContent: 'center',
											}}
										>
											<Iconify icon="ph:arrow-right-bold" width={16} />
										</Box>
									}
									sx={(theme) => ({
										bgcolor: 'primary.main',
										color: 'common.white',
										px: 5,
										py: 2.5,
										borderRadius: 2,
										fontWeight: 700,
										fontSize: 18,
										boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
										border: '1px solid rgba(255,255,255,0.10)',
										outline: `2px solid ${varAlpha(theme.vars.palette.primary.mainChannel, 0.3)}`,
										outlineOffset: 2,
										'&:hover': {
											bgcolor: 'primary.main',
											boxShadow: `0 28px 60px -12px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.6)}`,
											outline: `2px solid ${varAlpha(theme.vars.palette.primary.mainChannel, 0.5)}`,
										},
									})}
								>
									{ctaLabel}
								</Button>
							</Box>

							<Typography
								sx={{
									color: 'rgba(255,255,255,0.6)',
									fontSize: 14,
									mt: 3,
									fontWeight: 500,
								}}
							>
								{microcopy}
							</Typography>
						</Box>
					</Box>
				</m.div>
			</Container>
		</Box>
	);
};
```

Notes:
- This is byte-for-byte the same markup as the existing `HomeCta` body, with:
  - The 4 page-specific text strings turned into props (`eyebrowLabel`, `title`, `subhead`, `ctaLabel`, `microcopy`).
  - The CTA `href` turned into a `ctaHref` prop with `isExternalHref` switching the underlying component (RouterLink vs `<a>`).
  - The `'ph:lightning-fill' as never` and `'ph:arrow-right-bold' as never` casts removed — those icons are already registered in `icon-sets.ts`.
  - `whiteSpace: 'pre-line'` on the title so consumers can pass `\n` line breaks (the homepage uses one).
- Note that this primitive uses MUI `<Button>` (NOT the `<Box component>` pattern) because the existing `HomeCta` already uses Button and the page works correctly in light + dark mode — preserving exact behavior trumps the Phase 1 convention here. If hover-bg drift surfaces during browser smoke (Step 4), revisit.

- [ ] **Step 2: Refactor `HomeCta` to consume `CtaBand`**

Replace the entire contents of `apps/front/src/routes/marketing/home/_parts/home-cta.tsx` with:

```tsx
import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';

// ----------------------------------------------------------------------

export const HomeCta = () => {
	return (
		<CtaBand
			eyebrowLabel="Start Scaling Today"
			title={'Unlock the Power of\nAutomated Social Growth'}
			subhead="Join 10,000+ brands organizing the chaos. We handle the publishing, you handle the community."
			ctaLabel="Start for Free"
			ctaHref={FRONT_PATH_NAMES.auth.signup}
			microcopy="14-day free trial. No credit card required."
		/>
	);
};
```

The previous file had ~200 lines of inline markup; the refactored version is ~14 lines. All page-specific copy is now prop-driven; the dark-card pattern lives once in `CtaBand`.

- [ ] **Step 3: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 4: Browser smoke `/` (home)**

Start the dev server if not already running (`just dev-front`). Open `http://localhost:5050/` and verify:
- The bottom CTA section ("Unlock the Power of / Automated Social Growth") renders identically to before — same dark `#242424` card, same noise overlay, same radial glow, same "Start Scaling Today" pill at the top, same "Start for Free" CTA button with arrow circle, same "14-day free trial..." microcopy below.
- Hover the CTA: the card lifts (translateY + scale) with framer-motion spring; the arrow circle slides right; bg stays primary green (no hover-bg flash regression).
- Toggle dark mode: card stays the always-dark `#242424` (intentional — see approved hardcoded-color exceptions in `marketing-surface-conventions.md`); CTA button + microcopy still readable.

If anything regresses, FIX before committing. The whole point of shipping CtaBand + HomeCta refactor in the same task is that the home page can never break between commits.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/marketing/_components/cta-band.tsx \
        apps/front/src/routes/marketing/home/_parts/home-cta.tsx
git commit -m "feat(front): extract CtaBand primitive + refactor HomeCta to consume it"
```

---

## Task 5: Refactor `pricing-hero` to consume `MarketingHero`

**Files:**
- Modify: `apps/front/src/routes/marketing/pricing/_parts/pricing-hero.tsx`

`pricing-hero.tsx` currently has its own inline hero markup. Refactor it to consume `MarketingHero` for the heading triplet, while keeping any pricing-specific decorations (the `BillingCycleToggle` rendered by the page composer remains separate — `pricing-page.tsx` renders `<PricingHero />` then `<BillingCycleToggle />` below).

- [ ] **Step 1: Read the current `pricing-hero.tsx` to identify the hero copy**

Read `apps/front/src/routes/marketing/pricing/_parts/pricing-hero.tsx`. Capture:
- The eyebrow text (likely "Pricing")
- The h1 title text
- The subhead text
- Any decorative elements (radial glow, etc.) that are NOT part of the heading triplet — those stay in pricing-hero.tsx.

- [ ] **Step 2: Refactor `pricing-hero.tsx` to consume `MarketingHero`**

Replace the inline heading markup with:

```tsx
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';

export const PricingHero = () => {
	return (
		<MarketingHero
			eyebrow="Pricing"
			title="..."     // existing pricing-hero h1 copy
			subhead="..."   // existing pricing-hero subhead copy
		/>
	);
};
```

If the existing `PricingHero` renders any decorative elements (background gradients, "trusted by" logo strip, etc.) that fell BELOW the heading triplet, render them as siblings INSIDE the `PricingHero` component AROUND the `<MarketingHero>` call. If the existing PricingHero is purely a heading triplet (no decorations), the file becomes a thin wrapper similar to the new `HomeCta` from Task 4.

If the existing PricingHero has the eyebrow-pill / title / subhead pattern in the centered, large-h1 style that matches MarketingHero's layout, the refactor is a clean swap. If the existing layout differs (e.g., left-aligned hero), preserve the existing visual via inline composition AROUND or INSTEAD of MarketingHero — flag DONE_WITH_CONCERNS and document the deviation in the report.

- [ ] **Step 3: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 4: Browser smoke `/pricing`**

Open `http://localhost:5050/pricing` and verify the hero (eyebrow + title + subhead) renders identically (or as close as possible) to before. The `BillingCycleToggle`, `PricingTiers`, `PricingComparison`, `PricingFaq` sections below should be unaffected.

If the hero looks visually different in a non-trivial way (size, weight, spacing), this is a real divergence — either:
- (a) The MarketingHero defaults need to expand to match; OR
- (b) PricingHero stays inline and we accept that pricing has its own hero variant — in which case revert this task and document why.

Discuss with the controller before committing if (a)/(b) is needed.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/marketing/pricing/_parts/pricing-hero.tsx
git commit -m "refactor(front): pricing-hero now consumes MarketingHero primitive"
```

---

## Task 6: Implement `/about` (data module + page)

**Files:**
- Create: `apps/front/src/routes/marketing/_data/about.ts`
- Create: `apps/front/src/routes/marketing/about/about-page.tsx`

**Canvas:** `778a0d63-2e0b-4b2c-9e4e-a2e7e88b2957` (light only — dark from theme tokens)

- [ ] **Step 1: Fetch the canvas**

Use `mcp__aidesigner__get_canvas` with `canvas_id: "778a0d63-2e0b-4b2c-9e4e-a2e7e88b2957"`.

In your scratch notes, capture:
- Hero eyebrow + h1 + subhead + any CTAs in the hero
- Mission section copy (single paragraph)
- Company values: 4–6 cards, each with title + body + icon name. Note the icon names as they appear in canvas (e.g. `ph-bold ph-lightning`) — translate to Iconify-registered names (e.g. `ph:lightning-bold`).
- Team grid: 6–12 placeholder members. Generate generic-but-plausible names + roles ("Jane Doe — Co-founder & CEO", "John Smith — Engineering Lead", etc.). Portrait URLs not needed — use a circle initial avatar or a generic silhouette icon.
- "We're hiring" section copy + CTA target (likely `/contact` or a placeholder)
- Bottom CTA band copy (eyebrow pill text + h2 title + subhead + CTA label + microcopy)

- [ ] **Step 2: Write the data module**

Create `apps/front/src/routes/marketing/_data/about.ts`:

```ts
// ----------------------------------------------------------------------

export type CompanyValue = {
	id: string;
	title: string;
	body: string;
	icon: string; // registered Iconify name, e.g. 'ph:lightning-bold'
};

export type TeamMember = {
	id: string;
	name: string;
	role: string;
};

// ----------------------------------------------------------------------

export const COMPANY_VALUES: CompanyValue[] = [
	// Populate from canvas — 4-6 entries.
	// Example shape:
	// { id: 'craft', title: 'Craft', body: '...', icon: 'ph:hammer-bold' },
];

export const TEAM_MEMBERS: TeamMember[] = [
	// Populate with 6-12 generic-placeholder members from canvas.
	// Example shape:
	// { id: 'jane-doe', name: 'Jane Doe', role: 'Co-founder & CEO' },
];
```

If any icon names aren't already registered in `apps/front/src/components/iconify/icon-sets.ts`, add them to the `ph:*` set in that file. NEVER use the `as never` cast on `<Iconify icon="..." />` to silence a TypeScript error — register the icon instead.

- [ ] **Step 3: Write the page**

Create `apps/front/src/routes/marketing/about/about-page.tsx`. The structure follows the spec's per-page composition:

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { ContentBand } from '#app/routes/marketing/_components/content-band.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import {
	COMPANY_VALUES,
	TEAM_MEMBERS,
} from '#app/routes/marketing/_data/about.ts';

// ----------------------------------------------------------------------

const AboutPage = () => {
	return (
		<>
			<MarketingHero
				eyebrow="Our story"
				title="..." // from canvas
				subhead="..." // from canvas
			/>

			{/* Mission */}
			<ContentBand title="Mission" subhead="..." /* from canvas */>
				<Typography sx={{ fontSize: 16, color: 'text.secondary', lineHeight: 1.75, maxWidth: 720 }}>
					{/* mission paragraph from canvas */}
				</Typography>
			</ContentBand>

			{/* Values */}
			<ContentBand title="Our values" bg="neutral">
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
						gap: 3,
					}}
				>
					{COMPANY_VALUES.map((value) => {
						return (
							<Box
								key={value.id}
								sx={{
									p: 3,
									borderRadius: '16px',
									bgcolor: 'background.paper',
									border: '1px solid',
									borderColor: 'divider',
								}}
							>
								<Box
									sx={{
										width: 40,
										height: 40,
										borderRadius: '10px',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										bgcolor: 'primary.lighter',
										color: 'primary.main',
										mb: 2,
									}}
								>
									<Iconify icon={value.icon} width={20} />
								</Box>
								<Typography sx={{ fontSize: 16, fontWeight: 700, color: 'text.primary', mb: 1 }}>
									{value.title}
								</Typography>
								<Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.6 }}>
									{value.body}
								</Typography>
							</Box>
						);
					})}
				</Box>
			</ContentBand>

			{/* Team */}
			<ContentBand title="The team" subhead="..." /* from canvas */>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: 'repeat(2, 1fr)',
							sm: 'repeat(3, 1fr)',
							md: 'repeat(4, 1fr)',
						},
						gap: 3,
					}}
				>
					{TEAM_MEMBERS.map((member) => {
						return (
							<Stack key={member.id} spacing={1} alignItems="center" sx={{ textAlign: 'center' }}>
								<Box
									sx={{
										width: 96,
										height: 96,
										borderRadius: '50%',
										bgcolor: 'background.neutral',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										color: 'text.disabled',
									}}
								>
									<Iconify icon="ph:user-bold" width={40} />
								</Box>
								<Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>
									{member.name}
								</Typography>
								<Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
									{member.role}
								</Typography>
							</Stack>
						);
					})}
				</Box>
			</ContentBand>

			{/* We're hiring */}
			<ContentBand title="We're hiring" bg="neutral">
				<Stack spacing={3} alignItems="flex-start">
					<Typography sx={{ fontSize: 16, color: 'text.secondary', maxWidth: 640, lineHeight: 1.6 }}>
						{/* hiring tease copy from canvas */}
					</Typography>
					<Box
						component="a"
						href={FRONT_PATH_NAMES.marketing.contact}
						sx={(theme) => ({
							display: 'inline-flex',
							alignItems: 'center',
							py: 1.5,
							px: 3,
							borderRadius: 2,
							fontWeight: 700,
							fontSize: 15,
							textDecoration: 'none',
							cursor: 'pointer',
							bgcolor: 'primary.main',
							color: 'common.white',
							transition: 'transform 240ms ease, box-shadow 240ms ease',
							'&:hover': {
								transform: 'translateY(-2px)',
								boxShadow: `0 8px 16px -4px rgba(17,24,39,0.12)`,
							},
						})}
					>
						Get in touch
					</Box>
				</Stack>
			</ContentBand>

			{/* Bottom CTA */}
			<CtaBand
				eyebrowLabel="..." // from canvas
				title="..." // from canvas
				subhead="..." // from canvas
				ctaLabel="Start for Free"
				ctaHref={FRONT_PATH_NAMES.auth.signup}
				microcopy="14-day free trial. No credit card required."
			/>
		</>
	);
};

export default AboutPage;
```

Pattern rules:
- The "Get in touch" inline link uses `<Box component="a">` to internal navigation via `FRONT_PATH_NAMES.marketing.contact`. Use `<Box component={RouterLink} href={FRONT_PATH_NAMES.marketing.contact}>` instead if you want client-side nav (preferred — matches the marketing footer pattern from Phase 2).
- Iconify icons MUST be in `icon-sets.ts`. If a canvas icon name isn't registered, add it.
- NO `// dark-diff:` overrides expected.

- [ ] **Step 4: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/marketing/_data/about.ts \
        apps/front/src/routes/marketing/about/about-page.tsx
git commit -m "feat(front): add /about page (data module + page from canvas 778a0d63)"
```

---

## Task 7: Implement `/contact` data module + page shell (without form)

**Files:**
- Create: `apps/front/src/routes/marketing/_data/contact.ts`
- Create: `apps/front/src/routes/marketing/contact/contact-page.tsx`

**Canvas:** `78b2258b-7518-43e4-86ce-ad50bbe37a87` (light only — dark from theme tokens)

This task ships the page shell with a **placeholder** for the form (a simple `<Box>Coming in next task</Box>`). The actual form ships in Task 8.

- [ ] **Step 1: Fetch the canvas**

Use `mcp__aidesigner__get_canvas` with `canvas_id: "78b2258b-7518-43e4-86ce-ad50bbe37a87"`.

Capture:
- Hero eyebrow + h1 + subhead (likely no CTAs in the hero — the form IS the CTA)
- Form layout: split-screen (form left, info right) per spec
- Info side: support tiers (Free / Scale / Enterprise rows showing response time + channel), the contact email, possibly an address or phone
- Topic enum values shown in the form's topic dropdown (likely "general", "sales", "support", "partnership", "press" — match canvas exactly)

- [ ] **Step 2: Write the data module**

Create `apps/front/src/routes/marketing/_data/contact.ts`:

```ts
// ----------------------------------------------------------------------

export const CONTACT_EMAIL = 'contact@publyapp.com';

export type SupportTier = {
	id: string;
	tier: string;          // 'Free', 'Scale', 'Enterprise'
	responseTime: string;  // 'Within 48 hours', etc.
	channel: string;       // 'Email', 'Email + chat', etc.
};

export const SUPPORT_TIERS: SupportTier[] = [
	// Populate from canvas — typically 3 rows (Free / Scale / Enterprise).
	// Example shape:
	// { id: 'free', tier: 'Free', responseTime: 'Within 48 hours', channel: 'Email' },
];

export type ContactTopic = {
	value: 'general' | 'sales' | 'support' | 'partnership' | 'press';
	label: string;
};

export const CONTACT_TOPICS: ContactTopic[] = [
	{ value: 'general', label: 'General inquiry' },
	{ value: 'sales', label: 'Sales' },
	{ value: 'support', label: 'Support' },
	{ value: 'partnership', label: 'Partnership' },
	{ value: 'press', label: 'Press' },
];
```

If the canvas's topic enum differs from the above 5 values, update both the union type AND the `CONTACT_TOPICS` array to match the canvas exactly.

- [ ] **Step 3: Write the page shell**

Create `apps/front/src/routes/marketing/contact/contact-page.tsx`:

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { ContentBand } from '#app/routes/marketing/_components/content-band.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import {
	CONTACT_EMAIL,
	SUPPORT_TIERS,
} from '#app/routes/marketing/_data/contact.ts';

// ----------------------------------------------------------------------

const ContactInfoPanel = () => {
	return (
		<Stack spacing={4}>
			<Box>
				<Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'text.secondary', mb: 1.5 }}>
					Email us directly
				</Typography>
				<Box
					component="a"
					href={`mailto:${CONTACT_EMAIL}`}
					sx={{
						fontSize: 18,
						fontWeight: 700,
						color: 'primary.main',
						textDecoration: 'underline',
						borderRadius: '2px',
						'&:focus-visible': {
							outline: '2px solid',
							outlineColor: 'primary.main',
							outlineOffset: '2px',
						},
					}}
				>
					{CONTACT_EMAIL}
				</Box>
			</Box>

			<Box>
				<Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'text.secondary', mb: 1.5 }}>
					Response times
				</Typography>
				<Stack spacing={1.5}>
					{SUPPORT_TIERS.map((tier) => {
						return (
							<Box key={tier.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'baseline' }}>
								<Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>
									{tier.tier}
								</Typography>
								<Box sx={{ textAlign: 'right' }}>
									<Typography sx={{ fontSize: 13, color: 'text.primary' }}>
										{tier.responseTime}
									</Typography>
									<Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
										{tier.channel}
									</Typography>
								</Box>
							</Box>
						);
					})}
				</Stack>
			</Box>
		</Stack>
	);
};

// ----------------------------------------------------------------------

const ContactPage = () => {
	return (
		<>
			<MarketingHero
				eyebrow="Contact"
				title="..." // from canvas
				subhead="..." // from canvas
			/>

			<ContentBand title="Get in touch" subhead="..." /* from canvas */>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
						gap: 6,
						alignItems: 'flex-start',
					}}
				>
					{/* Left: form (placeholder until Task 8) */}
					<Box
						sx={{
							p: 4,
							borderRadius: '16px',
							bgcolor: 'background.paper',
							border: '1px solid',
							borderColor: 'divider',
							minHeight: 480,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							color: 'text.disabled',
						}}
					>
						<Stack alignItems="center" spacing={1}>
							<Iconify icon="ph:envelope-bold" width={32} />
							<Typography sx={{ fontSize: 14 }}>Form coming in Task 8</Typography>
						</Stack>
					</Box>

					{/* Right: info panel */}
					<ContactInfoPanel />
				</Box>
			</ContentBand>
		</>
	);
};

export default ContactPage;
```

Notes:
- The form placeholder is intentional — Task 8 replaces it with the real `<ContactForm />`.
- No `<CtaBand>` at the bottom per spec (Contact pages naturally end at the form).
- Info panel is its own private sub-component within the same file (not a `_part` since it's tightly coupled to the page's data module).

- [ ] **Step 4: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/marketing/_data/contact.ts \
        apps/front/src/routes/marketing/contact/contact-page.tsx
git commit -m "feat(front): add /contact page shell + data module (form placeholder)"
```

---

## Task 8: Build `contact-form` _part (RHF + Zod + mailto: submit)

**Files:**
- Create: `apps/front/src/routes/marketing/contact/_parts/contact-form.tsx`
- Modify: `apps/front/src/routes/marketing/contact/contact-page.tsx` (replace placeholder with real form)

- [ ] **Step 1: Write the form component**

Create `apps/front/src/routes/marketing/contact/_parts/contact-form.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Field, Form } from '#app/components/hook-form/index.ts';
import {
	CONTACT_EMAIL,
	CONTACT_TOPICS,
	type ContactTopic,
} from '#app/routes/marketing/_data/contact.ts';

// ----------------------------------------------------------------------

const ContactFormSchema = z.object({
	name: z.string().min(1, 'Required').max(120),
	email: z.string().email('Invalid email address'),
	topic: z.enum([
		'general',
		'sales',
		'support',
		'partnership',
		'press',
	] as const satisfies readonly ContactTopic['value'][]),
	message: z.string().min(20, 'Tell us a bit more (at least 20 characters)').max(2000),
});

type ContactFormValues = z.infer<typeof ContactFormSchema>;

// ----------------------------------------------------------------------

const buildMailtoUrl = (values: ContactFormValues): string => {
	const subject = encodeURIComponent(`[${values.topic}] ${values.name}`);
	const body = encodeURIComponent(
		`From: ${values.name} <${values.email}>\n\n${values.message}`,
	);
	return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
};

// ----------------------------------------------------------------------

export const ContactForm = () => {
	const methods = useForm<ContactFormValues>({
		resolver: zodResolver(ContactFormSchema),
		defaultValues: {
			name: '',
			email: '',
			topic: 'general',
			message: '',
		},
	});

	const handleSubmit = methods.handleSubmit((values) => {
		window.location.href = buildMailtoUrl(values);
	});

	return (
		<Box
			sx={{
				p: 4,
				borderRadius: '16px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
			}}
		>
			<Form methods={methods} onSubmit={handleSubmit}>
				<Stack spacing={2.5}>
					<Field.Text
						name="name"
						label="Your name"
						slotProps={{ inputLabel: { shrink: true } }}
					/>
					<Field.Text
						name="email"
						label="Email address"
						type="email"
						slotProps={{ inputLabel: { shrink: true } }}
					/>
					<Field.Select
						name="topic"
						label="Topic"
						slotProps={{ inputLabel: { shrink: true } }}
					>
						{CONTACT_TOPICS.map((topic) => {
							return (
								<MenuItem key={topic.value} value={topic.value}>
									{topic.label}
								</MenuItem>
							);
						})}
					</Field.Select>
					<Field.Text
						name="message"
						label="Message"
						multiline
						minRows={5}
						maxRows={10}
						slotProps={{ inputLabel: { shrink: true } }}
					/>
					<Button
						type="submit"
						variant="contained"
						sx={{
							alignSelf: 'flex-start',
							py: 1.5,
							px: 3,
							borderRadius: 2,
							fontWeight: 700,
							fontSize: 15,
						}}
					>
						Send message
					</Button>
				</Stack>
			</Form>
		</Box>
	);
};
```

Notes:
- Plain `z` from `zod` (no `interZodClient`) is fine here — the schema is local to this file, not shared with the backend, and the form is English-only per Phase 1+2 i18n precedent.
- `Form` and `Field.*` wrappers from `#app/components/hook-form/index.ts` match the established pattern in `apps/front/src/routes/auth/login/login-form.tsx`.
- Submit triggers a `mailto:` URL — opens the user's mail client with `[topic] name` subject and `From: name <email>\n\nmessage` body.
- The `as const satisfies` syntax on the topic enum keeps the Zod literal-array in sync with the `ContactTopic['value']` union — if the data module changes the enum, TS will catch it here at build time.
- MUI `<Button type="submit">` is acceptable here because submit buttons can't bypass the form's `onSubmit` regardless of hover-bg — the marketing-surface "use Box not Button" rule is for navigation buttons where hover-bg cascades matter.

- [ ] **Step 2: Replace the placeholder in `contact-page.tsx`**

Open `apps/front/src/routes/marketing/contact/contact-page.tsx`. Replace the placeholder Box (the one with `'Form coming in Task 8'`) with `<ContactForm />`.

Add the import:

```tsx
import { ContactForm } from './_parts/contact-form.tsx';
```

The grid section now reads:

```tsx
<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 6, alignItems: 'flex-start' }}>
  <ContactForm />
  <ContactInfoPanel />
</Box>
```

Also remove the now-unused `Iconify` import + `Stack`/`Typography` references that were only used by the placeholder, IF they're not used elsewhere in the file. (Leave them if `Stack` / `Typography` are still used by `ContactInfoPanel`.)

- [ ] **Step 3: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 4: Browser smoke `/contact`**

Open `http://localhost:5050/contact`. Verify:
- Form renders with 4 fields: Name, Email, Topic (dropdown showing the 5 topics), Message (textarea)
- Submit empty form: validation errors appear under each field (Name required, Email invalid, Message too short)
- Fill in valid data; click Send message: browser triggers a `mailto:` URL → user's default mail client opens with the subject and body pre-filled
- Right-side info panel: shows email link, support tiers
- Mobile (< md): grid stacks vertically (form on top, info below)

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/marketing/contact/_parts/contact-form.tsx \
        apps/front/src/routes/marketing/contact/contact-page.tsx
git commit -m "feat(front): add /contact form (RHF + Zod + mailto: submit)"
```

---

## Task 9: Implement `/security` (data module + page)

**Files:**
- Create: `apps/front/src/routes/marketing/_data/security.ts`
- Create: `apps/front/src/routes/marketing/security/security-page.tsx`

**Canvas:** `9e9499b8-10e0-47de-b7f8-206c4e8a9110` (light only — dark from theme tokens)

- [ ] **Step 1: Fetch the canvas**

Use `mcp__aidesigner__get_canvas` with `canvas_id: "9e9499b8-10e0-47de-b7f8-206c4e8a9110"`.

Capture:
- Hero eyebrow + h1 + subhead + CTAs (likely a "View security docs" CTA → placeholder href)
- Trust badges (~3-4 SOC2/GDPR/ISO/encryption-style badges; each has a label + short description + icon)
- Defense-in-depth pillars: 6-pillar grid, each with title + body + icon
- Sub-processors table: columns are Vendor / Purpose / Region (likely 6 rows; placeholder vendors like "AWS / Hosting / us-east-1", "Stripe / Payments / Global")
- Vulnerability reporting band: copy + email + (optional) PGP fingerprint placeholder
- Bottom CTA band copy

- [ ] **Step 2: Write the data module**

Create `apps/front/src/routes/marketing/_data/security.ts`:

```ts
// ----------------------------------------------------------------------

export const SECURITY_CONTACT_EMAIL = 'security@publyapp.com';

export type TrustBadge = {
	id: string;
	label: string;
	description: string;
	icon: string;
};

export type SecurityPillar = {
	id: string;
	title: string;
	body: string;
	icon: string;
};

export type SubProcessor = {
	id: string;
	vendor: string;
	purpose: string;
	region: string;
};

// ----------------------------------------------------------------------

export const TRUST_BADGES: TrustBadge[] = [
	// Populate from canvas — 3-4 entries.
	// Example shape:
	// { id: 'soc2', label: 'SOC 2 Type II', description: 'Audited annually', icon: 'ph:shield-check-bold' },
];

export const SECURITY_PILLARS: SecurityPillar[] = [
	// Populate from canvas — 6 entries.
	// Example shape:
	// { id: 'encryption-in-transit', title: 'Encryption in transit', body: 'TLS 1.3 across all endpoints', icon: 'ph:lock-bold' },
];

export const SUB_PROCESSORS: SubProcessor[] = [
	// Populate from canvas — typically 6 placeholder rows.
	// Example shape:
	// { id: 'aws', vendor: 'AWS', purpose: 'Hosting & compute', region: 'us-east-1' },
];
```

Add any new icons from the canvas to `apps/front/src/components/iconify/icon-sets.ts` BEFORE referencing them. NEVER use the `as never` cast.

- [ ] **Step 3: Write the page**

Create `apps/front/src/routes/marketing/security/security-page.tsx`:

```tsx
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { ContentBand } from '#app/routes/marketing/_components/content-band.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import {
	SECURITY_CONTACT_EMAIL,
	SECURITY_PILLARS,
	SUB_PROCESSORS,
	TRUST_BADGES,
} from '#app/routes/marketing/_data/security.ts';

// ----------------------------------------------------------------------

const SubProcessorsTable = () => {
	return (
		<Box sx={{ overflowX: 'auto' }}>
			<Box
				component="table"
				sx={{
					width: '100%',
					minWidth: 480,
					borderCollapse: 'collapse',
					fontSize: 14,
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
						<Box component="th" scope="col">Vendor</Box>
						<Box component="th" scope="col">Purpose</Box>
						<Box component="th" scope="col">Region</Box>
					</Box>
				</Box>
				<Box component="tbody">
					{SUB_PROCESSORS.map((row) => {
						return (
							<Box component="tr" key={row.id}>
								<Box component="td" sx={{ fontWeight: 600 }}>{row.vendor}</Box>
								<Box component="td" sx={{ color: 'text.secondary' }}>{row.purpose}</Box>
								<Box component="td" sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: 13 }}>
									{row.region}
								</Box>
							</Box>
						);
					})}
				</Box>
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

const SecurityPage = () => {
	return (
		<>
			<MarketingHero
				eyebrow="Trust & Security"
				title="..." // from canvas
				subhead="..." // from canvas
			/>

			{/* Trust badges */}
			<ContentBand title="Built on trusted standards" bg="neutral">
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
						gap: 3,
					}}
				>
					{TRUST_BADGES.map((badge) => {
						return (
							<Stack key={badge.id} spacing={1.5} alignItems="flex-start" sx={{ p: 3, borderRadius: '16px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
								<Box sx={{ width: 40, height: 40, borderRadius: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'primary.lighter', color: 'primary.main' }}>
									<Iconify icon={badge.icon} width={20} />
								</Box>
								<Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary' }}>
									{badge.label}
								</Typography>
								<Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>
									{badge.description}
								</Typography>
							</Stack>
						);
					})}
				</Box>
			</ContentBand>

			{/* Defense in depth */}
			<ContentBand title="Defense in depth" subhead="..." /* from canvas */>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
						gap: 3,
					}}
				>
					{SECURITY_PILLARS.map((pillar) => {
						return (
							<Box key={pillar.id} sx={{ p: 3, borderRadius: '16px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
								<Box sx={{ width: 40, height: 40, borderRadius: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'primary.lighter', color: 'primary.main', mb: 2 }}>
									<Iconify icon={pillar.icon} width={20} />
								</Box>
								<Typography sx={{ fontSize: 16, fontWeight: 700, color: 'text.primary', mb: 1 }}>
									{pillar.title}
								</Typography>
								<Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.6 }}>
									{pillar.body}
								</Typography>
							</Box>
						);
					})}
				</Box>
			</ContentBand>

			{/* Sub-processors */}
			<ContentBand title="Sub-processors" subhead="..." /* from canvas */ bg="neutral">
				<SubProcessorsTable />
			</ContentBand>

			{/* Vulnerability reporting */}
			<ContentBand title="Reporting a vulnerability" subhead="..." /* from canvas */>
				<Stack spacing={2} alignItems="flex-start">
					<Box
						component="a"
						href={`mailto:${SECURITY_CONTACT_EMAIL}`}
						sx={{
							fontSize: 18,
							fontWeight: 700,
							color: 'primary.main',
							textDecoration: 'underline',
							borderRadius: '2px',
							'&:focus-visible': {
								outline: '2px solid',
								outlineColor: 'primary.main',
								outlineOffset: '2px',
							},
						}}
					>
						{SECURITY_CONTACT_EMAIL}
					</Box>
					<Typography sx={{ fontSize: 13, color: 'text.disabled', fontFamily: 'monospace' }}>
						{/* PGP fingerprint placeholder from canvas, e.g. "PGP: 1234 5678 90AB CDEF..." */}
					</Typography>
				</Stack>
			</ContentBand>

			{/* Bottom CTA */}
			<CtaBand
				eyebrowLabel="..." // from canvas
				title="..." // from canvas
				subhead="..." // from canvas
				ctaLabel="Start for Free"
				ctaHref={FRONT_PATH_NAMES.auth.signup}
				microcopy="14-day free trial. No credit card required."
			/>
		</>
	);
};

export default SecurityPage;
```

Pattern rules:
- Sub-processors table follows the `/cookies` inventory-table pattern: `<Box component="table">` wrapped in `<Box overflowX="auto">` with `minWidth: 480` on the inner table for mobile horizontal-scroll.
- The `minWidth: 0` flex-item guard from Phase 2 isn't needed here because the `ContentBand` doesn't put its children in a flex container that constrains them.
- Vulnerability email link uses the same `:focus-visible` pattern as Phase 2's privacy-page LINK_SX.

- [ ] **Step 4: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/marketing/_data/security.ts \
        apps/front/src/routes/marketing/security/security-page.tsx
git commit -m "feat(front): add /security page (data module + page from canvas 9e9499b8)"
```

---

## Task 10: Implement marketing 404

**Files:**
- Create: `apps/front/src/routes/marketing/_errors/marketing-not-found-page.tsx`

**Canvas:** `06818f67-4e71-4281-bba5-a8bb1575590e` (light only — dark from theme tokens)

- [ ] **Step 1: Fetch the canvas**

Use `mcp__aidesigner__get_canvas` with `canvas_id: "06818f67-4e71-4281-bba5-a8bb1575590e"`.

Capture:
- Hero copy: typically "404" oversized + "Page not found" h1 + a friendly subhead
- The decorative gradient watermark colors (orange/purple/teal radial gradient layers)
- Popular destinations list (~6 tiles): targets like Pricing, Blog, Docs, Login, Sign up, Contact

The canvas DOES have a search box but per the spec brainstorming we explicitly dropped it — render only the title + popular destinations grid.

- [ ] **Step 2: Write the page**

Create `apps/front/src/routes/marketing/_errors/marketing-not-found-page.tsx`:

```tsx
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';

// ----------------------------------------------------------------------

type PopularDestination = {
	id: string;
	label: string;
	description: string;
	href: string;
	icon: string;
};

const POPULAR_DESTINATIONS: PopularDestination[] = [
	{
		id: 'pricing',
		label: 'Pricing',
		description: 'Plans that scale with your team',
		href: FRONT_PATH_NAMES.marketing.pricing,
		icon: 'ph:tag-bold',
	},
	{
		id: 'about',
		label: 'About',
		description: "Who's behind PublyApp",
		href: FRONT_PATH_NAMES.marketing.about,
		icon: 'ph:users-three-bold',
	},
	{
		id: 'contact',
		label: 'Contact',
		description: 'Get in touch with the team',
		href: FRONT_PATH_NAMES.marketing.contact,
		icon: 'ph:envelope-bold',
	},
	{
		id: 'security',
		label: 'Trust & Security',
		description: 'How we protect your data',
		href: FRONT_PATH_NAMES.marketing.security,
		icon: 'ph:shield-check-bold',
	},
	{
		id: 'login',
		label: 'Log in',
		description: 'Already a member',
		href: FRONT_PATH_NAMES.auth.login,
		icon: 'ph:sign-in-bold',
	},
	{
		id: 'signup',
		label: 'Sign up',
		description: 'Start your free trial',
		href: FRONT_PATH_NAMES.auth.signup,
		icon: 'ph:user-plus-bold',
	},
];

// ----------------------------------------------------------------------

const MarketingNotFoundPage = () => {
	return (
		<Box component="section" sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 10, md: 16 } }}>
			<Container maxWidth="md">
				{/* Hero block with gradient watermark behind */}
				<Box sx={{ position: 'relative', textAlign: 'center', py: { xs: 6, md: 10 } }}>
					{/* Decorative radial gradient — multi-color watermark behind the 404 */}
					<Box
						aria-hidden="true"
						sx={{
							position: 'absolute',
							inset: 0,
							pointerEvents: 'none',
							background:
								'radial-gradient(circle at 30% 40%, rgba(249,115,22,0.12), transparent 50%), ' +
								'radial-gradient(circle at 70% 60%, rgba(168,85,247,0.12), transparent 50%), ' +
								'radial-gradient(circle at 50% 80%, rgba(20,184,166,0.10), transparent 50%)',
						}}
					/>

					<Box sx={{ position: 'relative', zIndex: 1 }}>
						<Typography
							component="div"
							sx={{
								fontSize: { xs: 120, md: 200 },
								fontWeight: 900,
								lineHeight: 1,
								letterSpacing: '-0.04em',
								color: 'text.primary',
								mb: { xs: 2, md: 4 },
							}}
						>
							404
						</Typography>
						<Typography
							component="h1"
							sx={{
								fontSize: { xs: 28, md: 36 },
								fontWeight: 700,
								color: 'text.primary',
								mb: 2,
							}}
						>
							Page not found
						</Typography>
						<Typography sx={{ fontSize: 16, color: 'text.secondary', maxWidth: 520, mx: 'auto', mb: 4, lineHeight: 1.6 }}>
							This page wandered off — here's where most folks were headed.
						</Typography>
						<Box
							component={RouterLink}
							href={FRONT_PATH_NAMES.home}
							sx={(theme) => ({
								display: 'inline-flex',
								alignItems: 'center',
								gap: 1,
								py: 1.5,
								px: 3,
								borderRadius: 2,
								fontWeight: 700,
								fontSize: 15,
								textDecoration: 'none',
								cursor: 'pointer',
								bgcolor: 'primary.main',
								color: 'common.white',
								transition: 'transform 240ms ease, box-shadow 240ms ease',
								'&:hover': {
									transform: 'translateY(-2px)',
									boxShadow: `0 12px 24px -8px rgba(17,24,39,0.20)`,
								},
							})}
						>
							<Iconify icon="ph:arrow-left-bold" width={16} />
							Back to home
						</Box>
					</Box>
				</Box>

				{/* Popular destinations */}
				<Stack spacing={3} sx={{ mt: { xs: 6, md: 10 } }}>
					<Typography
						sx={{
							fontSize: 12,
							fontWeight: 700,
							textTransform: 'uppercase',
							letterSpacing: '0.12em',
							color: 'text.secondary',
							textAlign: 'center',
						}}
					>
						Popular destinations
					</Typography>
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
							gap: 2,
						}}
					>
						{POPULAR_DESTINATIONS.map((dest) => {
							return (
								<Box
									key={dest.id}
									component={RouterLink}
									href={dest.href}
									sx={{
										display: 'flex',
										gap: 2,
										p: 2.5,
										borderRadius: '12px',
										bgcolor: 'background.paper',
										border: '1px solid',
										borderColor: 'divider',
										textDecoration: 'none',
										transition: 'transform 240ms ease, box-shadow 240ms ease',
										'&:hover': {
											transform: 'translateY(-2px)',
											boxShadow: '0 12px 24px -12px rgba(17,24,39,0.12)',
										},
									}}
								>
									<Box
										sx={{
											width: 36,
											height: 36,
											borderRadius: '10px',
											flexShrink: 0,
											display: 'inline-flex',
											alignItems: 'center',
											justifyContent: 'center',
											bgcolor: 'primary.lighter',
											color: 'primary.main',
										}}
									>
										<Iconify icon={dest.icon} width={18} />
									</Box>
									<Box>
										<Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>
											{dest.label}
										</Typography>
										<Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
											{dest.description}
										</Typography>
									</Box>
								</Box>
							);
						})}
					</Box>
				</Stack>
			</Container>
		</Box>
	);
};

export default MarketingNotFoundPage;
```

Notes:
- The radial gradient triple-layer uses approved hardcoded brand-color literals (orange `#F97316`, purple `#A855F7`, teal `#14B8A6` — same palette as `home-onboarding.tsx`'s step tone palette per `marketing-surface-conventions.md` approved exceptions). Each gradient is at 10–12% alpha to be subtle behind the "404" text.
- No `<MarketingHero>` here — the 404 hero is intentionally different (oversized "404" numerals + small h1).
- No `<CtaBand>` — utility pages skip it per parent spec.
- The "Back to home" button + popular-destinations cards use `<Box component={RouterLink}>` for client-side nav (no MUI `<Button>` per the marketing convention).

- [ ] **Step 3: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit. Note: the routes are NOT yet wired (Task 11 does that), so you cannot navigate to a 404-triggering URL yet. tsc verification is sufficient for this task.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/routes/marketing/_errors/marketing-not-found-page.tsx
git commit -m "feat(front): add marketing 404 page (canvas 06818f67, search box dropped per spec)"
```

---

## Task 11: Wire all 4 routes in `marketing.routes.ts`

**Files:**
- Modify: `apps/front/src/routes/_tree/marketing.routes.ts`

- [ ] **Step 1: Add 3 named routes + 1 catch-all**

Open `apps/front/src/routes/_tree/marketing.routes.ts`. The file currently has index + pricing + terms + privacy + cookies inside `MarketingLayout`. Add three sibling routes after `cookies`, then a catch-all `route('*', ...)` LAST (catch-alls must come last):

Before:
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

After:
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
		route('about', 'routes/marketing/about/about-page.tsx'),
		route('contact', 'routes/marketing/contact/contact-page.tsx'),
		route('security', 'routes/marketing/security/security-page.tsx'),
		route('*', 'routes/marketing/_errors/marketing-not-found-page.tsx'),
	]),
];
```

The catch-all `route('*', ...)` MUST come last — earlier routes take precedence due to declaration order. The catch-all only fires for paths that didn't match any other route in the entire route config (staff/`*`, tenant/`*`, etc. take precedence due to React Router's most-specific-match resolution).

- [ ] **Step 2: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/_tree/marketing.routes.ts
git commit -m "feat(front): wire /about, /contact, /security routes + marketing 404 catch-all"
```

---

## Task 12: Final verification + browser walkthrough (light + dark)

**Files:** none (verification only)

This task is purely verification. No commits unless a fix is needed.

- [ ] **Step 1: Type-check, lint/format, knip**

Run all three sequentially:

```bash
just tsc-front
just check-write
just knip
```

Expected: `tsc-front` and `check-write` exit clean. `knip` may report pre-existing issues unrelated to Phase 3 (acceptable as long as no NEW Phase 3 file appears in its report).

- [ ] **Step 2: Start the dev server**

Open two terminals if not already running:

```bash
just dev-api    # Terminal 1
just dev-front  # Terminal 2
```

Wait for `apps/front` to print its `localhost:5050` ready line.

- [ ] **Step 3: Smoke-test each new route**

For each of `/about`, `/contact`, `/security`:

1. **Light mode** (default):
   - Hero (`MarketingHero`): eyebrow + h1 + subhead render centered with the prop-driven copy
   - Section bands (`ContentBand`): alternate `bg='default'` / `bg='neutral'` create visual rhythm
   - All page-specific content (values cards, team grid, support tiers, pillars, sub-processors table) renders correctly
   - Bottom `CtaBand` renders (NOT on /contact — Contact has no CtaBand per spec)

2. **Dark mode** (toggle via the user account avatar / settings):
   - All theme tokens swap correctly
   - `CtaBand` stays the always-dark `#242424` (intentional)
   - Sub-processors table on `/security` still readable
   - Form inputs on `/contact` adapt automatically (handled by `Field.*` wrappers)

3. **Dev tools console**: no errors; no `iconify-icon` 404 fetches (every icon should be in `icon-sets.ts`)

- [ ] **Step 4: Smoke-test the marketing 404**

Type a nonsense URL like `http://localhost:5050/xyz-does-not-exist` and verify:
- `MarketingNotFoundPage` renders (not the staff/tenant 404)
- "404" numerals + "Page not found" heading visible
- Decorative radial gradient watermark renders behind (subtle orange/purple/teal blend)
- "Back to home" button works (navigates to `/`)
- All 6 popular-destination cards render with icons; click any → navigates to that route

ALSO verify: type `http://localhost:5050/staff/xyz-does-not-exist` (or any staff sub-path) → should hit the STAFF 404 (`staff-not-found-page.tsx`), NOT the marketing 404. This confirms the route precedence is working.

- [ ] **Step 5: Smoke-test the contact form end-to-end**

Open `/contact`:
1. Click "Send message" with empty fields → 4 validation errors appear (Name required, Email invalid, Topic required, Message too short)
2. Fill in: Name = "Test User", Email = "test@example.com", Topic = "Sales", Message = "This is a test message at least 20 characters long"
3. Click "Send message" → browser triggers `mailto:contact@publyapp.com?subject=...&body=...` URL → user's default mail client opens with the subject and body pre-filled
   - Verify the subject reads `[sales] Test User`
   - Verify the body reads `From: Test User <test@example.com>` followed by a blank line and the message
4. Cancel the mail client. Verify the form state is preserved (you can edit and resubmit).

- [ ] **Step 6: Verify no regressions on Phase 1+2 routes**

Quick smoke on:
- `/` (home) — particularly the bottom CTA card (the Task 4 CtaBand refactor target)
- `/pricing` — particularly the hero (the Task 5 MarketingHero refactor target)
- `/terms`, `/privacy`, `/cookies` — should be unchanged

If anything regresses, identify which Phase 3 task introduced the regression and ship a focused fix commit.

- [ ] **Step 7: Final state check**

Run: `git status`
Expected: clean (no uncommitted changes from the verification step). `git log` should show 11 task commits (Tasks 1-11) on top of the latest pushed commit.

If any browser smoke surfaced a fix, commit it with a descriptive `fix(front): ...` message and re-run Steps 1, 3, 4, 5, 6 for the affected page.

---

## What's NOT in this plan (per spec out-of-scope)

- **Real backend `POST /contact` endpoint** — `mailto:` ships now; can upgrade by swapping the form's `onSubmit` later
- **Real team data + photos** — placeholders; replace pre-launch
- **Real sub-processors list** — placeholders; needs legal review
- **Real trust badges (SOC2 / GDPR / etc.)** — visual mockups only; replace when actual certifications exist
- **404 search functionality** — explicitly dropped; static link grid only
- **Marketing 404 sharing the future Phase 6 `<ErrorPage>` primitive** — Phase 6 will refactor it later
- **Footer expansion to surface About / Contact / Security links** — deferred to the unified-mega-menu effort
- **PGP key for security disclosure** — placeholder fingerprint only
- **i18n on marketing copy** — out per Phase 1+2 precedent
