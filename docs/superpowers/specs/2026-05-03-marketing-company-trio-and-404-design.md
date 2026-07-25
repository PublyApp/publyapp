# Phase 3 — Marketing company trio + 404 (`/about`, `/contact`, `/security`, marketing 404)

**Status:** Design approved (2026-05-03)
**Phase:** 3 of 6 of the marketing supporting-pages effort
**Parent spec:** `docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md`
**Predecessors (shipped):**
- `docs/superpowers/specs/2026-05-01-marketing-pricing-design.md` (Phase 1)
- `docs/superpowers/specs/2026-05-02-marketing-legal-design.md` (Phase 2)

## Summary

Ship four marketing routes — `/about`, `/contact`, `/security`, marketing 404 — and extract three new shared primitives: `MarketingHero`, `ContentBand`, `CtaBand`. Two retroactive refactors land in the same phase so existing consumers (Phase 1's `pricing-hero` and home's `HomeCta`) inherit the new primitives instead of drifting on inline implementations. The Contact page ships with a real RHF + Zod form whose submit triggers a `mailto:` link (no backend in this phase).

## Inputs locked from brainstorming

| Decision | Choice | Rationale |
| --- | --- | --- |
| Phase decomposition | Single Phase 3 (no split) | Most conceptual decisions span all 4 pages; ceremony of 3 sub-phases isn't worth it |
| Contact form submission | `mailto:` link (no backend) | Functional from day one, no backend dependency, clean upgrade path later |
| Team grid data | Generic placeholders | Avoids real-name claims; swap pre-launch without redesigning |
| Sub-processors data | Generic placeholders | Real list needs legal review (out of scope); placeholders show the visual |
| `MarketingHero` interface | Prop-based | Locks brand-consistent heading triplet across 5+ consumers |
| `ContentBand` interface | Slot-based | Internal layouts (grid / split / table) genuinely vary |
| `CtaBand` interface | Prop-based | Pattern is uniform across consumers; prevents future drift |
| Retroactive refactor `pricing-hero` | Yes | The whole point of extraction is locking visual consistency |
| Retroactive refactor `HomeCta` | Yes | Same as above; ships in the same task as `CtaBand` extraction |
| 404 search box | Drop entirely | Inert search is user-hostile; functional needs a real index that doesn't exist; static link grid is honest |
| 404 routing | Catch-all `route('*', ...)` inside `MarketingLayout` | Matches existing convention (staff/tenant scopes each have their own catch-all 404) |
| i18n on Phase 3 copy | Out (English only) | Phase 1+2 precedent |

## Inputs from canvases

Four light-mode canvases drive visual translation. No dark canvases exist for any Phase 3 page — dark mode derived from theme tokens via `theme.applyStyles` per the parent spec's hybrid pivot.

| Page | Mode | Canvas ID |
| --- | --- | --- |
| About | light | `778a0d63-2e0b-4b2c-9e4e-a2e7e88b2957` |
| Contact | light | `78b2258b-7518-43e4-86ce-ad50bbe37a87` |
| Security | light | `9e9499b8-10e0-47de-b7f8-206c4e8a9110` |
| 404 / Not Found | light | `06818f67-4e71-4281-bba5-a8bb1575590e` |

Brand kit: `31329e88-32ed-4dc2-9130-c5f5018e1c67` (locked in Phase 1).

## File layout

```
apps/front/src/routes/marketing/
├── _components/
│   ├── billing-cycle-toggle.tsx
│   ├── legal-doc-page.tsx
│   ├── marketing-faq-accordion.tsx
│   ├── pricing-tier-card.tsx
│   ├── marketing-hero.tsx                 ← NEW
│   ├── content-band.tsx                   ← NEW
│   └── cta-band.tsx                       ← NEW (extracted from HomeCta)
├── _data/
│   ├── pricing.ts
│   ├── legal-{terms,privacy,cookies}.ts
│   ├── about.ts                           ← NEW
│   ├── contact.ts                         ← NEW
│   └── security.ts                        ← NEW
├── _errors/                                ← NEW (mirrors authed/{staff,tenant}/_errors/)
│   └── marketing-not-found-page.tsx       ← NEW
├── about/
│   └── about-page.tsx                     ← NEW
├── contact/
│   ├── contact-page.tsx                   ← NEW
│   └── _parts/
│       └── contact-form.tsx               ← NEW
├── security/
│   └── security-page.tsx                  ← NEW
├── home/
│   ├── home-page.tsx
│   └── _parts/
│       ├── home-cta.tsx                   (REFACTORED — consumes CtaBand)
│       └── ... (others unchanged)
└── pricing/
    ├── pricing-page.tsx
    └── _parts/
        ├── pricing-hero.tsx               (REFACTORED — consumes MarketingHero)
        └── ... (others unchanged)
```

`/about`, `/security`, marketing 404 are single-file pages (no `_parts/` subfolders — sections compose inline using the new primitives). `/contact` gets a `_parts/` subfolder for `contact-form.tsx` because the form is its own non-trivial concern.

## Primitive interfaces

### `MarketingHero` (prop-based)

```tsx
type MarketingHeroProps = {
  eyebrow: string;
  title: string;
  subhead: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
};
```

Renders the brand-consistent heading triplet (eyebrow uppercase + h1 + body subhead) and an optional CTA pair below. Each consumer calls with its specific copy; visual styling lives in the primitive so future changes (h1 size, eyebrow letter-spacing) happen in one file.

CTAs use the `<Box component={RouterLink|'a'}>` pattern from `marketing-surface-conventions.md` (NOT MUI `<Button>` — see the convention guide's "MUI Button hover-bg cascade" pitfall).

### `ContentBand` (slot-based)

```tsx
type ContentBandProps = {
  eyebrow?: string;
  title: string;
  subhead?: string;
  bg?: 'default' | 'neutral'; // optional bg variant for visual section breaks
  children: ReactNode;
};
```

Renders the common section header (eyebrow + h2 + optional subhead) and an arbitrary body via `children`. Consumer pages decide their internal layout (grid / split / table / single column).

### `CtaBand` (prop-based)

```tsx
type CtaBandProps = {
  eyebrowLabel: string;       // e.g. "Start Scaling Today"
  title: string;              // supports `\n` line breaks for multiline display
  subhead: string;
  ctaLabel: string;
  ctaHref: string;
  microcopy: string;          // e.g. "14-day free trial. No credit card required."
};
```

Renders the dark `#242424` card (with noise overlay + radial glow + framer-motion CTA) extracted from `HomeCta`. The pattern is uniform across all consumers; props feed the page-specific copy.

## Per-page composition

### `/about`

```
<MarketingHero eyebrow="Our story" title="..." subhead="..." />
<ContentBand title="Mission">           (single-paragraph mission narrative)
<ContentBand title="Our values">        (4–6 values cards in grid)
<ContentBand title="The team">          (portrait grid from TEAM_MEMBERS)
<ContentBand title="We're hiring">      (tease + CTA to /contact)
<CtaBand ... />                          (bottom "Start for Free")
```

`_data/about.ts`:
```ts
export type CompanyValue = { id: string; title: string; body: string; icon: string };
export type TeamMember = { id: string; name: string; role: string; portraitUrl?: string };
export const COMPANY_VALUES: CompanyValue[] = [...];   // 4–6 from canvas
export const TEAM_MEMBERS: TeamMember[] = [...];       // 6–12 placeholder members
```

### `/contact`

```
<MarketingHero eyebrow="Contact" title="..." subhead="..." />
<ContentBand>
  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 6 }}>
    <ContactForm />                      (left)
    <Box>support tiers, email, response-time</Box>   (right)
  </Box>
</ContentBand>
```

No bottom `CtaBand` — Contact pages naturally end at the form per UX convention (the "Send" button is the page's primary CTA; competing with another CTA below would dilute focus).

`contact-form.tsx`:
```tsx
const ContactSchema = z.object({
  name: z.string().min(1, 'Required').max(120),
  email: z.string().email(),
  topic: z.enum(['general', 'sales', 'support', 'partnership', 'press']),
  message: z.string().min(20, 'Tell us a bit more').max(2000),
});

const ContactForm = () => {
  const methods = useForm<z.infer<typeof ContactSchema>>({ ... });
  const onSubmit = methods.handleSubmit((values) => {
    const subject = encodeURIComponent(`[${values.topic}] ${values.name}`);
    const body = encodeURIComponent(
      `From: ${values.name} <${values.email}>\n\n${values.message}`
    );
    window.location.href = `mailto:contact@publyapp.com?subject=${subject}&body=${body}`;
  });
  return <Form methods={methods} onSubmit={onSubmit}>...<Field.Text name="name" />...</Form>;
};
```

Uses `Form` / `Field.*` wrappers from `@/front/components/hook-form` per AGENTS.md frontend standards (never raw MUI `TextField` with `register()`).

`_data/contact.ts` exports `SUPPORT_TIERS` (3 rows: Free / Scale / Enterprise → response time + channel) and `CONTACT_EMAIL`.

### `/security`

```
<MarketingHero eyebrow="Trust & Security" title="..." subhead="..." />
<ContentBand title="Trust badges">         (3–4 badge tiles — placeholder)
<ContentBand title="Defense in depth">     (6-pillar grid from SECURITY_PILLARS)
<ContentBand title="Sub-processors">       (inline 3-col table — Vendor / Purpose / Region)
<ContentBand title="Reporting a vulnerability">  (mailto:security@... + PGP fingerprint placeholder)
<CtaBand ... />                             (bottom "Start for Free")
```

`_data/security.ts`:
```ts
export type TrustBadge = { id: string; label: string; description: string; icon: string };
export type SecurityPillar = { id: string; title: string; body: string; icon: string };
export type SubProcessor = { id: string; vendor: string; purpose: string; region: string };
export const TRUST_BADGES: TrustBadge[] = [...];           // 3–4
export const SECURITY_PILLARS: SecurityPillar[] = [...];   // 6 from canvas
export const SUB_PROCESSORS: SubProcessor[] = [...];       // 6 placeholder rows
export const SECURITY_CONTACT_EMAIL = 'security@publyapp.com';
```

The sub-processors table follows the `/cookies` inventory-table pattern: `<Box component="table">` wrapped in `<Box sx={{ overflowX: 'auto' }}>` with `minWidth` on the inner table for mobile horizontal-scroll. (The `minWidth: 0` flex-item guard from Phase 2 already lives in any consumer wrapping the table inside flex.)

### Marketing 404

```
<Container>
  <Box sx={{ position: 'relative', overflow: 'hidden' }}>     (decorative gradient layer behind)
    <Typography sx={{ fontSize: { xs: 120, md: 200 }, ... }}>404</Typography>
    <Typography variant="h1">Page not found</Typography>
    <Typography>This page wandered off — here's where most folks were headed.</Typography>
    <Button href={FRONT_PATH_NAMES.home}>Back to home</Button>
  </Box>
  <Box>                                                       (popular destinations grid, ~6 tiles)
    {POPULAR_DESTINATIONS.map(...)}
  </Box>
</Container>
```

No `_data/404.ts` — `POPULAR_DESTINATIONS` is small enough (~6 tiles: Pricing, Blog placeholder, Docs placeholder, Login, Sign up, Contact) to live as a const at the top of `marketing-not-found-page.tsx`. No `CtaBand` (utility page, skips it per parent spec).

The gradient watermark is canvas-derived — orange/purple/teal radial gradient layers behind the "404" numerals. Implemented as decorative `<Box sx={{ background: 'radial-gradient(...)' }}>` siblings (similar to `HomeCta`'s noise overlay pattern). Uses theme tokens / approved hardcoded gradient colors per the marketing-surface-conventions guide.

## Routing + constants

**`packages/shared-ts/lib/constants.ts`** — extend the existing `marketing` namespace:

```ts
marketing: {
  pricing: makePath('pricing'),
  terms: makePath('terms'),
  privacy: makePath('privacy'),
  cookies: makePath('cookies'),
  about: makePath('about'),       // NEW
  contact: makePath('contact'),   // NEW
  security: makePath('security'), // NEW
},
```

(No path constant for the marketing 404 — it's a catch-all, not a named route.)

**`apps/front/src/routes/_tree/marketing.routes.ts`** — add 3 named routes + 1 catch-all (catch-all MUST be last):

```ts
layout('routes/marketing/_layout/marketing-layout.tsx', [
  index('routes/marketing/home/home-page.tsx'),
  route('pricing', 'routes/marketing/pricing/pricing-page.tsx'),
  route('terms', 'routes/marketing/terms/terms-page.tsx'),
  route('privacy', 'routes/marketing/privacy/privacy-page.tsx'),
  route('cookies', 'routes/marketing/cookies/cookies-page.tsx'),
  route('about', 'routes/marketing/about/about-page.tsx'),                          // NEW
  route('contact', 'routes/marketing/contact/contact-page.tsx'),                    // NEW
  route('security', 'routes/marketing/security/security-page.tsx'),                 // NEW
  route('*', 'routes/marketing/_errors/marketing-not-found-page.tsx'),              // NEW
]),
```

The catch-all only fires for paths that didn't match any other route in the entire route config (staff/`*`, tenant/`*`, etc. take precedence due to React Router's most-specific-match resolution).

## Refactor sequencing

Phase 3 task order matters because the retroactive refactors depend on the new primitives existing first. Recommended order for the implementation plan:

1. Add path constants
2. Build `MarketingHero` primitive
3. Build `ContentBand` primitive
4. Extract `CtaBand` from `HomeCta` AND refactor `HomeCta` to consume it (single task — never break home between commits)
5. Refactor `pricing-hero` to consume `MarketingHero`
6. Build `/about` (data module + page)
7. Build `/contact` (data module + page + form _part)
8. Build `/security` (data module + page)
9. Build marketing 404
10. Wire all 4 routes in `marketing.routes.ts`
11. Final verification + browser walkthrough

## Dark mode

Pure token-driven across all four pages. No `// dark-diff:` overrides expected. Concretely:

| Surface | Token / approach |
| --- | --- |
| Page background | `bgcolor: 'background.default'` |
| Section neutral background (alternating bands if any) | `bgcolor: 'background.neutral'` (auto-swaps) |
| Body text | `color: 'text.primary'` / `'text.secondary'` |
| Accent / CTAs | `primary.main` |
| Card surfaces | `background.paper` |
| Dividers | `borderColor: 'divider'` |
| Subtle tints (badge backgrounds, hover overlays) | `varAlpha(theme.vars.palette.X.mainChannel, 0.04–0.12)` |
| `CtaBand` dark surface | `#242424` (approved hardcoded exception, matches `HomeCta`) |
| 404 gradient watermark | tokenized: `primary.main` + canvas tints (orange/purple/teal as approved exceptions per `home-onboarding` step palette precedent) |

Form inputs use the existing `Field.*` wrappers which already handle dark mode — no per-field overrides.

## Test plan / acceptance criteria

- [ ] `/about`, `/contact`, `/security` routes resolve and render full canvas content
- [ ] Marketing catch-all `/some-typo` resolves to the marketing 404 page (NOT to staff/tenant 404)
- [ ] `MarketingHero`, `ContentBand`, `CtaBand` all live in `_components/` with the documented prop / slot interfaces
- [ ] `pricing-hero` and `HomeCta` consume the new primitives — no inline hero / dark-CTA-card markup remains in those files
- [ ] Contact form: client-side validation works (try empty submit, invalid email, short message); valid submit opens user's mail client with subject + body pre-filled with `[topic] name` and `From: name <email>` body
- [ ] Security sub-processors table renders with mobile horizontal-scroll wrap; minWidth:0 flex-item guard prevents page-level overflow
- [ ] 404 page reachable by typing nonsense URL; "Back to home" + popular-destinations links navigate correctly
- [ ] All four pages render correctly in light AND dark mode using only theme tokens (zero `// dark-diff:` comments in Phase 3 code)
- [ ] No console errors / no missing-icon network fetches on any page
- [ ] `just tsc-front` clean
- [ ] `just check-write` clean
- [ ] Manual browser smoke: 4 new pages + verify `/` and `/pricing` haven't regressed (the retroactive refactors are the regression risk)

## Out of scope (acknowledged for follow-up)

- **Real backend `POST /contact` endpoint** — `mailto:` ships now; can upgrade by swapping the form's `onSubmit` handler later. Form component's interface is self-contained.
- **Real team data + photos** — placeholder ships now; replace pre-launch with actual team.
- **Real sub-processors list** — placeholder ships now; needs legal review before public launch.
- **Real trust badges (SOC2 / GDPR / etc.)** — placeholders ship as visual mockups only; replace with verified badges/links when actual certifications exist.
- **404 search functionality** — explicitly dropped per brainstorming. Static link grid only.
- **Marketing 404 sharing the future Phase 6 `<ErrorPage>` primitive** — Phase 3 builds the marketing 404 inline. Phase 6 will refactor it (alongside dashboard 404 + 403 + 500) when that phase lands.
- **Footer expansion to surface About / Contact / Security links** — deferred to the unified-mega-menu effort. New routes are reachable via direct URL and via in-page links from contextually relevant pages (e.g., About → "Get in touch" → /contact).
- **PGP key for security disclosure** — placeholder fingerprint only; real PGP key lives in a separate ops concern.
- **i18n on marketing copy** — out per Phase 1+2 precedent.

## Conventions reused from Phases 1+2

- Canvas → MUI `sx` translation per the retired app's Tailwind-to-`sx` mapping note
- Marketing surface conventions for the retired app:
  - `<Box>` not `<Button>` for marketing CTAs (avoids MUI `--variant-hover-bg` cascade)
  - Hover discipline (only `transform` + `boxShadow` change, never bg/color/border)
  - `grey.X` does NOT dark-swap — use `varAlpha(text.primaryChannel, n)` overlays
  - Iconify icon names must be registered (no `as never` casts)
  - `position: sticky` on the direct flex/scroll child, not nested in a layout wrapper
  - `minWidth: 0` on flex items containing wide tables/code (the `/cookies` overflow trap)
  - MUI sx `width: 1` is `100%`, not `1px` (the visually-hidden trick gotcha — though Phase 3 shouldn't need this trick)
  - Token-only colors (no `grey.X`, no hardcoded brand-color literals outside the approved exceptions)
- Hybrid dark mode (token-driven + `// dark-diff:` overrides only when a dark canvas diverges) — Phase 3 expects ZERO overrides
- `MarketingLayout` already provides `ScrollProgress` + `BackToTopButton` + `HomeFooter` — Phase 3 routes inherit them automatically
- All non-route folders inside `routes/` use a leading underscore prefix (`_components`, `_data`, `_errors`, `_parts`, `_layout`, `_tree`)
- Per-doc TS data modules for static page content (mirrors `_data/pricing.ts` and `_data/legal-*.ts` pattern)
