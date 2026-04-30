# Marketing Supporting Pages — Design Spec

**Date:** 2026-04-30
**Status:** Draft, pending user review
**Predecessor:** `docs/guides/marketing-surface-conventions.md` (boundary doc, ratified 2026-04-30)
**Branch:** `feature/marketing-supporting-pages`

## Goal

The marketing homepage exists in production. This spec defines the next 11 supporting pages needed for a complete SaaS marketing presence — legal, content, conversion, company, and utility surfaces — and the AIDesigner workflow to design them with brand consistency.

The spec covers design only. A follow-up implementation plan (per the brainstorming workflow) will translate the AIDesigner canvases into MUI v6 React components under `apps/front/src/routes/marketing/`.

## Non-goals

- **Docs site.** Docs need their own layout (persistent left nav, denser typography, long-form vertical scroll, monospace code, anchor-heavy headings) and will get a separate `DocsLayout` + spec. Out of scope here.
- **Cookie consent banner.** Functional component, not a marketing page. Will be designed alongside the Cookie Policy page when implementation begins.
- **Status page.** Conventionally a separate subdomain (`status.publyapp.com`) running off Atlassian Statuspage / Better Stack / similar. Not designed in-house.
- **Careers / press / media kit.** Defer until business need exists.

## Page list (11 pages)

### Legal (3)

1. **Terms of Use** — long-form text, single column, anchored TOC sidebar (desktop), last-updated date band
2. **Privacy Policy** — same template as Terms; data collection, retention, third-party processors
3. **Cookie Policy** — same template; cookies set, purposes, opt-out instructions

### Content surfaces (3)

4. **Blog index** — featured-post hero, category filters, card grid (cover image, title, excerpt, tag, date, author byline)
5. **Blog article template** — narrow reading column (~720px), hero image, author byline + reading time, body with rich blocks (h2/h3, code, quotes, callouts, images), share rail, related posts footer
6. **Changelog** — chronological vertical timeline, version anchors (`#v1.4.2`), tag pills (Feature / Fix / Breaking)

### Conversion / company (4)

7. **Dedicated Pricing page** — expanded vs the homepage strip: 3-tier comparison hero, full feature matrix, pricing-specific FAQ, "talk to sales" enterprise band
8. **About** — mission band, story narrative, team grid (placeholder portraits), values cards
9. **Contact** — split layout: form (name / email / topic / message) on one side; support tiers, email, response-time expectations on the other
10. **Security / Trust** — pillars (encryption-in-transit, data residency, SOC 2 messaging), sub-processors list, vulnerability reporting contact

### Utility (1)

11. **404 / Not Found** — branded error page, search box, links to popular destinations

## Brand consistency strategy

### Identical across every marketing page (no exceptions)

- **Topbar** — same transparent-on-scroll behavior. Nav contents change context: home uses anchor links (`#features`, `#pricing`, `#onboarding`, `#faqs`); non-home pages use route links (Product / Pricing / Blog / Changelog / Docs / Login / Sign up)
- **Footer** — single component, expanded link columns:
  - **Product** — Features, Pricing, Changelog
  - **Resources** — Blog, Docs, Status
  - **Company** — About, Contact, Careers (placeholder)
  - **Legal** — Terms, Privacy, Cookies, Security
- **Palette + typography** — theme tokens via `text.*`, `background.*`, `primary.*`, `divider`. Font family + scale identical to product
- **Primary CTA color** — `primary.main` everywhere
- **Dark mode mechanism** — `theme.applyStyles('dark', …)` + `varAlpha(theme.vars.palette.X.mainChannel, n)`
- **Hover convention** — stable bg/text/border, only `transform` + `boxShadow` change (per `docs/guides/marketing-surface-conventions.md`)

### Allowed page-specific divergence

- **Hero treatment** — every page gets a hero, but each is allowed its own variation (home: product mockup + radial glow; legal: tight title-only band; blog index: featured article hero; changelog: stat band; about: mission statement)
- **Section radii** — landing-page-style 24–40px for marketing/conversion pages (Pricing, About, Contact, Security, Blog index, 404); tighter ≤ 16px for content pages (Blog article, Legal, Changelog) where reading takes priority over visual flourish

### Reusable layout primitives (5)

These will be implemented as React components during the follow-up implementation phase. Designs in AIDesigner should converge on these shapes so the code stays small.

1. **`MarketingShell`** — topbar + outlet + footer (already exists as `MainLayout`; will add the route-link nav variant for non-home pages)
2. **`MarketingHero`** — eyebrow + h1 + subhead + (optional) CTA pair. Reused on About, Contact, Security, Pricing, Blog index, Changelog, 404
3. **`LegalDocPage`** — single template for Terms / Privacy / Cookies: narrow column, sticky TOC sidebar on desktop, last-updated band, h2/h3 anchors. The 3 legal pages feed body content into this one template
4. **`ContentBand`** — section wrapper with eyebrow + title + optional subhead + content slot. Used on About (mission/values/team), Security (pillars), Contact (form-side / info-side split)
5. **`CtaBand`** — the bottom "Start for Free" dark card already on the homepage. Reused as a tail section on Pricing, About, Security, Blog index, Changelog. Legal pages and 404 skip it.

### Brand voice anchors

- **Tone** — confident, ops-flavored ("organize the chaos", "publish on autopilot")
- **Audience** — SaaS social media managers, small-to-mid brands
- **Stat shape** — real numbers ("10,000+ brands", "+1,204 followers/week"), no vague superlatives

## AIDesigner workflow

### Approach: deploy preview → URL-extracted brand kit → prompt-driven pages

1. **Stand up a public preview URL** of the current homepage (Dokploy preview branch, Vercel preview, or ngrok tunnel pointing at `localhost:5050`). Required because AIDesigner cannot reach localhost.
2. **`create_brand_kit_from_url`** on the preview URL → AIDesigner extracts logo, palette, type, and vibe directly from the rendered live homepage.
3. **Save the brand kit**, capture its `brand_kit_id`. This is the single source of truth for all 11 pages.
4. **Reproduce the homepage in AIDesigner** as a light-mode anchor canvas via `generate_design` (`mode: 'inspire'` + provided screenshots from `C:\Users\radan\Downloads\screencapture-localhost-5050-2026-04-30-16_13_45.png` and `C:\Users\radan\Downloads\screencapture-localhost-5050-2026-04-30-16_13_25.png`), passing `brand_kit_id`. Light-only — the production homepage already ships with both modes handled in code, so AIDesigner only needs the light reproduction as a reference for visual diff against new pages.
5. **Generate the 10 supporting pages** with `generate_design`, each as its own canvas, all passing the same `brand_kit_id`.
6. **Refine** each canvas with `refine_design` until adopted.

### Generation order

Designed for template reuse and feedback velocity:

1. **Pricing page** — closest sibling to homepage; validates the brand kit before committing to 10 pages
2. **Legal template** — generate Terms first; derive Privacy + Cookies by swapping content (one template, three documents)
3. **Blog index → Blog article** — paired so article hero matches index card style
4. **Changelog** — own template, distinct timeline pattern
5. **About → Contact → Security** — three "company" pages, sequential
6. **404** — quick utility page, last

### Light/dark mode strategy (hybrid by visual weight)

| Pages that get both modes in AIDesigner | Pages that get light only — dark in code |
|---|---|
| Pricing | Terms |
| Blog index | Privacy |
| | Cookies |
| | Blog article |
| | Changelog |
| | About |
| | Contact |
| | Security |
| | 404 |

**Mid-execution pivot (2026-04-30):** After generating dark variants for Pricing and Blog index, the user determined the AIDesigner dark outputs add insufficient design value vs the credit cost — color-only flips don't surface meaningful design decisions that the existing `theme.applyStyles('dark', …)` infrastructure can't already handle in code. The remaining originally-dual-mode pages (About, Contact, Security, 404) are downgraded to light-only in AIDesigner; their dark variants get derived in code during adoption per the same hybrid strategy that already governs the legal/blog-article/changelog set.

**Rationale:** the left column has heroes, cards, gradients, and intentional always-dark surfaces (the `#242424` pattern from the homepage) — dark mode there is a *design* decision worth visual review. The right column is mostly typography on background — dark mode there is a *token swap* the existing infrastructure handles well.

The homepage itself sits outside this table — it already ships in production with both modes in code, and only needs a single light-mode anchor canvas in AIDesigner (step 4 of the workflow above).

**Total AIDesigner canvases:** **18** = 1 homepage anchor (light) + 6 dual-mode pages × 2 modes (12) + 5 light-only pages (5).

### Fallback if Approach A is blocked

If standing up a public preview URL takes >30 minutes, fall back to:

1. Reproduce homepage in canvas via `generate_design` (`mode: 'inspire'` + screenshots)
2. Run `generate_branding_kit_variations` with a description rich enough to capture the brand: "modern SaaS, deep green primary, dark monochrome accents, expressive radii 24–40px, subtle radial glows, framer-motion-style micro-interactions"
3. User picks a tile from the 3×3 board; `create_brand_kit_from_variation` to lock it
4. Continue from step 5 of the main workflow

## Acceptance criteria

- [ ] All 11 pages have at least one AIDesigner canvas in the saved brand kit's project
- [ ] All 6 dual-mode pages have both light and dark canvases
- [ ] Brand kit derived from preview URL (Approach A) or from variation board (fallback) is saved and referenced by every page's canvas
- [ ] Each page's design uses the 5 reusable layout primitives where applicable (verify by review of the AIDesigner output: any page that diverges has a documented reason)
- [ ] Spec updated with the actual `brand_kit_id` and per-page canvas IDs once generation completes
- [ ] User signs off on each canvas before any code adoption begins (code adoption is a separate spec)

## Open questions

- **Preview URL choice** (Dokploy preview branch vs Vercel vs ngrok) — implementation plan will pick one based on what's fastest to set up at execution time
- **Blog content seed** — the Blog index and Blog article designs need placeholder content (titles, excerpts, author names). Spec assumes lorem-ipsum-shaped placeholders that the implementation phase replaces with real seed content
- **Team photos for About** — placeholder portraits in AIDesigner; real photos sourced separately

## Out of scope (acknowledged for future specs)

- **Docs site** — separate `DocsLayout`, separate spec
- **Cookie consent banner** — designed during Cookie Policy implementation
- **Status page** — external service
- **Careers / press / media kit** — defer until business need
- **Code adoption of the AIDesigner canvases** — separate implementation spec follows

---

## Canvas IDs and brand kit

**Brand kit ID:** `31329e88-32ed-4dc2-9130-c5f5018e1c67`
**Name:** PublyApp Marketing v3 (light)
**Source:** `https://ant-noted-briefly.ngrok-free.app` (ngrok paid tunnel → `localhost:5050`)
**Locked on:** 2026-04-30

**Brand kit summary**:
- Mood: *Clean, professional, and growth-oriented*
- Swatches: `#10B981` (primary green), `#1F2937` (text/headings), `#FCFCFD` (background)
- Typography: Inter / system sans-serif
- Descriptors: Vibrant Green Accent, Modern Sans-Serif, High Contrast

**Notes on extraction**:
- Required temporarily switching the app's `defaultMode` from `'dark'` to `'light'` (commit `e1b34799`) so AIDesigner's headless browser captured the light-mode rendering
- Required ngrok paid tier to bypass the free-tier browser warning interstitial (which AIDesigner's Firecrawl fetcher would otherwise extract instead of the homepage)
- Two earlier brand kits are saved but unused: `d10b9272-...` (interstitial-extracted) and `373bd82a-...` (dark-themed, before light-mode default was set)

### Canvases

| Page | Mode | Canvas ID | Accepted on |
| --- | --- | --- | --- |
| Homepage anchor | light | `2e8a4817-4386-4d7b-8bf2-39b5d5bac514` | 2026-04-30 |
| Pricing | light | `35a6d196-5354-45b9-943c-4417adf150c9` | 2026-04-30 |
| Pricing | dark | `6c3e35f3-c07f-4ec8-917d-95c78b07597e` | 2026-04-30 |
| Terms of Use | light | `4a0e2717-f7d6-4041-8ad4-b4ed18e6f16f` | 2026-04-30 |
| Privacy Policy | light | `09f5881d-7fec-49db-9b4b-77eba2c61de4` | 2026-04-30 |
| Cookie Policy | light | `d9e26780-40d7-4d60-88c4-f6abf50aaafb` | 2026-04-30 |
| Blog index | light | `42ba72a3-52de-4c9d-adf9-7e0f74953f69` | 2026-04-30 |
| Blog index | dark | `7dc01154-66db-49fd-85ab-fd839ec89a3c` | 2026-04-30 |
| Blog article | light | `a9b20a6e-02a5-4124-bd13-79e539201e3f` | 2026-04-30 |
| Changelog | light | `f0f2cb18-b79f-41b7-935a-da9100190f1e` | 2026-04-30 |
