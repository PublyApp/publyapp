Status: Historical — not normative
Original location: docs/superpowers/specs/2026-05-02-marketing-legal-design.md
Archive reason: Completed design retained only for architectural decision history.
Superseded by: apps/front is retired; apps/front-2 and docs/guides/front-2/conventions.md are current.

# Phase 2 — Marketing legal trio (`/terms`, `/privacy`, `/cookies`)

**Status:** Design approved (2026-05-02)
**Phase:** 2 of 6 of the marketing supporting-pages effort
**Parent spec:** `docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md`
**Predecessor (shipped):** `docs/superpowers/specs/2026-05-01-marketing-pricing-design.md` (Phase 1)

## Summary

Ship three marketing routes — `/terms`, `/privacy`, `/cookies` — rendered through one shared **slot-based** `LegalDocPage` primitive. Body copy is canvas-derived placeholder; real lawyer-vetted text is a separate content PR before public launch. Pages get a sticky right-side TOC sidebar with active-section highlighting on desktop; long-scroll-to-find on mobile.

## Inputs locked from brainstorming

| Decision | Choice | Rationale |
| --- | --- | --- |
| Authoring format | TS module per doc + JSX body in page | Phase 1 consistency; no MDX tooling debt to maintain for 3 docs |
| Body copy | Canvas-derived placeholder | Real legal copy is a separate content concern with its own review loop (lawyer + founder) |
| TOC depth | h2-only (flat) | Shape stays clean; data shape supports `subsections?` non-breakingly if a future doc needs h3s |
| TOC active highlighting | In scope (IntersectionObserver) | Small lift; turns static TOC from "looks dead" to "feels live" on long-scroll docs |
| URL shape | Flat: `/terms`, `/privacy`, `/cookies` | Matches parent spec footer plan; no analytics-grouping concern at 3 pages |
| Primitive shape | Slot-based shell | Body content lives as JSX in each page; primitive owns layout + TOC + last-updated band |
| Per-doc data module | Keep `_data/legal-{terms,privacy,cookies}.ts` for metadata only (`eyebrow`, `title`, `lastUpdated`, `toc`, `SECTION_IDS`) | Mirrors `_data/pricing.ts` precedent; metadata stays greppable in one place |
| Anchor IDs | Centralized `SECTION_IDS` const per doc, imported by page for both `id={…}` and `toc[].id` | Single source of truth eliminates link/target drift |
| `lastUpdated` source | Hard-coded ISO string in data module | Intentional — immune to typo-fix commits flipping the date |
| i18n | Out (English only) | Phase 1 precedent |

## Inputs from canvases

Three light-mode canvases drive visual translation. No dark canvases exist for legal pages — per the parent spec's mid-execution pivot, dark mode is derived in code via `theme.applyStyles` because legal pages are "typography on background" where token swaps suffice.

| Page | Mode | Canvas ID |
| --- | --- | --- |
| Terms of Use | light | `4a0e2717-f7d6-4041-8ad4-b4ed18e6f16f` |
| Privacy Policy | light | `09f5881d-7fec-49db-9b4b-77eba2c61de4` |
| Cookie Policy | light | `d9e26780-40d7-4d60-88c4-f6abf50aaafb` |

Brand kit: `31329e88-32ed-4dc2-9130-c5f5018e1c67` (locked in Phase 1).

## File layout

```
apps/front/src/
├── hooks/
│   └── use-active-toc-section.ts        ← NEW (generic; usable by future blog/docs TOCs)
└── routes/marketing/
    ├── _components/
    │   └── legal-doc-page.tsx           ← NEW (slot-based primitive)
    ├── _data/
    │   ├── pricing.ts                   (existing)
    │   ├── legal-terms.ts               ← NEW
    │   ├── legal-privacy.ts             ← NEW
    │   └── legal-cookies.ts             ← NEW
    ├── terms/
    │   └── terms-page.tsx               ← NEW
    ├── privacy/
    │   └── privacy-page.tsx             ← NEW
    └── cookies/
        └── cookies-page.tsx             ← NEW
```

No `parts/` subfolder per legal page — body IS the content; splitting prose into parts adds files without value.

## `LegalDocPage` primitive

```tsx
type TocItem = { id: string; label: string };

type LegalDocPageProps = {
  eyebrow: string;
  title: string;
  lastUpdated: string; // ISO date string
  toc: TocItem[];
  children: ReactNode;
};
```

**Owned by the primitive:**
- Hero band: eyebrow text, h1 title, formatted "Last updated {date}" line — date formatted via `format-time.ts` utilities (per frontend coding standards) into long form, e.g. `'2026-05-02'` → `'May 2, 2026'`
- 2-column desktop layout: `lg:flex-row-reverse` — TOC right (~240px), content left (~720px reading column)
- Sticky TOC sidebar anchored to `var(--layout-header-desktop-height)` (mirrors `/pricing`'s comparison header pattern from Phase 1)
- TOC link rendering with active-state styling (primary color + bold + left accent border)
- Active-section observer wiring (calls `useActiveTocSection({ ids: toc.map(t => t.id) })`)
- `scrollMarginTop` on h2[id] children so anchor scroll lands below the sticky topbar with a 16px buffer

**Owned by each page:**
- All h2/h3/p/list JSX inside `<LegalDocPage>` children
- `id={SECTION_IDS.x}` on each h2
- Any one-off blocks (cookies inventory table, "Open cookie preferences" callout) as inline `<Box>` JSX

**Mobile:** TOC sidebar hides below `lg` (`display: { xs: 'none', lg: 'block' }`); reading column goes full-width. No mobile TOC sheet/drawer in Phase 2.

## `useActiveTocSection` hook

New file: `apps/front/src/hooks/use-active-toc-section.ts`. Generic enough to also serve future blog article and docs TOCs — placed in `hooks/` (not in `routes/marketing/_components/`) for that reason.

```tsx
type Options = {
  ids: string[];
  rootMargin?: string;
};

export const useActiveTocSection = ({
  ids,
  rootMargin = '-20% 0px -70% 0px',
}: Options): string | null => {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (ids.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin, threshold: 0 },
    );

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [ids, rootMargin]);

  return activeId;
};
```

**`rootMargin: '-20% 0px -70% 0px'`** defines the active band as the top 30% of the viewport — section becomes "active" when its h2 enters that band. Tunable per consumer; legal pages use the default.

**SSR safety:** the `typeof window === 'undefined'` guard prevents the hook from touching DOM during server render.

## Per-doc data module shape

```tsx
// _data/legal-terms.ts
export const TERMS_LAST_UPDATED = '2026-05-02'; // ISO date

export const TERMS_SECTION_IDS = {
  acceptance: 'acceptance-of-terms',
  accountRegistration: 'account-registration',
  // ... one entry per h2 in document order
} as const;

export const TERMS_TOC: TocItem[] = [
  { id: TERMS_SECTION_IDS.acceptance, label: 'Acceptance of Terms' },
  { id: TERMS_SECTION_IDS.accountRegistration, label: 'Account Registration' },
  // ... mirrors h2s in order
];
```

Same shape for `legal-privacy.ts` (`PRIVACY_*` prefix) and `legal-cookies.ts` (`COOKIES_*` prefix).

`TocItem` is exported from `legal-doc-page.tsx` (the primitive) and re-imported by data modules for typing.

## Routing + constants

**`packages/shared-ts/lib/constants.ts`** — extend the existing `marketing` namespace:

```tsx
marketing: {
  pricing: makePath('pricing'),
  terms: makePath('terms'),         // NEW
  privacy: makePath('privacy'),     // NEW
  cookies: makePath('cookies'),     // NEW
},
```

**`apps/front/src/routes/_tree/marketing.routes.ts`** — add three routes inside the existing `MarketingLayout` block (so legal pages inherit `ScrollProgress` + `BackToTopButton` + `HomeFooter`). Match the existing `route('pricing', …)` registration style with plain string paths:

```tsx
layout('routes/marketing/_layout/marketing-layout.tsx', [
  index('routes/marketing/home/home-page.tsx'),
  route('pricing', 'routes/marketing/pricing/pricing-page.tsx'),
  route('terms',   'routes/marketing/terms/terms-page.tsx'),     // NEW
  route('privacy', 'routes/marketing/privacy/privacy-page.tsx'), // NEW
  route('cookies', 'routes/marketing/cookies/cookies-page.tsx'), // NEW
]),
```

## Page composition pattern

```tsx
// terms/terms-page.tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { LegalDocPage } from '#app/routes/marketing/_components/legal-doc-page.tsx';
import {
  TERMS_LAST_UPDATED,
  TERMS_SECTION_IDS,
  TERMS_TOC,
} from '#app/routes/marketing/_data/legal-terms.ts';

const TermsPage = () => {
  return (
    <LegalDocPage
      eyebrow="Legal"
      title="Terms of Use"
      lastUpdated={TERMS_LAST_UPDATED}
      toc={TERMS_TOC}
    >
      <Box component="section">
        <Typography variant="h2" id={TERMS_SECTION_IDS.acceptance}>
          Acceptance of Terms
        </Typography>
        <Typography variant="body1" sx={{ mt: 2 }}>
          {/* canvas-derived placeholder prose */}
        </Typography>
      </Box>

      {/* ... one section per h2, in document order ... */}
    </LegalDocPage>
  );
};

export default TermsPage;
```

Cookies' inventory table and "Open cookie preferences" callout are inline `<Box>` JSX inside the cookies page — they don't belong in the primitive (they're a one-page concern).

## Dark mode

Pure token-driven. No `// dark-diff:` overrides expected anywhere in legal page code. Concretely:

| Surface | Token |
| --- | --- |
| Page background | `bgcolor: 'background.default'` |
| Body text | `color: 'text.primary'` |
| Inactive TOC link | `color: 'text.secondary'` |
| Active TOC link / accent border | `color: 'primary.main'` / `borderColor: 'primary.main'` |
| Dividers / hairlines | `borderColor: 'divider'` |
| Cookies callout tint | `bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.06)` |
| Inventory table row stripe (if any) | `bgcolor: varAlpha(theme.vars.palette.text.primaryChannel, 0.03)` |

If a `// dark-diff:` comment appears in legal page code during review, treat it as a smell — either the wrong token was picked or the design genuinely needs a dark canvas decision (which would be an out-of-scope escalation).

## Test plan / acceptance criteria

- [ ] `/terms`, `/privacy`, `/cookies` routes resolve and render: hero band → TOC sidebar (desktop) → body → last-updated text
- [ ] TOC sticks to viewport under the topbar at desktop ≥ `lg`; hides at `xs`/`md`
- [ ] Clicking a TOC link scrolls the matching h2 to just below the sticky topbar (no occlusion)
- [ ] Active TOC item updates as the user scrolls; transitions are smooth (no flicker)
- [ ] All three pages render correctly in both light and dark mode using only token-driven styles (zero `// dark-diff:` comments)
- [ ] Cookies page renders the inventory table + "Open cookie preferences" callout inline in the page body (not in the primitive)
- [ ] Page imports `SECTION_IDS` from its data module — zero string-literal IDs in JSX
- [ ] No console errors / no missing-icon network fetches on any page
- [ ] `just tsc-front` clean
- [ ] `just check-write` clean
- [ ] Manual browser smoke per page on the dev server (light + dark)

## Out of scope (acknowledged for follow-up)

- **Real lawyer-vetted legal copy** — placeholder ships now; content PR follows before public launch
- **Cookie consent banner** — designed during Cookie Policy *production rollout*, not Phase 2 design wiring
- **Mobile TOC sheet/drawer** — defer; long-scroll-to-find is the Phase 2 mobile pattern. Add if user feedback wants it.
- **h3 sub-anchors in TOC** — `TocItem` shape supports `subsections?: TocItem[]` non-breakingly; add when a doc actually needs it
- **CSS smooth-scroll** — relying on browser default; global `scroll-behavior: smooth` is not a Phase 2 concern
- **Hash-on-mount active-state initialization** — observer picks it up after first paint; explicit handling only if review surfaces flicker
- **Layout chrome** (mega-menu nav, expanded footer) — same Phase 1 deferral; the eventual footer expansion will surface Terms / Privacy / Cookies links
- **Marketing primitive extraction (`MarketingHero`, `ContentBand`, `CtaBand`)** — Phase 2 only extracts `LegalDocPage` because it has 3 immediate consumers. Other primitives extract on-second-consumer per Phase 1 conventions.

## Conventions reused from Phase 1

- Canvas → MUI `sx` translation per `docs/guides/tailwind-to-sx-mapping.md`
- Marketing surface conventions per `docs/guides/marketing-surface-conventions.md` (hover convention, no perpetual animation, `<Box>` not `<Button>` for slot-style links if any appear in callouts)
- Hybrid dark mode (token-driven default + `// dark-diff:` overrides where a dark canvas diverges) — though for legal pages we expect zero overrides
- `MarketingLayout` already provides `ScrollProgress` + `BackToTopButton` + `HomeFooter` — Phase 2 routes inherit them automatically
