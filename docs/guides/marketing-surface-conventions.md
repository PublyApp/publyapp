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
│   ├── pricing-tier-card.tsx
│   ├── legal-doc-page.tsx                # slot-based: hero + sticky TOC + body slot
│   ├── marketing-eyebrow.tsx             # canon eyebrow chip (white-bg pill + optional icon)
│   ├── marketing-hero.tsx                # prop-based hero (eyebrow + h1 + subhead + optional CTAs)
│   ├── content-band.tsx                  # slot-based section (centered header + children)
│   ├── cta-band.tsx                      # dark #242424 card (eyebrow pill + title + CTA + microcopy)
│   └── marketing-error-view.tsx          # gradient numeral + masked glass + popular destination pills
├── _data/                                # shared static content modules
│   ├── pricing.ts                        # TIERS, COMPARISON_MATRIX, PRICING_FAQS, Billing
│   ├── legal-terms.ts                    # TERMS_LAST_UPDATED, TERMS_SECTION_IDS, TERMS_TOC
│   ├── legal-privacy.ts                  # PRIVACY_LAST_UPDATED, PRIVACY_SECTION_IDS, PRIVACY_TOC
│   ├── legal-cookies.ts                  # COOKIES_LAST_UPDATED, COOKIES_SECTION_IDS, COOKIES_TOC, CookieInventoryRow, COOKIES_INVENTORY
│   ├── about.ts                          # COMPANY_VALUES, TEAM_MEMBERS (with photoUrl)
│   ├── contact.ts                        # CONTACT_EMAIL, CONTACT_CHANNELS, SUPPORT_TIERS, CONTACT_TOPICS, CONTACT_FAQS
│   └── security.ts                       # SECURITY_CONTACT_EMAIL, TRUST_BADGES, SECURITY_PILLARS, SUB_PROCESSORS
├── _layout/
│   └── marketing-layout.tsx              # mounts MainLayout + ScrollProgress + BackToTop + ErrorBoundary
├── _errors/
│   └── marketing-not-found-page.tsx      # catch-all; thin shim consuming MarketingErrorView
├── home/
│   ├── home-page.tsx
│   └── _parts/
│       ├── home-hero.tsx
│       ├── home-features.tsx
│       ├── home-onboarding.tsx
│       ├── home-pricing.tsx
│       ├── home-faq.tsx
│       ├── home-cta.tsx                  # thin wrapper: <CtaBand {...home-specific copy} />
│       └── home-logos.tsx
├── pricing/
│   ├── pricing-page.tsx
│   └── _parts/
│       ├── pricing-hero.tsx              # custom variant — chip eyebrow + gradient title + halo + integrated BillingCycleToggle (deliberately doesn't compose MarketingHero)
│       ├── pricing-tiers.tsx
│       ├── pricing-comparison.tsx
│       ├── pricing-faq.tsx
│       └── pricing-enterprise.tsx
├── terms/
│   └── terms-page.tsx                    # composes <LegalDocPage>; body JSX inline
├── privacy/
│   └── privacy-page.tsx
├── cookies/
│   └── cookies-page.tsx                  # adds inline <CookieInventoryTable> + <CookiePreferencesCallout>
├── about/
│   └── about-page.tsx                    # composes MarketingHero + custom OurStorySection (2-col + founder quote) + ContentBand x4 + CtaBand
├── contact/
│   ├── contact-page.tsx                  # composes MarketingHero + ContentBand (form + info-panel split) + ContentBand (FAQ) + CtaBand
│   └── _parts/
│       └── contact-form.tsx              # RHF + Zod, mailto: submit, response-time microcopy below button
├── security/
│   └── security-page.tsx                 # composes MarketingHero + custom trust-badges row + ContentBand x3 + ContentBand (vulnerability) + CtaBand
└── (future: blog/, changelog/)
```

Generic hooks consumed by marketing primitives (placed in shared `hooks/` so future blog/docs surfaces can reuse them):

```
apps/front/src/hooks/
└── use-active-toc-section.ts             # IntersectionObserver-based active TOC item tracker
```

All non-route folders inside `apps/front/src/routes/` use a leading-underscore prefix (`_components`, `_data`, `_layout`, `_parts`, `_errors`, `_tree`). When you create a folder under a route that's NOT itself a route, prefix it with `_`.

The marketing layout (`apps/front/src/layouts/main/layout.tsx`) handles the transparent-on-scroll topbar and unconditionally renders `HomeFooter` for ALL marketing routes (the `isHomePage` gate that previously rendered a placeholder `Footer` on non-home routes was removed). This layout is **only** mounted under marketing routes; auth and dashboard use their own layouts.

## Shipped shared primitives — use these, don't fork

When building a new marketing page, check `_components/` first:

| Primitive | Purpose | Used by |
|---|---|---|
| `BillingCycleToggle` | Custom Monthly/Annually segmented toggle with sliding dark thumb (light) / white thumb (dark). Spring physics on slide. | `home-pricing`, `pricing-hero` |
| `PricingTierCard` | Tier card (Creator/Scale/Enterprise) with framer-motion spring hover, large-radius surface, circle+check feature icons, Box-as-button CTA. Handles `'custom'` price ("Let's talk"). | `home-pricing` (slice 0..2), `pricing-tiers` (full TIERS) |
| `MarketingFaqAccordion` | Custom framer-motion accordion (no MUI Accordion); plus/X icon swap, snappy spring expand, neutral elevated shadow when open. Independent toggle per item; supports `defaultOpen`. | `home-faq`, `pricing-faq` |
| `LegalDocPage` | Slot-based long-form page: full-width hero band (eyebrow + h1 + last-updated), 2-col body row (`flex:1` body + 240px sticky TOC sidebar), active-section TOC highlight via `useActiveTocSection`. Body content passed as `children` JSX. Also exports `LEGAL_H2_SX`, `LEGAL_P_SX` so all consumers share section-heading and prose typography. Container narrowed to a custom 1024px maxWidth so the body settles around 700px reading width. | `terms-page`, `privacy-page`, `cookies-page` |
| `MarketingEyebrow` | **Canon eyebrow chip.** White-bg pill, divider border, faint shadow, near-black uppercase text + optional primary-color icon. The single eyebrow style across ALL marketing surfaces (hero + section eyebrows + home section labels). | `MarketingHero`, `ContentBand`, all 4 home `*-features/onboarding/pricing/faq` |
| `MarketingHero` | Prop-based centered hero: eyebrow + h1 + subhead + optional `primaryCta` / `secondaryCta` pair, with optional `eyebrowIcon`. Locks the brand-consistent heading triplet across pages. CTAs use `<Box component={RouterLink/'a'}>` (not MUI Button); external-href detection switches RouterLink → `<a>` for `mailto:`/`http`. | `/about`, `/contact`, `/security` (NOT `/pricing` — pricing's chip+gradient+halo+billing-toggle hero is intentionally a custom variant) |
| `ContentBand` | Slot-based section wrapper: centered header (eyebrow chip + h2 + optional subhead) above arbitrary `children` body. Header centers via `mx auto + alignItems center + textAlign center`. Always `bgcolor: 'background.default'` — no `bg='neutral'` alternation (Phase 3 dropped this; sections separated by spacing only). | `/about`, `/contact`, `/security` for grids/tables/inline blocks |
| `CtaBand` | Dark `#242424` card (always-dark, both color schemes — see approved exceptions). Eyebrow pill + h2 (with `pre-line` `\n` support) + subhead + CTA button + microcopy. `pt: { xs: 8, md: 12 }` matches `ContentBand pb` for consistent vertical rhythm. | `home`, `/about`, `/security` (NOT `/contact` — contact ends at the form per spec) |
| `MarketingErrorView` | Visual shell for 404 + render errors: gradient-text numeral (orange→purple→teal) + masked glass card (radial gradient mask scoped to top region) + ambient triple-radial watermark + popular-destination pills (flag-guarded). Props: `numeral`, `title`, `subhead`, optional `destinations`. | `/marketing-not-found-page` (404 catch-all), `MarketingLayout`'s `ErrorBoundary` (route-error 404 + 500-style) |

Tier prices, feature lists, comparison rows, and FAQ items live in `_data/pricing.ts` — one source of truth shared by both pages. **Never duplicate tier prices/features in a part file.** If pricing changes, edit `_data/pricing.ts`.

The `Billing = 'monthly' \| 'annually'` type exported from `_data/pricing.ts` is the canonical billing-state shape for ALL marketing pages.

## Long-form content pages (sticky TOC pattern)

Legal pages, future blog articles, and future docs all share the same shape: a hero band on top, then a 2-column body with the prose on the left and a sticky table-of-contents sidebar on the right. The `LegalDocPage` primitive codifies the pattern; if a new long-form page lands (DPA, AUP, blog article, doc page), it should compose `LegalDocPage` rather than rebuilding the layout.

Layout rules baked into the primitive (don't relitigate per-page):

- **Hero outside the 2-col row.** Eyebrow + h1 + "Last updated" sit ABOVE the flex row, not inside the left column. Keeps the title's left edge aligned with the page (rather than indented to match a flex item) and lets the title size independently of the body's width.
- **Container ~1024px, not `lg`.** Reading-column comfort caps line length around 60–75 characters (~720px at 16px). At MUI `lg` (1200px) with TOC = 240px, body grows to ~880px — too long. At `md` (900px) it's too cramped. The custom `maxWidth: 1024` was the sweet spot for the legal trio.
- **Body uses `flex: 1, minWidth: 0, width: 1`** — no maxWidth. Body fills all available space minus the TOC sidebar + gap. The `minWidth: 0` is critical (see pitfalls below). The `width: 1` (= `100%`) keeps body filling its parent in the mobile column layout, where `flex: 1` doesn't constrain horizontal sizing.
- **Sticky TOC is the direct flex child** with `position: sticky` styled inline — NOT a wrapper Box around an inner `<TocSidebar>` component. If sticky lives on a height-collapsed wrapper its scroll context becomes the wrapper itself (240px tall), and it appears not to stick.
- **Active TOC highlight.** Drives via `useActiveTocSection({ ids, rootMargin: '-80px 0px -65% 0px' })`. The `rootMargin` top must align with where `scrollMarginTop` lands h2s on click (just below the sticky topbar) — see pitfall on this below.

Per-doc data shape (matches `_data/legal-*.ts`):

```ts
export const X_LAST_UPDATED = '2026-05-02'; // ISO; ALL pages in a trio should share the ship date
export const X_SECTION_IDS = { foo: 'foo', bar: 'bar' } as const;
export const X_TOC: TocItem[] = [
  { id: X_SECTION_IDS.foo, label: '1. Foo' },  // labels match the canvas TOC verbatim, including any numbering
  { id: X_SECTION_IDS.bar, label: '2. Bar' },
];
```

Page composition (matches `terms-page.tsx`):

```tsx
<LegalDocPage eyebrow="Legal" title="Terms of Use" lastUpdated={X_LAST_UPDATED} toc={X_TOC}>
  <Stack spacing={6}>
    <Box component="section">
      <Typography component="h2" id={X_SECTION_IDS.foo} sx={LEGAL_H2_SX}>1. Foo</Typography>
      <Typography sx={LEGAL_P_SX}>...</Typography>
    </Box>
    {/* one section per h2 in X_SECTION_IDS order */}
  </Stack>
</LegalDocPage>
```

`LEGAL_H2_SX` and `LEGAL_P_SX` are exported from `_components/legal-doc-page.tsx` so all three pages share heading + prose typography. **Never inline these styles** — import the consts.

One-off blocks (e.g. cookies' inventory table, "Open cookie preferences" callout) live as inline `<Box>` JSX inside the consumer page, NOT in the primitive. They're per-page concerns.

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

## Page composition primitives (hero + bands + bottom CTA)

The Phase 3 pages (about/contact/security) all share the same skeleton: `<MarketingHero>` → N × `<ContentBand>` → `<CtaBand>`. New marketing pages should follow this pattern unless there's a specific visual reason to diverge (pricing's bespoke hero is the precedent).

```tsx
const MyPage = () => (
  <>
    <MarketingHero
      eyebrow="Section"
      eyebrowIcon="ph:..."         // optional — chip rendering identical w/wo icon
      title="..."
      subhead="..."
      primaryCta={{ label, href }}  // optional
      secondaryCta={{ label, href }} // optional, mailto/http auto-uses <a>
    />
    <ContentBand eyebrow="Eyebrow" title="Section title" subhead="...">
      {/* grid / table / inline block */}
    </ContentBand>
    {/* repeat ContentBand per section */}
    <CtaBand
      eyebrowLabel="Get started"
      title={'Multi-line\ntitle supported'}  // \n + whiteSpace pre-line
      subhead="..."
      ctaLabel="Start for Free"
      ctaHref={FRONT_PATH_NAMES.auth.signup}
      microcopy="..."
    />
  </>
);
```

Rules baked into the primitives (don't relitigate per page):

- **One eyebrow style across the whole surface.** `MarketingEyebrow` is the only chip — Option B (white-bg pill + optional primary icon). MarketingHero, ContentBand, and the 4 home section eyebrows all consume it. **Never inline a custom eyebrow** — if you need a tweak, change the primitive.
- **No alternating background colors between sections.** `ContentBand` defaults to `background.default`; we deliberately removed the `bg='neutral'` alternation from Phase 3 pages because the visual rhythm comes from spacing + the white-bg eyebrow chips already standing out.
- **Section headers are centered.** `ContentBand` centers eyebrow + h2 + subhead via `Stack alignItems="center" textAlign="center"` to match hero alignment. If a specific section needs left-aligned text (rare — e.g. /about's Our Story 2-col with founder quote), bypass `ContentBand` and write a custom `<Box component="section">` with `Stack alignItems="flex-start"`.
- **CtaBand `pt` matches ContentBand `pb`.** Both are `{ xs: 8, md: 12 }` so the gap above the dark card matches the gap between regular ContentBands. If `pt` is smaller, the CtaBand feels cramped against the section above.
- **Inline cross-page links must mirror route flags.** If `MyCtaBand` links to `/contact` and `FEATURES.marketing.contact` is off, swap to a fallback (e.g. `mailto:`) or hide the CTA entirely. See "Centralized feature flags" below.

### Two-column section layouts (bypass ContentBand)

For sections that need left-text + right-content (e.g. /about's "Our Story" with founder quote on the right), `ContentBand`'s centered header doesn't fit. Bypass it and compose directly:

```tsx
<Box component="section" sx={{ py: { xs: 8, md: 12 } }}>
  <Container maxWidth="lg">
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '7fr 5fr' }, gap: { xs: 5, md: 8, lg: 12 }, alignItems: 'center' }}>
      <Stack spacing={3} alignItems="flex-start" sx={{ textAlign: 'left' }}>
        <MarketingEyebrow label="Our story" />
        <Typography component="h2" sx={{ /* h2 styles */ }}>Title</Typography>
        {/* paragraphs */}
      </Stack>
      {/* right column: quote card / image / etc */}
    </Box>
  </Container>
</Box>
```

Reuse `MarketingEyebrow` so the eyebrow style stays canonical — only the layout changes.

### Don't stack a card directly above CtaBand

If a section is itself wrapped in a card-like surface (white bg + border + shadow + radius — e.g. early Phase 3 had a "Found a vulnerability?" alert card right above the dark CtaBand), it visually competes with the bottom CtaBand. Two stacked cards near the page bottom = confused hierarchy.

Fix: drop the card framing on the section above CtaBand. Use a regular `ContentBand` with chip eyebrow + heading + body + inline link. The CtaBand stays the only card-style element on the page bottom.

## Marketing error view + ErrorBoundary

`MarketingErrorView` is the single visual shell for both the catch-all 404 AND any error caught by `MarketingLayout`'s `ErrorBoundary` export. Same gradient numerals, same masked glass card, same popular-destinations pill grid — just the `numeral`/`title`/`subhead` props differ.

The shell is composed once in the primitive; consumers are thin shims:

```tsx
// /marketing-not-found-page.tsx (catch-all)
const MarketingNotFoundPage = () => (
  <MarketingErrorView
    numeral="404"
    title="This post got deleted by the algorithm"
    subhead="Or maybe the link is broken. Either way — let's get you back on track."
  />
);

// marketing-layout.tsx ErrorBoundary export — catches loader throws + render exceptions
export const ErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <MainLayout><MarketingErrorView numeral="404" title="..." subhead="..." /></MainLayout>;
  }
  return <MainLayout><MarketingErrorView numeral="500" title="Something broke on our end" subhead="..." /></MainLayout>;
};
```

Wrap the boundary's view in `<MainLayout>` explicitly — the layout's normal `MarketingLayout` Outlet doesn't render when an error is thrown above it, so chrome has to be re-mounted at the boundary.

`DEFAULT_POPULAR_DESTINATIONS` in `marketing-error-view.tsx` is the canonical destination list and consumes feature flags directly — disabled marketing pages drop out of the destination grid automatically. Override only if a specific error context needs a different list.

### Glass card mask trick (theme-adaptive lift without shadow)

The 404/error glass card uses a `::before` pseudo-element with `mask-image: radial-gradient(ellipse 70% 90% at 50% 0%, black 0%, black 35%, transparent 100%)` to scope the bg + backdrop-filter to a region around the top. The bottom + sides blend into the page bg.

The mask trick is the right answer here for two reasons:

1. **Box-shadow halos invert wrong in dark mode.** A `boxShadow: '0 0 80px 24px rgba(default-bg, 0.9)'` reads as a "light bleed" in light mode (white glow on light bg = invisible halo). In dark mode, the same shadow is a dark glow on a dark page → visible darker oval — looks like a degradation artifact.
2. **The text content stays unmasked.** The bg/blur lives on `::before` (z-index -1); the h1 + subhead sit in the parent Box and render on top untouched.

When you want a glass-card effect that adapts cleanly to both color schemes, prefer `::before` + radial mask over a colored shadow.

## Centralized feature flags

All feature flags (marketing pages + staff features + future) live in `apps/front/src/lib/features/flags.ts`. Single source of truth.

```ts
export const FEATURES = deepFreeze({
  marketing: {
    about: readFlag('VITE_FEATURE_MARKETING_ABOUT', true),
    contact: readFlag('VITE_FEATURE_MARKETING_CONTACT', true),
    security: readFlag('VITE_FEATURE_MARKETING_SECURITY', true),
    blog: readFlag('VITE_FEATURE_MARKETING_BLOG', true),
    // ...
  },
  staff: {
    tenants: { details: { billing: readFlag('VITE_FEATURE_STAFF_TENANT_BILLING', false) } },
  },
});
```

`readFlag(envKey, defaultValue)` reads `import.meta.env[envKey]` — `'true'` or `'false'` strings override; anything else falls through to `defaultValue`. Static defaults edit-and-redeploy; env-var overrides flip without recompile.

### One flag drives BOTH route registration AND link visibility

If you flip a marketing flag off but only guard the route, every link pointing to it 404s on click — bad UX. The same flag must also hide:

1. **Routes** (`marketing.routes.ts`): spread-guard each route. Disabled routes fall through to the catch-all 404 naturally.
   ```ts
   ...(FEATURES.marketing.about ? [route('about', '...')] : []),
   ```
2. **Footer link arrays** (Product / Company / Resources / Legal): spread-guard each entry. Empty columns hide entirely (filter the column-data array; grid template adjusts via `repeat(${2 + visibleCols.length}, 1fr)`).
   ```ts
   ...(FEATURES.marketing.about ? [{ label: 'About', href: '...' }] : []),
   ```
3. **Default destinations on `MarketingErrorView`**: same spread-guard pattern in `DEFAULT_POPULAR_DESTINATIONS`.
4. **Cross-page inline links**: the `/about` "Get in touch" → `/contact` button is conditionally rendered with `{FEATURES.marketing.contact && <Box ...>}`. The `/security` CtaBand `ctaHref` falls back to `mailto:security@` when contact is off.

Audit checklist when adding a new feature-flag entry: route + footer column entries + 404 destinations + every inline cross-page reference. One flag flip should toggle all of them.

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

This includes "boring" details like TOC label numbering — if the canvas TOC reads `"1. Acceptance of Terms"`, the data module's TOC label must include the `"1. "` prefix. Don't strip it for "cleaner" looks.

### Flex item containing wide content (table, code block) → page-wide horizontal scroll

The default `min-width: auto` on a flex item lets it grow PAST its `flex` allocation when its content is wider than the allocation. A wide table inside a `<Box overflowX="auto">` wrapper inside a flex-item body Box will inflate the body past viewport, even though the wrapper is supposed to clip and scroll the table internally.

Fix: add `minWidth: 0` to the flex item itself. Then `flex: 1` actually constrains the item to its allocated space, the inner overflow wrapper does its job, and the table scrolls inside the wrapper instead of inflating the page.

For the `LegalDocPage` body slot: `flex: 1, minWidth: 0, width: 1` (the `width: 1` covers the mobile-column case where flex-grow doesn't apply).

This is the trap that caused the page-wide horizontal scroll on `/cookies`.

### MUI sx `width: 1` is `100%`, not `1px`

In MUI's `sx` prop, `width: 1` is shorthand for `100%` (theme spacing semantics for box dimensions), NOT one pixel. For a 1×1 visually-hidden element (the standard a11y trick), use literal pixel strings:

```tsx
sx={{
  position: 'absolute',
  width: '1px',   // NOT width: 1 (that's 100%)
  height: '1px',  // NOT height: 1
  margin: '-1px',
  // ...
}}
```

Same trap applies to `width: 0.5` (= `50%`), `height: 1` (= `100%`), etc. When you mean a pixel value, write the string.

### `<caption>` element + `position: absolute` doesn't behave normally

The HTML `<table><caption>` element has special table-layout handling. Applying `position: absolute` directly to the caption (e.g. for the visually-hidden a11y trick) causes layout glitches in some browsers and engines.

If you need a screen-reader-only caption, the safe pattern is a zero-height caption shell with a visually-hidden span inside:

```tsx
<Box component="caption" sx={{ captionSide: 'bottom', height: 0, p: 0, m: 0, lineHeight: 0, overflow: 'hidden' }}>
  <Box component="span" sx={VISUALLY_HIDDEN_SX}>caption text</Box>
</Box>
```

Better yet: skip the caption entirely if the surrounding section h2 already tells screen readers what the table is about. Defensive a11y armor that just duplicates context above is noise; section heading + `<th scope="col">` cells almost always suffice.

### `position: sticky` element must be the direct flex/scroll child

`position: sticky` anchors the element within its parent's box. If the sticky element is wrapped in a Box that ONLY exists to apply `display: { xs: 'none', lg: 'block' }`, the wrapper collapses to the sticky child's height (e.g. 240px), and sticky's "scroll context" becomes that 240px wrapper instead of the tall flex container — appearing not to stick.

Fix: put the `display: { xs: 'none', lg: 'block' }` ON the sticky element itself. Don't wrap it in a layout-only Box.

### IntersectionObserver `rootMargin` must align with `scrollMarginTop`

For active-section TOC highlighting, the IntersectionObserver's effective viewport must INCLUDE the position where clicked anchor links land. With a sticky topbar + `scrollMarginTop: 'calc(var(--layout-header-desktop-height) + 16px)'`, h2s land at ~80px from viewport top on click. If `rootMargin` is `'-20% 0px -70% 0px'` (the hook's generic default), the active band starts at 20% of viewport height — meaning the just-landed h2 at 80px is ABOVE the band → IntersectionObserver doesn't fire → clicked TOC item never registers as active.

Fix in the consumer: pass an explicit `rootMargin` whose top matches the topbar offset:

```tsx
useActiveTocSection({ ids, rootMargin: '-80px 0px -65% 0px' })
```

The `-80px` shrinks the viewport top by 80px so the active band starts right where h2s land. The `-65%` shrinks the bottom so the band is a comfortable middle-of-viewport region (not too tall, not too thin).

### `lastUpdated` consistency across a content trio

Pages that ship together as a trio (legal: Terms / Privacy / Cookies; future: company: About / Contact / Security) and share a "Last updated" date band should ALL display the trio's ship date, not whatever date the AIDesigner canvas was authored on. Inconsistent dates within a same-day-shipping group ("Terms: May 2 / Privacy: May 2 / Cookies: April 30") look like a bug to users.

When in doubt, the trio's ship date wins over canvas-design date for this one field. Other content fields (TOC numbering, h2 wording, prose) still follow canvas-faithful rules.

### Don't pre-extract a11y armor that duplicates surrounding context

A `<caption>` describing a table sitting under an `<h2>Cookies We Set</h2>` is redundant — screen readers reading sequentially already know what the table is. Same for ARIA labels that just restate visible text. The marketing-page review rule: add a11y attributes when context is genuinely missing, not when context is redundant.

### Inline-flex flex-item still defaults to `align-self: stretch`

`display: 'inline-flex'` on a child of a flex container changes the child's INNER layout to flex but does NOT shrink it to content as a flex item. As a flex item, its outer size is governed by the parent's `align-items` (cross axis). If the parent doesn't set `alignItems` and the child doesn't set `alignSelf`, the default `align-self: stretch` makes the child fill the cross axis.

This bit `MarketingEyebrow` after we removed its baked-in `alignSelf: 'center'` (so consumers could control alignment): the eyebrow chip stretched to full hero width. Fix: ensure parent containers consuming the eyebrow have an explicit `alignItems` (`'center'` for centered headers, `'flex-start'` for left-aligned 2-col layouts). `MarketingHero` and `ContentBand` both set `alignItems: 'center'` on their header Stack now.

### Mask trick > shadow trick for theme-adaptive glass

See "Glass card mask trick" above. Summary: when you want a glass card to lift visually without a defined boundary, use `::before` + `mask-image: radial-gradient(...)` to scope the bg + backdrop-filter. A `boxShadow` halo using `var(--mui-palette-background-default)` at high alpha looks fine in light mode but creates a visible darker oval in dark mode (dark glow on dark gradient watermark = visible boundary). Mask scales the visual rendering itself so it inherits the page bg correctly in both schemes.

### CtaBand top spacing must match ContentBand bottom

Originally `CtaBand` had `pt: 5` (40px) because `home-cta` was its only consumer and the home FAQ above already had its own bottom padding. After Phase 3 added it to /about and /security where ContentBands precede it, the 40px gap felt cramped against the 96px ContentBand `pb`. Now `pt: { xs: 8, md: 12 }` matches ContentBand's `py` so the inter-section rhythm stays consistent (192px gap going into CtaBand, same as gap between two ContentBands).

If you add a new card-like primitive that follows other content sections, audit its `pt` against the upstream section's `pb`.

### Footer columns hide when empty (don't render orphan headings)

When all entries in a footer link column are flag-guarded off, render the column conditionally — don't leave an orphan heading ("Resources") above an empty `<ul>`. The Phase 3 footer refactor uses a column-data array filtered by `column.links.length > 0`, then renders only visible columns and computes the grid template `repeat(${2 + visibleCols.length}, 1fr)` so columns redistribute cleanly.

Same logic applies to bottom legal row: filter the array; if a Legal entry's flag is off, drop it.

### "Use the canvas hero style" can clash with the canon eyebrow

Canvas designs occasionally pick different eyebrow styles per page (e.g. /pricing canvas uses white-bg chip, /security canvas uses primary-tinted chip, /about canvas uses plain uppercase). When standardizing on a canon, you may have to override per-page canvas eyebrow choices to keep brand discipline. The canon decision (Option B, white-bg chip) was chosen for two reasons: multiple canvases independently picked it (pricing, contact); white-bg + primary icon balances brand presence without monochromatic green-on-green fatigue.

If a canvas eyebrow has a deliberate semantic meaning (e.g. "warning" needs amber tint), override per-page; otherwise consume the canon.

### Pricing hero is a deliberate variant — don't force it through MarketingHero

The pricing hero has a chip eyebrow with icon, gradient text on part of the title, a halo decorative element behind the heading, and an integrated `BillingCycleToggle` below the subhead. None of these fit `MarketingHero`'s prop-based interface without polluting the primitive (`eyebrowVariant`, `titleHighlight`, `decoration`, etc).

Documented decision: `pricing-hero.tsx` keeps its custom inline implementation. `MarketingHero` is the base for /about, /contact, /security, marketing 404, and any future page whose hero IS a clean eyebrow + h1 + subhead + optional CTAs. Don't try to absorb pricing back in.

### About page Unsplash photos use specific photo IDs (not source.unsplash.com)

`source.unsplash.com/random` is deprecated/unreliable. Use specific Unsplash hot-link URLs:

```ts
const unsplashPortrait = (slug: string): string => {
  return `https://images.unsplash.com/photo-${slug}?w=240&h=240&fit=crop&crop=faces&auto=format&q=80`;
};
```

The `crop=faces` param ensures faces don't get cut off when the URL crops. `TEAM_MEMBERS` in `_data/about.ts` uses 12 known portrait slugs as placeholders — replace pre-launch with real team photos.

## Adding a new marketing page

1. Compose from MUI v6 + `sx` like the rest of the codebase.
2. Use this guide's divergence table for radii / spacing / button sizes.
3. For any color: theme tokens first; only fall back to the approved-exceptions list above.
4. Hover convention applies (stable bg/text/border, transform + shadow only).
5. Verify dark mode parity before merging — cycle through the color-scheme toggle and confirm no hardcoded light-only assumptions.
6. If you add a third repeating constant, extract to `_shared/` per the section above.
