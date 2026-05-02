# Marketing Surface Conventions

PublyApp has two visual surfaces:

- **Product surfaces** — auth, dashboard, all authed routes. Tight, utilitarian, MUI theme defaults. Optimized for daily use.
- **Marketing surfaces** — landing page, pricing, future blog/changelog. Expressive, larger CTAs, larger radii, more motion. Optimized for first impression.

This split is intentional and matches the pattern used by Linear, Vercel, Stripe, and most modern SaaS. The two surfaces share **brand DNA** but diverge on **density and expressiveness**. Without a written boundary the two sides drift, so this document is the boundary.

## What MUST match across both surfaces

These are the brand. If a marketing component diverges here, it's a bug.

| Concern | Rule |
|---|---|
| Palette | Both surfaces reference theme tokens (`primary.*`, `text.*`, `background.*`, `divider`). No hardcoded brand color overrides. |
| Typography family | Both use the theme's font family. Marketing may override `fontSize` / `fontWeight` per element, but never `fontFamily`. |
| Logo | Same `<Logo />` component. |
| Iconify set | Phosphor (`ph:*`). |
| Dark-mode mechanism | `theme.applyStyles('dark', { … })` for variant overrides; `varAlpha(theme.vars.palette.X.mainChannel, n)` for alpha. |
| Form controls | If marketing renders a form (e.g. inline signup), it uses `Form` / `Field.*` wrappers from `@/front/components/hook-form`, identical to auth. |
| Primary CTA color | Marketing's primary CTA bg is `primary.main`, identical to product's primary buttons. |

## What's allowed to diverge (marketing-only)

| Token | Product (default) | Marketing (allowed) |
|---|---|---|
| Border radius (cards/sections) | theme default (`borderRadius: 1–2` ≈ 8–16 px) | `16 / 24 / 32 / 40` px on hero, bento, step, CTA, FAQ cards |
| Button size | `size="small" \| "medium"`, theme defaults | `px: 5–6, py: 2.5–2.75, fontSize: 18–20` for hero/CTA buttons |
| Section padding | theme spacing scale | `py: { xs: 12, md: 16 }` for full-bleed sections |
| Motion | MUI transitions only | framer-motion springs, hover lifts, idle floats, viewport reveals via `MotionViewport` + `varFade` |
| Decorative layers | none | noise SVG overlays, radial gradients, blurred glow rings, watermark numerals |
| Hardcoded dark surfaces | not allowed | `#242424` for cards that intentionally stay dark in both modes (see "approved exceptions" below) |

## Hover convention (both surfaces)

CTAs and cards keep `bgcolor` / `color` / `borderColor` **stable** on hover. Only `transform` (translateY / scale) and `boxShadow` change. This applies to both product and marketing — it's a brand convention, not a marketing-only rule.

For marketing CTAs that need a flourish, wrap the `Button` in a framer-motion `Box` with the shared spring config:

```tsx
transition={{ type: 'spring', stiffness: 400, damping: 18 }}
variants={{
  rest: { y: 0, scale: 1 },
  hover: { y: -6, scale: 1.04 },
}}
```

Inner icon flourishes (e.g. arrow translation) use a snappier child variant: `stiffness: 500, damping: 14–16`. Card hovers use the same parent spring with `y: -8, scale: 1.01`.

### Use `<Box>` not `<Button>` for marketing CTAs with strict hover discipline

MUI `Button` injects `--variant-hover-bg` CSS variables that compete with `sx` hover overrides through CSS-variable cascade. Neither `color="inherit"` (only swaps the variant class), nor `&&:hover` (specificity-matched but variable still wins), nor explicit `applyStyles('dark', ...)` reliably suppresses them. The button visually flashes the primary tint on hover even when `sx` reads `bgcolor: 'common.white'`, `'&:hover': { bgcolor: 'common.white' }`.

For any marketing button where bg must stay stable on hover (per the convention above), prefer:

```tsx
<Box
  component={isExternal ? 'a' : RouterLink}
  href={...}
  sx={{
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    py: 1.75,
    px: 3,
    borderRadius: 2,
    fontWeight: 700,
    textDecoration: 'none',
    cursor: 'pointer',
    bgcolor: '...',
    color: '...',
    transition: 'transform 240ms ease, box-shadow 240ms ease',
    '&:hover': { transform: 'translateY(-2px)', boxShadow: '...' },
    ...theme.applyStyles('dark', { /* invert as needed */ }),
  }}
>
  {label}
</Box>
```

Box has none of MUI Button's CSS-variable machinery — `sx` wins outright. The shipped `PricingTierCard` CTA uses this pattern.

If you must use `<Button>` (e.g., for a form submit), audit hover behavior in BOTH light and dark mode, in EVERY tier/variant — fixing one button on a page doesn't fix others sharing the same pattern.

## Approved hardcoded-color exceptions

These are the only hardcoded colors permitted in marketing parts. Anything else must use theme tokens.

| Exception | Rationale |
|---|---|
| Third-party brand colors — `#E1306C` (Instagram), `#1877F2` (Facebook), `#0A66C2` (LinkedIn), `#FFD600 / #FF0069 / #7638FA` (Instagram gradient), `#0F172A` (X) | These are external brand identities (logos, mocked posts). Theme tokens cannot represent them. |
| Step tone palette in `home-onboarding.tsx` — orange `#F97316`, purple `#A855F7`, teal `#14B8A6` (+ darks/rgb) | Intentional creative split across the three onboarding steps; theme palette is single-tone. |
| Dark surface `#242424` — used on Unified Inbox bento, Scale pricing card, bottom CTA card | Deliberate "always-dark" cards that retain identity in light mode for contrast. |
| Decorative shadow recipes — `rgba(17, 24, 39, 0.05–0.30)`, `rgba(0, 0, 0, 0.05–0.30)` | Standard elevation recipe. Could route through `varAlpha(theme.vars.palette.common.blackChannel, n)` but readability tradeoff isn't worth it. |

If you find yourself adding a new hardcoded color outside these categories, stop and use a theme token.

## Where marketing code lives

```
apps/front/src/routes/marketing/
├── _components/                          # shared primitives — second-consumer extractions
│   ├── billing-cycle-toggle.tsx
│   ├── marketing-faq-accordion.tsx
│   └── pricing-tier-card.tsx
├── _data/                                # shared static content modules
│   └── pricing.ts                        # TIERS, COMPARISON_MATRIX, PRICING_FAQS, Billing
├── _layout/
│   └── marketing-layout.tsx              # mounts MainLayout + ScrollProgress + BackToTop
├── home/
│   ├── home-page.tsx
│   └── parts/
│       ├── home-hero.tsx
│       ├── home-features.tsx
│       ├── home-onboarding.tsx
│       ├── home-pricing.tsx
│       ├── home-faq.tsx
│       ├── home-cta.tsx
│       └── home-logos.tsx
├── pricing/
│   ├── pricing-page.tsx
│   └── parts/
│       ├── pricing-hero.tsx
│       ├── pricing-tiers.tsx
│       ├── pricing-comparison.tsx
│       ├── pricing-faq.tsx
│       └── pricing-enterprise.tsx
└── (future: blog/, changelog/, about/, contact/, security/, terms/, privacy/, cookies/, 404/)
```

The marketing layout (`apps/front/src/layouts/main/layout.tsx`) handles the transparent-on-scroll topbar and unconditionally renders `HomeFooter` for ALL marketing routes (the `isHomePage` gate that previously rendered a placeholder `Footer` on non-home routes was removed). This layout is **only** mounted under marketing routes; auth and dashboard use their own layouts.

## Shipped shared primitives — use these, don't fork

When building a new marketing page, check `_components/` first:

| Primitive | Purpose | Used by |
|---|---|---|
| `BillingCycleToggle` | Custom Monthly/Annually segmented toggle with sliding dark thumb (light) / white thumb (dark). Spring physics on slide. | `home-pricing`, `pricing-hero` |
| `PricingTierCard` | Tier card (Creator/Scale/Enterprise) with framer-motion spring hover, large-radius surface, circle+check feature icons, Box-as-button CTA. Handles `'custom'` price ("Let's talk"). | `home-pricing` (slice 0..2), `pricing-tiers` (full TIERS) |
| `MarketingFaqAccordion` | Custom framer-motion accordion (no MUI Accordion); plus/X icon swap, snappy spring expand, neutral elevated shadow when open. Independent toggle per item; supports `defaultOpen`. | `home-faq`, `pricing-faq` |

Tier prices, feature lists, comparison rows, and FAQ items live in `_data/pricing.ts` — one source of truth shared by both pages. **Never duplicate tier prices/features in a part file.** If pricing changes, edit `_data/pricing.ts`.

The `Billing = 'monthly' \| 'annually'` type exported from `_data/pricing.ts` is the canonical billing-state shape for ALL marketing pages.

## When to add `_shared/`

Currently every marketing-only constant (step tones, dark surface hex, third-party brand colors) lives in the part that uses it. **This is fine for one marketing page.** When the second marketing page lands (pricing, blog, etc.), extract:

- `apps/front/src/routes/marketing/_shared/tokens.ts` — `MARKETING_DARK_SURFACE`, `SOCIAL_BRAND_COLORS`, marketing radius/spacing/button-size constants
- `apps/front/src/routes/marketing/_shared/sx-presets.ts` — `marketingCardSx`, `marketingCtaButtonSx`, `marketingSectionSx`

Don't pre-build this for one page. Premature.

## Layout chrome lives in MarketingLayout, not pages

Anything that should appear on every marketing page (scroll progress indicator, back-to-top button, future cookie banner, etc.) goes in `_layout/marketing-layout.tsx`. Per-page mounting causes drift the moment a second page is added.

Currently mounted by `MarketingLayout`:

- `<ScrollProgress>` (top-of-viewport linear bar fed by `useScrollProgress()`)
- `<BackToTopButton>` (bottom-right floating button)
- `<MainLayout>` chrome — topbar + `HomeFooter`

Per-page sections (hero, content, CTA bands) compose inside the `<Outlet />`.

## SSR hydration gotchas

Marketing pages render server-side. Components used in shared chrome (footer, header, sticky blocks) MUST produce identical HTML on server and client.

Specifically:

- **Logo `href`** — `<Logo />` without an explicit `href` calls `useHomePath()` which reads cookies → SSR returns `/`, client may return `/staff` after hydration → React warns and the link goes stale. Pass `<Logo href={FRONT_PATH_NAMES.home} />` everywhere chrome renders the logo. The home topbar already comments this; the previous template `Footer` violated it before being deleted.
- Avoid `Date.now()`, `Math.random()`, `new Date().toLocaleString()` in chrome render paths. If you need a current date in marketing copy (e.g., copyright year), compute it server-side once and pass via props.

## Pitfalls and gotchas (recurring traps)

These are the specific traps we kept hitting during the home + /pricing build. Read this list before assuming "MUI default behavior is fine" or "the css var probably works."

### Theme tokens that DON'T dark-swap

- **`grey.50` through `grey.900`** are static palette ramp values (`'#FAFBFC'`, `'#F3F4F6'`, …) — they DO NOT swap with color scheme. Using `bgcolor: 'grey.50'` on a card surface gives you a near-white card on a dark page in dark mode. Looks broken.
  - For surfaces that should adapt: `bgcolor: 'background.paper'` (auto-swaps), `bgcolor: 'background.neutral'` (auto-swaps, slightly off-paper), or `bgcolor: varAlpha(theme.vars.palette.text.primaryChannel, 0.04)` for a subtle overlay that inverts naturally.
- **`common.black` / `common.white`** are intentionally fixed (true black, true white). Use them deliberately, e.g. text on a `#242424` always-dark surface.

### MUI Button hover-bg cascade

See "Use `<Box>` not `<Button>`" above. Summary: `<Button>` injects `--variant-hover-bg` CSS variables that win over `sx` hover overrides. The fix is to bypass MUI Button entirely with `<Box component={RouterLink|'a'}>`, NOT to keep adding `&&:hover`/`color="inherit"`/`applyStyles` patches.

### `position: sticky` + `overflow` ancestor

`position: sticky` on a `<thead>` (or any element) anchors to the nearest scrolling ancestor. If any ancestor sets `overflow: auto/scroll/hidden` (even just `overflowX: 'auto'` for horizontal scroll), the sticky element sticks to THAT scrolling box, not the page viewport — usually appearing not to stick at all. If you need both horizontal scroll AND viewport-sticky behavior, pick one (the comparison matrix accepts page-level horizontal scroll on narrow viewports so the header can stick to the page).

### Box-sizing math for absolute children inside bordered containers

`box-sizing: border-box` is the MUI default. When you set `height: 52` on a container with `border: '1px solid'`, the content area is 50px (52 minus 2×1px borders). Absolute-positioned children using `top: X` are measured from the padding-edge (inside the border). If you compute the child's `height: TRACK_H - INSET * 2` based on the outer height, you'll be 2px too tall and the bottom gap will be visibly smaller than the top gap.

Cleanest fix: use paired insets so the math is implicit:

```tsx
sx={{ position: 'absolute', top: INSET, bottom: INSET, left: INSET, width: ... }}
```

The thumb auto-fits between the top + bottom insets — borders can't squeeze it.

### CSS variables for layout dimensions, not magic numbers

The topbar height is `var(--layout-header-mobile-height)` (xs) / `var(--layout-header-desktop-height)` (md+), declared in `apps/front/src/layouts/core/css-vars.ts`. Never hardcode `top: 72`, `marginTop: 64`, etc. for layout-relative offsets — use the variable so a topbar resize propagates everywhere.

```tsx
sx={(theme) => ({
  position: 'sticky',
  top: 'var(--layout-header-mobile-height)',
  [theme.breakpoints.up('md')]: {
    top: 'var(--layout-header-desktop-height)',
  },
})}
```

### Iconify icon names must be registered

`<Iconify icon="ph:check-bold">` works only if `'ph:check-bold'` is in `apps/front/src/components/iconify/icon-sets.ts`. Unknown names trigger a runtime warning AND a network fetch (visible flicker on first paint). The `as never` cast (e.g. `icon={'ph-fill:tag' as never}`) suppresses the TypeScript error that would otherwise catch it — **never use `as never` on Iconify**. If TS complains, the icon name is wrong; either fix the name or register it in `icon-sets.ts`.

Phosphor naming: registered icons use `'ph:NAME-bold'`, `'ph:NAME-fill'`, `'ph:NAME-fill'` — not `'ph-fill:NAME'` (that's the Tailwind/CDN convention from canvas markup, but our registered set uses colon-after-prefix).

### Audit ALL buttons when a hover rule is in play

The `/pricing` page has tier-card CTAs, comparison-table column headers, and a "talk to sales" CTA — all separate Buttons. Fixing the hover convention on one type doesn't fix it on the others. When chasing a hover bug, grep for every `Button` import on the page and inspect each.

### Layout chrome bugs aren't always your bugs

The "footer is different on /pricing" complaint turned out to be a pre-existing `MainLayout` conditional rendering a placeholder `Footer` for `pathname !== '/'`. If something looks wrong on a non-home marketing page that didn't exist before, check `MainLayout` (and similar shared chrome) for `isHomePage`-style branches that quietly degrade for new routes.

### Canvas content is authoritative when it conflicts with prior code

When AIDesigner canvas content (tier feature lists, FAQ copy, hero phrasing) conflicts with what the home page already had, canvas wins — it was designed intentionally and reviewed visually. Update `_data/*` to match the canvas; older home-only strings get replaced.

## Adding a new marketing page

1. Compose from MUI v6 + `sx` like the rest of the codebase.
2. Use this guide's divergence table for radii / spacing / button sizes.
3. For any color: theme tokens first; only fall back to the approved-exceptions list above.
4. Hover convention applies (stable bg/text/border, transform + shadow only).
5. Verify dark mode parity before merging — cycle through the color-scheme toggle and confirm no hardcoded light-only assumptions.
6. If you add a third repeating constant, extract to `_shared/` per the section above.
