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
├── home/
│   ├── home-page.tsx          # composes the parts
│   └── parts/
│       ├── home-hero.tsx
│       ├── home-features.tsx
│       ├── home-onboarding.tsx
│       ├── home-pricing.tsx
│       ├── home-faq.tsx
│       ├── home-cta.tsx
│       └── home-logos.tsx
└── (future: pricing/, blog/, changelog/)
```

The marketing layout (`apps/front/src/layouts/main/layout.tsx`) handles the transparent-on-scroll topbar and `MainLayout`. This layout is **only** mounted under marketing routes; auth and dashboard use their own layouts.

## When to add `_shared/`

Currently every marketing-only constant (step tones, dark surface hex, third-party brand colors) lives in the part that uses it. **This is fine for one marketing page.** When the second marketing page lands (pricing, blog, etc.), extract:

- `apps/front/src/routes/marketing/_shared/tokens.ts` — `MARKETING_DARK_SURFACE`, `SOCIAL_BRAND_COLORS`, marketing radius/spacing/button-size constants
- `apps/front/src/routes/marketing/_shared/sx-presets.ts` — `marketingCardSx`, `marketingCtaButtonSx`, `marketingSectionSx`

Don't pre-build this for one page. Premature.

## Adding a new marketing page

1. Compose from MUI v6 + `sx` like the rest of the codebase.
2. Use this guide's divergence table for radii / spacing / button sizes.
3. For any color: theme tokens first; only fall back to the approved-exceptions list above.
4. Hover convention applies (stable bg/text/border, transform + shadow only).
5. Verify dark mode parity before merging — cycle through the color-scheme toggle and confirm no hardcoded light-only assumptions.
6. If you add a third repeating constant, extract to `_shared/` per the section above.
