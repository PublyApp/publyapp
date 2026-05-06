# Phase 1 — Marketing Pricing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/pricing` as a fully-rendered SSR marketing page that matches AIDesigner canvases `35a6d196` (light) and `6c3e35f3` (dark), backed by a shared pricing data module that the home pricing strip also consumes.

**Architecture:** Static SSR page composed of 5 self-contained section parts under `apps/front/src/routes/marketing/pricing/parts/`. Tier data, comparison matrix, and FAQ items live in a single shared TS module (`_data/pricing.ts`). No remote data, no loaders. Dark mode handled by theme tokens by default with explicit `// dark-diff:` overrides where the dark canvas diverges. No automated tests for marketing surface (matches existing `home/parts/` precedent) — verification via type-check / lint / knip / browser walkthrough.

**Tech Stack:** React 19, React Router v7 (file-based routes), MUI v6 (`sx` prop only — no Tailwind, no `className` for styling), framer-motion for entrance animations, Iconify (`ph:*` Phosphor icons), AIDesigner MCP (`mcp__aidesigner__get_canvas`) for fetching canvas HTML during translation.

**Spec:** `docs/superpowers/specs/2026-05-01-marketing-pricing-design.md`

---

## Reference: how to fetch a canvas

Several tasks below say "fetch the canvas." Use the AIDesigner MCP tool:

```
mcp__aidesigner__get_canvas with canvas_id: "35a6d196-5354-45b9-943c-4417adf150c9"   // light
mcp__aidesigner__get_canvas with canvas_id: "6c3e35f3-c07f-4ec8-917d-95c78b07597e"   // dark
```

The returned HTML is Tailwind-based. Treat it as the source of truth for visual layout, copy, icon choices, spacing, and section ordering. Translate to MUI `sx` using `docs/guides/tailwind-to-sx-mapping.md` (which Task 4 creates and seeds).

---

## Task 1: Add `marketing` namespace to `FRONT_PATH_NAMES`

**Files:**
- Modify: `packages/shared-ts/lib/constants.ts` (add new `marketing` key inside `FRONT_PATH_NAMES`)

- [ ] **Step 1: Add the `marketing` namespace**

Insert a new `marketing` key alongside the existing `auth`, `tenant`, `staff` keys in `FRONT_PATH_NAMES`. Place it after the `home` key for readability.

Before:
```ts
export const FRONT_PATH_NAMES = {
  home: '/',
  unauthorized: makePath('unauthorized'),
  auth: { /* ... */ },
  tenant: (tenantId = '') => { /* ... */ },
  staff: { /* ... */ },
};
```

After:
```ts
export const FRONT_PATH_NAMES = {
  home: '/',
  unauthorized: makePath('unauthorized'),
  marketing: {
    pricing: makePath('pricing'),
  },
  auth: { /* ... */ },
  tenant: (tenantId = '') => { /* ... */ },
  staff: { /* ... */ },
};
```

The `makePath` helper is already imported in this file. No other changes.

- [ ] **Step 2: Verify the type-check passes**

Run: `just tsc-front`
Expected: clean exit (no new errors).

- [ ] **Step 3: Commit**

```bash
git add packages/shared-ts/lib/constants.ts
git commit -m "feat(front): add FRONT_PATH_NAMES.marketing namespace with /pricing"
```

---

## Task 2: Scaffold marketing folder structure

**Files:**
- Create: `apps/front/src/routes/marketing/_components/.gitkeep` (so the empty folder persists in git for Phase 2+ extractions)
- Create: `apps/front/src/routes/marketing/_data/.gitkeep` (created here; populated in Task 3)
- Create: `apps/front/src/routes/marketing/pricing/parts/.gitkeep` (populated in Tasks 6–10)

- [ ] **Step 1: Create the three folders + `.gitkeep` files**

```bash
mkdir -p apps/front/src/routes/marketing/_components
mkdir -p apps/front/src/routes/marketing/_data
mkdir -p apps/front/src/routes/marketing/pricing/parts

touch apps/front/src/routes/marketing/_components/.gitkeep
touch apps/front/src/routes/marketing/_data/.gitkeep
touch apps/front/src/routes/marketing/pricing/parts/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add apps/front/src/routes/marketing/_components/.gitkeep \
        apps/front/src/routes/marketing/_data/.gitkeep \
        apps/front/src/routes/marketing/pricing/parts/.gitkeep
git commit -m "chore(front): scaffold marketing _components, _data, pricing/parts folders"
```

---

## Task 3: Create shared pricing data module

**Files:**
- Create: `apps/front/src/routes/marketing/_data/pricing.ts`
- Delete: `apps/front/src/routes/marketing/_data/.gitkeep` (no longer needed once the folder has real content)

- [ ] **Step 1: Fetch the light canvas to extract authoritative copy**

Fetch canvas `35a6d196-5354-45b9-943c-4417adf150c9` via `mcp__aidesigner__get_canvas`.

Identify and copy verbatim into your scratch notes:
- The 3 tier names, taglines, monthly/annual prices, full feature lists, and CTA labels
- The full feature comparison matrix rows (categorized by Workspace / Publishing / AI / Analytics / Support)
- The 5–7 pricing FAQ question/answer pairs

Cross-check tier names against the existing home strip: the strip uses **Creator** ($19 monthly / $15 annually) and **Scale** ($49 / $39). The dedicated page adds **Enterprise** (custom pricing). These names MUST match across both pages.

- [ ] **Step 2: Write `_data/pricing.ts` with TIERS, COMPARISON_MATRIX, PRICING_FAQS**

```ts
// apps/front/src/routes/marketing/_data/pricing.ts

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

// ----------------------------------------------------------------------
// Pricing tiers
// Used by both the home pricing strip (TIERS.slice(0, 2)) and the
// dedicated /pricing page (full TIERS).
// ----------------------------------------------------------------------

export type PricingTierId = 'creator' | 'scale' | 'enterprise';

export type PricingTier = {
  id: PricingTierId;
  name: string;
  tagline: string;
  pricing: { monthly: number | 'custom'; annually: number | 'custom' };
  features: string[];
  cta: { label: string; href: string };
  highlighted?: boolean;
};

export const TIERS: PricingTier[] = [
  {
    id: 'creator',
    name: 'Creator',
    tagline: '<copy from canvas>',
    pricing: { monthly: 19, annually: 15 },
    features: [
      // copy from canvas — positive feature list (no grayed-out items)
    ],
    cta: { label: 'Start free trial', href: FRONT_PATH_NAMES.auth.signup },
  },
  {
    id: 'scale',
    name: 'Scale',
    tagline: '<copy from canvas>',
    pricing: { monthly: 49, annually: 39 },
    features: [
      // copy from canvas
    ],
    cta: { label: 'Start free trial', href: FRONT_PATH_NAMES.auth.signup },
    highlighted: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: '<copy from canvas>',
    pricing: { monthly: 'custom', annually: 'custom' },
    features: [
      // copy from canvas
    ],
    // Phase 1: enterprise CTA points to a mailto until /contact exists in Phase 3.
    // Update href to FRONT_PATH_NAMES.marketing.contact when Phase 3 ships.
    cta: { label: 'Talk to sales', href: 'mailto:sales@publyapp.com' },
  },
];

// ----------------------------------------------------------------------
// Comparison matrix
// Only used by /pricing. Rows grouped by category; cells indicate per-tier
// inclusion (boolean) or per-tier limits (string like "100/mo", "Unlimited").
// ----------------------------------------------------------------------

export type ComparisonCategory =
  | 'Workspace'
  | 'Publishing'
  | 'AI'
  | 'Analytics'
  | 'Support';

export type ComparisonRow = {
  category: ComparisonCategory;
  feature: string;
  tiers: Record<PricingTierId, boolean | string>;
};

export const COMPARISON_MATRIX: ComparisonRow[] = [
  // copy from canvas; preserve canvas grouping order
  // Example shape:
  // {
  //   category: 'Workspace',
  //   feature: 'User seats',
  //   tiers: { creator: '1', scale: '5', enterprise: 'Unlimited' },
  // },
  // {
  //   category: 'AI',
  //   feature: 'Advanced tone match',
  //   tiers: { creator: false, scale: true, enterprise: true },
  // },
];

// ----------------------------------------------------------------------
// Pricing-specific FAQ
// ----------------------------------------------------------------------

export type PricingFaqItem = { question: string; answer: string };

export const PRICING_FAQS: PricingFaqItem[] = [
  // copy 5–7 items from canvas verbatim
  // { question: '...', answer: '...' },
];
```

Replace every `<copy from canvas>` placeholder and every `// copy from canvas` comment with real content from the canvas. Do NOT leave placeholders in the committed file.

- [ ] **Step 3: Delete the placeholder `.gitkeep`**

```bash
rm apps/front/src/routes/marketing/_data/.gitkeep
```

- [ ] **Step 4: Verify type-check**

Run: `just tsc-front`
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/marketing/_data/pricing.ts \
        apps/front/src/routes/marketing/_data/.gitkeep
git commit -m "feat(front): add shared marketing pricing data module"
```

(`git add` of the deleted `.gitkeep` records its removal.)

---

## Task 4: Seed the Tailwind→sx cheat-sheet doc

**Files:**
- Create: `docs/guides/tailwind-to-sx-mapping.md`

- [ ] **Step 1: Write the cheat-sheet seed**

```markdown
# Tailwind → MUI sx Mapping (Marketing Canvases)

Lookup for translating AIDesigner canvas markup (Tailwind) into MUI v6 `sx`.
This file grows phase by phase — append rows when a new pattern appears in a
canvas you are translating. If a pattern appears in only one place across all
14 canvases, it does not need a row.

## Spacing & sizing

| Tailwind | sx equivalent | Notes |
|---|---|---|
| `p-6 md:p-7` | `sx={{ p: { xs: 3, md: 3.5 } }}` | MUI spacing unit = 8px |
| `aspect-[16/10]` | `sx={{ aspectRatio: '16 / 10' }}` | |
| `max-w-[1100px]` | `sx={{ maxWidth: 1100 }}` | The blog body+sidebar combined width |
| `max-w-3xl` | `sx={{ maxWidth: 768 }}` | Tailwind 3xl |
| `gap-6` | `sx={{ gap: 3 }}` | |

## Radii

| Tailwind | sx equivalent |
|---|---|
| `rounded-[24px]` | `borderRadius: '24px'` |
| `rounded-[16px]` | `borderRadius: '16px'` |
| `rounded-[32px]` | `borderRadius: '32px'` |
| `rounded-full` | `borderRadius: 999` |

## Shadows (marketing tokens)

| Canvas token | sx |
|---|---|
| `shadow-card-rest` | `boxShadow: '0 1px 2px rgba(31,41,55,0.03)'` |
| `shadow-card-hover` | `boxShadow: '0 20px 40px -15px rgba(31,41,55,0.12)'` |

## Color tokens (canvas → theme)

Where a canvas class maps to a theme token, prefer the token — it dark-swaps
automatically. Only fall back to a literal hex if a `// dark-diff:` override
demands it.

| Canvas class | Theme token |
|---|---|
| `text-slate-600`, `text-brand-muted` | `color: 'text.secondary'` |
| `text-slate-900`, `text-brand-dark` | `color: 'text.primary'` |
| `bg-slate-100` (tag chips) | `bgcolor: 'grey.100'` |
| `border-brand-border`, `border-slate-200` | `borderColor: 'divider'` |
| `bg-white` (card surface) | `bgcolor: 'background.paper'` |
| `bg-brand-bg` (page bg) | `bgcolor: 'background.default'` |

## Group hover (parent-triggered child transitions)

Tailwind `group` + `group-hover:scale-[1.03]` requires a parent with `group`
class plus children that respond. In `sx`, the parent owns the hover trigger
via a class selector; the child `className` is used only as a selector hook,
not for styling.

```tsx
<Box
  sx={{
    '&:hover .pricing-card-img': { transform: 'scale(1.03)' },
  }}
>
  <Box
    className="pricing-card-img"
    sx={{ transition: 'transform 500ms' }}
  >
    {/* ... */}
  </Box>
</Box>
```

This is the only sanctioned use of `className` in marketing surface code.

## Animations

- **No perpetual animations.** No shimmer, no marching skeleton effects, no
  always-on motion. Decided 2026-04-30 after the cover-types canvas review.
- Hover transitions: only `transform` and `boxShadow` change on hover. Background,
  text color, and border color stay stable. (Per
  `docs/guides/marketing-surface-conventions.md`.)

```tsx
sx={{
  transition: 'all 500ms',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: '0 20px 40px -15px rgba(31,41,55,0.12)',
  },
}}
```

## Dark-mode override convention

Where the dark canvas (when one exists) shows a deliberate divergence from
the light canvas that theme tokens cannot express, add an explicit override
prefixed by a `// dark-diff:` comment so future readers know the override is
intentional.

```tsx
sx={(theme) => ({
  background: `radial-gradient(... ${theme.palette.primary.main} ...)`,
  // dark-diff: dark canvas uses a denser glow + cooler edge
  ...theme.applyStyles('dark', {
    background: `radial-gradient(... ${varAlpha(theme.vars.palette.primary.mainChannel, 0.4)} ...)`,
  }),
})}
```

The `// dark-diff:` comment is the only routinely-allowed comment in
marketing surface code (per `AGENTS.md`'s "default to no comments" rule).
```

- [ ] **Step 2: Commit**

```bash
git add docs/guides/tailwind-to-sx-mapping.md
git commit -m "docs: seed Tailwind→sx cheat-sheet for marketing canvas translation"
```

---

## Task 5: Refactor `home-pricing.tsx` to consume shared TIERS + add link

**Files:**
- Modify: `apps/front/src/routes/marketing/home/parts/home-pricing.tsx`

The home strip currently hardcodes `CREATOR_FEATURES`, `SCALE_FEATURES`, `CREATOR_PRICE`, `SCALE_PRICE`, `ASSURANCES`. After this task it imports tier data from `_data/pricing.ts` and adds a "See full pricing →" link below the assurances band.

**UX note (intentional change):** The current strip shows Creator with one feature grayed-out (`Advanced Revenue Analytics`) using the `included: boolean` pattern. This grayed-out item is removed in the refactor — the strip becomes a clean teaser, and the dedicated `/pricing` page handles full feature comparison via the matrix. If the user objects during PR review, restore the grayed-out item by hardcoding a local `comingNext` constant in this file (do NOT add it to shared `TIERS`).

- [ ] **Step 1: Replace the local pricing constants with shared imports**

In `home-pricing.tsx`:

Remove these blocks:
```ts
type CreatorFeature = { label: string; included: boolean };

const CREATOR_FEATURES: CreatorFeature[] = [ /* ... */ ];
const SCALE_FEATURES = [ /* ... */ ];
const CREATOR_PRICE = { monthly: 19, annually: 15 };
const SCALE_PRICE = { monthly: 49, annually: 39 };
```

Add at the top of the imports section:
```ts
import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { TIERS } from '#app/routes/marketing/_data/pricing.ts';
```

(`ASSURANCES` stays local — assurances are home-strip-only copy, not shared.)

- [ ] **Step 2: Update `CreatorFeatureItem` to take a plain string**

The grayed-out variant goes away.

Replace the `CreatorFeatureItem` component:

```tsx
const CreatorFeatureItem = ({ label }: { label: string }) => {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{ fontSize: 14, fontWeight: 500 }}
    >
      <Box
        sx={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          bgcolor: 'success.lighter',
          color: 'success.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Iconify icon={'ph:check-bold' as never} width={10} />
      </Box>
      <Box component="span">{label}</Box>
    </Stack>
  );
};
```

- [ ] **Step 3: Update `CreatorPlanCard` and `ScalePlanCard` to read from shared TIERS**

Find both `CreatorPlanCard` and `ScalePlanCard` definitions (search for `const CreatorPlanCard` and `const ScalePlanCard`).

In `CreatorPlanCard`:
- Replace the `price` prop with reading from `TIERS[0]` (Creator).
- The card still receives `price` as a prop derived from `annual` state up the tree — keep that flow but compute it from `TIERS[0].pricing.monthly | annually` at the call site (in `PricingPlans`).
- Replace `CREATOR_FEATURES.map(...)` with `TIERS[0].features.map((label) => <CreatorFeatureItem key={label} label={label} />)`.

In `ScalePlanCard`:
- Same pattern — read from `TIERS[1]` (Scale).
- Replace `SCALE_FEATURES.map(label => ...)` with `TIERS[1].features.map((label) => <ScaleFeatureItem key={label} label={label} />)`.

Look at the existing `PricingPlans` component (at the bottom of the file) and update its price computation:

Before:
```ts
const PricingPlans = ({ annual }: { annual: boolean }) => {
  const creatorPrice = annual ? CREATOR_PRICE.annually : CREATOR_PRICE.monthly;
  const scalePrice = annual ? SCALE_PRICE.annually : SCALE_PRICE.monthly;
  // ...
};
```

After:
```ts
const PricingPlans = ({ annual }: { annual: boolean }) => {
  const creatorTier = TIERS[0];
  const scaleTier = TIERS[1];

  // TIERS Creator and Scale use numeric pricing; cast is safe.
  // Enterprise (TIERS[2]) uses 'custom' and is not rendered on the home strip.
  const creatorPrice = (annual ? creatorTier.pricing.annually : creatorTier.pricing.monthly) as number;
  const scalePrice = (annual ? scaleTier.pricing.annually : scaleTier.pricing.monthly) as number;
  // ...
};
```

- [ ] **Step 4: Add the "See full pricing →" link below the assurances**

Locate the `HomePricing` export at the bottom:

```tsx
export const HomePricing = () => {
  const [annual, setAnnual] = useState(false);
  return (
    <Box component="section" id="pricing" sx={{ /* ... */ }}>
      <PricingHalo />
      <Container maxWidth="lg" component={MotionViewport}>
        <PricingHeader annual={annual} onAnnualChange={setAnnual} />
        <PricingPlans annual={annual} />
        <PricingAssurances />
      </Container>
    </Box>
  );
};
```

Add a `<SeeFullPricingLink />` after `<PricingAssurances />`. Define the component above the `HomePricing` export:

```tsx
const SeeFullPricingLink = () => {
  return (
    <Stack
      direction="row"
      justifyContent="center"
      sx={{ mt: 4 }}
    >
      <Box
        component={RouterLink}
        href={FRONT_PATH_NAMES.marketing.pricing}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          fontSize: 14,
          fontWeight: 700,
          color: 'primary.main',
          textDecoration: 'none',
          '&:hover': {
            transform: 'translateX(2px)',
          },
          transition: 'transform 240ms ease',
        }}
      >
        See full pricing
        <Iconify icon={'ph:arrow-right-bold' as never} width={14} />
      </Box>
    </Stack>
  );
};
```

Add the import for `RouterLink` at the top of the file if it isn't already there:

```ts
import { RouterLink } from '#app/components/router-link.tsx';
```

Then add `<SeeFullPricingLink />` to the `HomePricing` JSX, immediately after `<PricingAssurances />`.

- [ ] **Step 5: Run type-check + lint**

Run: `just tsc-front && just check-write`
Expected: clean exit.

- [ ] **Step 6: Manual visual check on the home page**

Run: `just dev-front`

Open `http://localhost:5050/`. Scroll to the pricing section. Verify:
- Creator shows: name, tagline, monthly price (default $19), feature bullets matching `TIERS[0].features` (no grayed-out items)
- Scale shows: name, tagline, monthly price ($49), feature bullets matching `TIERS[1].features`
- Toggling the monthly/annual switch flips both prices to the annual values
- Below the assurances, "See full pricing →" link appears
- Clicking the link navigates to `/pricing` (will 404 until Task 11 — that is expected at this stage)

If any tier's prices, name, or feature list reads differently from what was on the page before this task, fix the mismatch in `_data/pricing.ts` (Task 3 output) — the data module is the single source of truth.

- [ ] **Step 7: Commit**

```bash
git add apps/front/src/routes/marketing/home/parts/home-pricing.tsx
git commit -m "refactor(front): home-pricing strip consumes shared TIERS + adds /pricing link"
```

---

## Task 6: Build `PricingHero` part

**Files:**
- Create: `apps/front/src/routes/marketing/pricing/parts/pricing-hero.tsx`

- [ ] **Step 1: Fetch the canvases**

Fetch both canvases:
- Light: `mcp__aidesigner__get_canvas` with `35a6d196-5354-45b9-943c-4417adf150c9`
- Dark: `mcp__aidesigner__get_canvas` with `6c3e35f3-c07f-4ec8-917d-95c78b07597e`

Identify the hero section in both (top-of-page band: eyebrow + h1 + subhead, possibly value props or trust signals). Note any visual divergence between light and dark.

- [ ] **Step 2: Write `PricingHero`**

Use this scaffolding; fill in copy and specific styling from the canvas. Use theme tokens by default; add `// dark-diff:` overrides only where the dark canvas demands it.

```tsx
// apps/front/src/routes/marketing/pricing/parts/pricing-hero.tsx

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { MotionViewport, varFade } from '#app/components/animate/index.ts';

export const PricingHero = () => {
  return (
    <Box
      component="section"
      sx={{
        py: { xs: 12, md: 16 },
        bgcolor: 'background.default',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Container maxWidth="lg" component={MotionViewport}>
        <Box sx={{ textAlign: 'center', maxWidth: 760, mx: 'auto' }}>
          {/*
            Translate the canvas hero markup here:
            - Eyebrow chip ("Pricing")
            - h1 with primary-color accent on key word
            - Subhead paragraph
            - Optional: trust signals ("Trusted by 10,000+ brands")
            Wrap each block in <m.div variants={varFade('inUp', { distance: 24 })}>
            for the same entrance animation pattern as the home page.
          */}
        </Box>
      </Container>
    </Box>
  );
};
```

Replace the comment block with the actual MUI translation of the canvas hero. The home page's `home-hero.tsx` and `home-pricing.tsx` (specifically `PricingHeader` near line 234) are good pattern references for eyebrow chip + accented h1 styling — read them and reuse the same visual language.

- [ ] **Step 3: Verify type-check + lint**

Run: `just tsc-front && just check-write`
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/routes/marketing/pricing/parts/pricing-hero.tsx
git commit -m "feat(front): add PricingHero part for /pricing page"
```

---

## Task 7: Build `PricingTiers` part

**Files:**
- Create: `apps/front/src/routes/marketing/pricing/parts/pricing-tiers.tsx`

- [ ] **Step 1: Re-read the canvases for the tier-card section**

Light: `35a6d196-5354-45b9-943c-4417adf150c9`. Dark: `6c3e35f3-c07f-4ec8-917d-95c78b07597e`.

Identify the 3-tier card row + monthly/annual toggle. Note:
- Which tier is highlighted (likely Scale — `TIERS[1].highlighted === true`)
- How `'custom'` pricing is rendered for Enterprise (text label, not a number)
- Any per-tier visual differentiation (border, background, scale)

- [ ] **Step 2: Write `PricingTiers`**

```tsx
// apps/front/src/routes/marketing/pricing/parts/pricing-tiers.tsx

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { useState } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { MotionViewport, varFade } from '#app/components/animate/index.ts';
import { RouterLink } from '#app/components/router-link.tsx';
import {
  type PricingTier,
  TIERS,
} from '#app/routes/marketing/_data/pricing.ts';

type Billing = 'monthly' | 'annually';

const formatPrice = (value: number | 'custom'): string => {
  return value === 'custom' ? 'Custom' : `$${value}`;
};

const TierCard = ({ tier, billing }: { tier: PricingTier; billing: Billing }) => {
  const price = formatPrice(tier.pricing[billing]);

  return (
    <Box
      component={m.div}
      variants={varFade('inUp', { distance: 24 })}
      sx={(theme) => ({
        bgcolor: tier.highlighted ? '#242424' : 'background.paper',
        color: tier.highlighted ? 'common.white' : 'text.primary',
        borderRadius: '32px',
        p: 5,
        border: '1px solid',
        borderColor: tier.highlighted ? 'transparent' : 'divider',
        boxShadow: '0 1px 2px rgba(31,41,55,0.03)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        transition: 'transform 500ms, box-shadow 500ms',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 20px 40px -15px rgba(31,41,55,0.12)',
        },
        // The highlighted-tier always-dark surface is intentional brand pattern
        // (see home-pricing ScalePlanCard). Stays #242424 in both light + dark.
      })}
    >
      {/*
        Translate the per-tier card layout from the canvas:
        - Tier name (h3)
        - Tagline line
        - Big price number + billing period text
        - Feature bullets (use Iconify ph:check-bold + Box rows)
        - CTA button at the bottom (Button component={RouterLink} href={tier.cta.href})
        For the highlighted tier, swap text colors to white where needed.
      */}
    </Box>
  );
};

export const PricingTiers = () => {
  const [billing, setBilling] = useState<Billing>('monthly');

  return (
    <Box
      component="section"
      sx={{
        py: { xs: 8, md: 12 },
        bgcolor: 'background.default',
      }}
    >
      <Container maxWidth="lg" component={MotionViewport}>
        {/*
          Billing toggle row — translate the canvas toggle markup here.
          The home strip's BillingCycleToggle (in home-pricing.tsx) is a
          reusable visual reference; wire setBilling on click.
        */}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: { xs: 3, md: 4 },
          }}
        >
          {TIERS.map((tier) => {
            return <TierCard key={tier.id} tier={tier} billing={billing} />;
          })}
        </Box>
      </Container>
    </Box>
  );
};
```

Fill in the comment blocks with translated canvas content. The highlighted-tier always-dark `#242424` surface is intentional and stays the same in both light and dark modes.

- [ ] **Step 3: Verify type-check + lint**

Run: `just tsc-front && just check-write`
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/routes/marketing/pricing/parts/pricing-tiers.tsx
git commit -m "feat(front): add PricingTiers part with monthly/annual toggle"
```

---

## Task 8: Build `PricingComparison` part

**Files:**
- Create: `apps/front/src/routes/marketing/pricing/parts/pricing-comparison.tsx`

- [ ] **Step 1: Re-read the canvases for the comparison matrix**

Identify the feature-comparison table. Note:
- Whether the canvas groups rows visually by category (likely yes — `category` field exists for this reason)
- Per-cell rendering: ✓/— icons for booleans, plain text for limit strings
- Mobile collapse pattern (cards stack on `xs`, full table on `md+`)

- [ ] **Step 2: Write `PricingComparison`**

```tsx
// apps/front/src/routes/marketing/pricing/parts/pricing-comparison.tsx

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import groupBy from 'lodash/groupBy';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import {
  type ComparisonCategory,
  COMPARISON_MATRIX,
  type PricingTierId,
  TIERS,
} from '#app/routes/marketing/_data/pricing.ts';

const renderCell = (value: boolean | string) => {
  if (typeof value === 'string') {
    return (
      <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
        {value}
      </Box>
    );
  }

  return value ? (
    <Iconify
      icon={'ph:check-bold' as never}
      width={20}
      sx={{ color: 'success.main' }}
    />
  ) : (
    <Box component="span" sx={{ color: 'text.disabled' }}>—</Box>
  );
};

export const PricingComparison = () => {
  const grouped = groupBy(COMPARISON_MATRIX, 'category') as Record<
    ComparisonCategory,
    typeof COMPARISON_MATRIX
  >;

  return (
    <Box
      component="section"
      sx={{
        py: { xs: 12, md: 16 },
        bgcolor: 'background.default',
      }}
    >
      <Container maxWidth="lg">
        {/*
          Translate the canvas comparison header here:
          - Eyebrow ("Compare plans")
          - h2 ("Find the right plan for your team")
        */}

        {/*
          Desktop table (md+):
          - Header row: empty cell + 3 tier name cells (Creator, Scale, Enterprise)
          - For each category in groupedRows:
            - Category label row spanning 4 columns
            - One row per feature in that category
              - First cell: feature name
              - 3 cells: renderCell(row.tiers[tier.id]) per tier
          Use Box with display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr'.

          Mobile (xs to md):
          - Stacked cards, one card per tier
          - Each card lists all features with included/value per tier
        */}
      </Container>
    </Box>
  );
};
```

Replace the comment blocks with the translated table markup. The `lodash/groupBy` import (already shown above) follows the `AGENTS.md` convention of importing specific lodash helpers via subpath, not the full `lodash` package.

- [ ] **Step 3: Verify type-check + lint**

Run: `just tsc-front && just check-write`
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/routes/marketing/pricing/parts/pricing-comparison.tsx
git commit -m "feat(front): add PricingComparison feature matrix part"
```

---

## Task 9: Build `PricingFaq` part

**Files:**
- Create: `apps/front/src/routes/marketing/pricing/parts/pricing-faq.tsx`

- [ ] **Step 1: Re-read the canvases for the FAQ section**

Identify the FAQ block. Note the canvas accordion styling (border, divider, expand icon, padding).

- [ ] **Step 2: Write `PricingFaq`**

```tsx
// apps/front/src/routes/marketing/pricing/parts/pricing-faq.tsx

import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { PRICING_FAQS } from '#app/routes/marketing/_data/pricing.ts';

export const PricingFaq = () => {
  const [expanded, setExpanded] = useState<number | null>(0);

  return (
    <Box
      component="section"
      sx={{
        py: { xs: 12, md: 16 },
        bgcolor: 'background.default',
      }}
    >
      <Container maxWidth="md">
        {/*
          Translate the canvas FAQ header:
          - Eyebrow ("FAQ")
          - h2 ("Pricing questions, answered")
        */}

        <Box sx={{ mt: 6 }}>
          {PRICING_FAQS.map((item, index) => {
            const isOpen = expanded === index;
            return (
              <Accordion
                key={item.question}
                expanded={isOpen}
                onChange={() => {
                  return setExpanded(isOpen ? null : index);
                }}
                disableGutters
                elevation={0}
                sx={{
                  bgcolor: 'transparent',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:before': { display: 'none' },
                }}
              >
                <AccordionSummary
                  expandIcon={<Iconify icon={'ph:plus-bold' as never} width={20} />}
                  sx={{ py: 2 }}
                >
                  <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
                    {item.question}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                    {item.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      </Container>
    </Box>
  );
};
```

Replace the eyebrow/h2 comment with translated canvas copy.

- [ ] **Step 3: Verify type-check + lint**

Run: `just tsc-front && just check-write`
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/routes/marketing/pricing/parts/pricing-faq.tsx
git commit -m "feat(front): add PricingFaq accordion part"
```

---

## Task 10: Build `PricingEnterprise` part

**Files:**
- Create: `apps/front/src/routes/marketing/pricing/parts/pricing-enterprise.tsx`

- [ ] **Step 1: Re-read the canvases for the enterprise band**

Identify the "talk to sales" band. Note its surface treatment (likely a darker card with custom CTA).

- [ ] **Step 2: Write `PricingEnterprise`**

```tsx
// apps/front/src/routes/marketing/pricing/parts/pricing-enterprise.tsx

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { TIERS } from '#app/routes/marketing/_data/pricing.ts';

export const PricingEnterprise = () => {
  // TIERS[2] is Enterprise; pull its CTA so the link target stays in sync
  // with the data module (see Phase 3 follow-up note in _data/pricing.ts).
  const enterpriseCta = TIERS[2].cta;

  return (
    <Box
      component="section"
      sx={{
        py: { xs: 12, md: 16 },
        bgcolor: 'background.default',
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            bgcolor: '#242424',
            color: 'common.white',
            borderRadius: '32px',
            p: { xs: 5, md: 8 },
            textAlign: 'center',
          }}
        >
          {/*
            Translate the canvas enterprise band:
            - Eyebrow ("Enterprise")
            - h2 ("Need something more?")
            - Subhead paragraph
            - CTA button: <Button component="a" href={enterpriseCta.href}>{enterpriseCta.label}</Button>
              (The cta.href is mailto:sales@... in Phase 1; updates to /contact in Phase 3.)
          */}
        </Box>
      </Container>
    </Box>
  );
};
```

Fill in the comment block with translated copy.

- [ ] **Step 3: Verify type-check + lint**

Run: `just tsc-front && just check-write`
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/routes/marketing/pricing/parts/pricing-enterprise.tsx
git commit -m "feat(front): add PricingEnterprise band part"
```

---

## Task 11: Wire `pricing-page.tsx` + register the route

**Files:**
- Create: `apps/front/src/routes/marketing/pricing/pricing-page.tsx`
- Modify: `apps/front/src/routes/_tree/marketing.routes.ts`
- Delete: `apps/front/src/routes/marketing/pricing/parts/.gitkeep` (folder now has real content)

- [ ] **Step 1: Write the page composer**

```tsx
// apps/front/src/routes/marketing/pricing/pricing-page.tsx

import { HomeCta } from '#app/routes/marketing/home/parts/home-cta.tsx';

import { PricingComparison } from './parts/pricing-comparison.tsx';
import { PricingEnterprise } from './parts/pricing-enterprise.tsx';
import { PricingFaq } from './parts/pricing-faq.tsx';
import { PricingHero } from './parts/pricing-hero.tsx';
import { PricingTiers } from './parts/pricing-tiers.tsx';

const PricingPage = () => {
  return (
    <>
      <PricingHero />
      <PricingTiers />
      <PricingComparison />
      <PricingFaq />
      <PricingEnterprise />
      <HomeCta />
    </>
  );
};

export default PricingPage;
```

`HomeCta` is the existing CTA band from the home page; reusing it cross-page is the first instance of marketing component reuse. If Phase 2 needs the same band on About/Security with diverging behavior, promote it to `_components/cta-band.tsx` then.

- [ ] **Step 2: Register the route**

Modify `apps/front/src/routes/_tree/marketing.routes.ts`:

Before:
```ts
import { index, layout } from '@react-router/dev/routes';

// Marketing routes
export const marketingRoutes = [
  layout('routes/marketing/_layout/marketing-layout.tsx', [
    index('routes/marketing/home/home-page.tsx'),
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
  ]),
];
```

- [ ] **Step 3: Delete the parts `.gitkeep`**

```bash
rm apps/front/src/routes/marketing/pricing/parts/.gitkeep
```

- [ ] **Step 4: Verify type-check + lint**

Run: `just tsc-front && just check-write`
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/marketing/pricing/pricing-page.tsx \
        apps/front/src/routes/_tree/marketing.routes.ts \
        apps/front/src/routes/marketing/pricing/parts/.gitkeep
git commit -m "feat(front): wire /pricing route + page composer"
```

---

## Task 12: Final verification + browser walkthrough

**Files:** none modified — verification only.

- [ ] **Step 1: Run all quality gates**

```bash
just check-write
just tsc-front
just knip
```

Expected: all three exit clean. If `knip` flags an unused export in `_data/pricing.ts` (e.g., a type that ended up not consumed), either consume it from a part that should be using it, or remove it.

- [ ] **Step 2: Run dev server and walk through the golden path**

```bash
just dev-front
```

Open `http://localhost:5050/pricing`. Walk through:
- All 5 sections render top-to-bottom: hero → tiers → comparison → FAQ → enterprise → CTA band (`HomeCta`)
- Tier cards show 3 tiers (Creator, Scale, Enterprise); Scale is visually highlighted; Enterprise shows "Custom" instead of a price number
- Monthly/annual toggle on tier cards switches numeric prices; Enterprise stays "Custom"
- Comparison matrix renders grouped by category; ✓/— and limit strings render correctly
- FAQ accordion: clicking a question expands/collapses; only one open at a time
- Enterprise band CTA opens a `mailto:` link
- CTA band ("Start for Free") at the bottom matches the home page

- [ ] **Step 3: Edge-case checks**

- **Dark mode:** toggle the theme switcher (or set `localStorage.theme-mode` to `dark` and reload). Verify every section reads cleanly. Compare against canvas `6c3e35f3`. Any unexpected color, contrast, or surface mismatch → add a `// dark-diff:` override at the offending element per the cheat-sheet convention.
- **Mobile breakpoint:** narrow the browser to `< 900px`. Tier cards should stack to 1 column. Comparison matrix should switch from table to stacked cards.
- **Keyboard nav on FAQ:** tab into the accordion, press Enter to expand, Tab again to advance to the next question.

- [ ] **Step 4: Verify the home strip didn't regress**

Open `http://localhost:5050/`. Scroll to pricing. Verify Creator + Scale tier names, prices, and feature bullets are unchanged from before Task 5. Click "See full pricing →" and confirm it navigates to `/pricing`.

- [ ] **Step 5: Final acceptance check**

Re-read the spec acceptance-criteria block at `docs/superpowers/specs/2026-05-01-marketing-pricing-design.md`. Tick every box mentally:

- [ ] `/pricing` route registered, renders SSR, no console errors
- [ ] Page matches light canvas `35a6d196` to a "looks the same" review bar
- [ ] Page matches dark canvas `6c3e35f3` with documented `// dark-diff:` overrides where applicable
- [ ] Monthly/annual toggle works on tier cards
- [ ] FAQ accordion expands/collapses
- [ ] `home-pricing.tsx` consumes shared `TIERS`, prices/labels unchanged from today
- [ ] "See full pricing →" link visible at the bottom of home strip, navigates to `/pricing`
- [ ] `FRONT_PATH_NAMES.marketing.pricing` exported and used everywhere `/pricing` is referenced
- [ ] `tailwind-to-sx-mapping.md` exists with at least the seeded patterns
- [ ] `_components/` folder created (with `.gitkeep`, ready for Phase 2+)
- [ ] `just check-write` + `just tsc-front` + `just knip` all clean

If everything is green, Phase 1 is done.

- [ ] **Step 6 (optional): Append any new patterns discovered during translation**

If during Tasks 6–10 you encountered Tailwind patterns that weren't in the cheat-sheet, append them now to `docs/guides/tailwind-to-sx-mapping.md`. Commit:

```bash
git add docs/guides/tailwind-to-sx-mapping.md
git commit -m "docs: extend Tailwind→sx cheat-sheet with patterns from Phase 1"
```

(Skip if no new patterns appeared.)

---

## Out of scope reminders

- **Topbar route-link nav** — deferred to future mega-menu effort. Do not modify `apps/front/src/layouts/main/`.
- **Footer expansion** — deferred to same effort. Do not modify `apps/front/src/layouts/main/footer.tsx`.
- **Marketing primitives** (`MarketingHero`, `ContentBand`, `CtaBand`, `LegalDocPage`) — extracted on second consumer in Phase 2+, not Phase 1.
- **Other marketing pages** — Phases 2–6.
- **i18n on marketing copy** — out per spec; English-only matches existing precedent.
- **Automated tests on marketing parts** — out per spec; verification is via type-check, lint, knip, and browser walkthrough.
