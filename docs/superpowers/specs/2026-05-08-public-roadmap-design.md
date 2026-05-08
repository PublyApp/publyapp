# Public Roadmap — Design Spec

**Date:** 2026-05-08
**Issue:** #372 (AIDesigner batch — slice 2: public roadmap)
**Canvas ID:** `b731aa9e-eecd-4ce5-864e-144c4644aa7c`
**Slug:** `public-roadmap`
**Route:** `/roadmap`
**Branch:** `feature/public-roadmap`

## Goal

Ship a marketing-surface "Public Roadmap" page that communicates what
PublyApp is building, what is shipping next, and what was recently delivered
— without standing up a real backend (no submitted suggestions, no voting,
no email subscriptions). Translate the AIDesigner canvas (Tailwind/HTML)
into MUI-only React using project conventions.

## Locked scope decisions

- **Custom roadmap.** Not Canny / ProductBoard. The canvas is the design.
- **Placeholder roadmap items.** 8 typed `RoadmapItem` records spanning
  Now / Next / Later columns. Replace pre-launch with real data.
- **Subscribe-to-updates / Suggest-a-feature CTAs link to `/contact`.**
  No real backend endpoints, no email collection. Out of scope.
- **No vote interaction.** Vote pill is a static visual indicator
  (count + caret-up icon), not an interactive button. Removes the
  "voted" state contradictions in the canvas.
- **Default flag OFF.** `marketing.roadmap` reads
  `VITE_FEATURE_MARKETING_ROADMAP` (default `false`). Route is registered
  only when the flag is on.

## File map

```
apps/front/src/routes/marketing/
├── _components/
│   ├── roadmap-card.tsx           ← NEW — single roadmap item card
│   ├── roadmap-column.tsx         ← NEW — sticky-header column wrapper
│   ├── roadmap-stats.tsx          ← NEW — three-stat strip (shipped/in-progress/votes)
│   └── roadmap-shipped-timeline.tsx ← NEW — alternating vertical timeline
├── _data/
│   └── roadmap.ts                 ← NEW — typed RoadmapItem + ShippedItem records
└── roadmap/
    └── roadmap-page.tsx           ← NEW — page composition

apps/front/src/components/iconify/icon-sets.ts ← MOD — add caret-up + archive-tray
apps/front/src/lib/features/flags.ts            ← MOD — add marketing.roadmap
apps/front/src/routes/_tree/marketing.routes.ts ← MOD — flag-guarded route
packages/shared-ts/lib/constants.ts             ← MOD — FRONT_PATH_NAMES.marketing.roadmap
```

## Per-section breakdown (canvas → MUI translation)

The canvas has 6 visible sections plus footer/nav (handled by
`MarketingLayout`).

### 1. Hero

`MarketingHero` (existing primitive).

- Eyebrow: "Public roadmap · Updated weekly", icon `ph:rocket-launch-fill`
- Title: "What we're building next"
- Subhead: open-development positioning copy
- No CTA buttons — the canvas's "Suggest a feature" anchor scrolls to the
  bottom suggestion section, but to honor the locked scope decision the
  hero CTA is deferred to a `CtaBand` at the bottom.

### 2. Stats strip

New `RoadmapStats` primitive — three labeled metric pills (shipped,
in-progress, community votes) under the hero. Mirrors
`ChangelogStats` shape but uses small inline pills (per canvas), not the
3-card divider layout.

### 3. Kanban board (Now / Next / Later)

3-column responsive grid (`xs:1col / md:2col / lg:3col`).
Each column = `RoadmapColumn` (sticky header pill + stacked
`RoadmapCard`s). Each card shows:

- Category pill (top-left)
- Title (heading 3)
- Description (body)
- Footer: vote count pill (left, static) + status pill (right)

Categories use neutral `background.neutral` per project rule (no bright
semantic backgrounds for fallbacks). The canvas painted some categories
purple/blue/rose — we collapse all category pills to the neutral
treatment, but **status pills** keep semantic color (in-progress amber,
researching neutral, planned neutral, backlog neutral) since status is
load-bearing.

### 4. Recently shipped timeline

Vertical alternating timeline (3 entries). New
`RoadmapShippedTimeline` primitive. Each entry: date pill, card with
title + body. Above the timeline: section heading + "View full
changelog" link to `/changelog` (existing route). Hidden if changelog
flag is off (render heading only).

### 5. Suggestion + Subscribe band

The canvas has an interactive form panel with success state, plus a
secondary email subscribe band. Per locked scope, **no forms**:

Replace with one **`ContentBand`** containing:

- Heading: "Help shape PublyApp"
- Subhead: "Have an idea? Want roadmap updates? We read every message."
- Two side-by-side cards: "Suggest a feature" and "Get roadmap updates",
  each with a single CTA button → `/contact` (gated by
  `FEATURES.marketing.contact`; if off, the cards link to `mailto:` —
  hardcoded to nothing since no contact email is in scope, fall back to
  rendering plain text).

This preserves the canvas's "two intents" structure while honoring the
no-backend constraint.

### 6. Bottom dark CTA

Existing `CtaBand` primitive — eyebrow "Build with us", title and CTA
text adapted to roadmap voice, primary CTA → `auth.signup`.

## New primitives needed

| Primitive | Purpose |
|---|---|
| `RoadmapStats` | 3-pill stats strip under hero |
| `RoadmapColumn` | Kanban column shell — sticky header + stacked cards + subdued opacity for "Later" tone variant |
| `RoadmapCard` | Single roadmap item — category, title, body, vote pill, status pill |
| `RoadmapShippedTimeline` | Alternating vertical timeline of recently-shipped items |

All four live in `apps/front/src/routes/marketing/_components/`.

## Iconography additions

Required new entries in `apps/front/src/components/iconify/icon-sets.ts`:

- `ph:caret-up-bold` — vote pill
- `ph:archive-tray-fill` — "Later" column header

All other icons are already registered (`ph:rocket-launch-fill`,
`ph:trend-up-fill`, `ph:check-circle-fill`, `ph:calendar-blank-fill`,
`ph:envelope-bold`, `ph:lightning-fill`).

## Animation

- Section-level entry: `varFade('inUp', { distance: 24 })` via
  `MotionViewport` for: stats, kanban board, timeline, suggestion band.
- Card hover: `hoverLift({ y: -4, scale: 1.01 })` (subtle — there are
  many cards on screen; aggressive lift would be visually noisy).
- No custom one-off animations; all reuse existing presets.

## Theming / colors

- Light + dark mode parity using palette tokens
  (`background.paper`, `background.neutral`, `text.primary`,
  `text.secondary`, `divider`, `primary.main`, `primary.lighter`,
  `warning.lighter`/`warning.dark` for amber status).
- No hardcoded hex colors except where `CtaBand` already uses them
  (the existing dark `#242424` band is a sanctioned exception).
- Status pill color mapping documented inline via a `statusToken` helper
  in `roadmap-card.tsx`.

## Out of scope (defer / tracked for later)

- Real submitted feature requests / voting backend
- Subscribe-to-updates email endpoint
- Suggest-a-feature submission form
- Status-change notifications
- Deep links (#anchors) to individual roadmap items
- "Recently shipped" pulling from the changelog data file (kept as
  separate placeholder data so the timeline can be re-styled
  independently)
- Per-quarter dynamic grouping or filtering UI

## Acceptance criteria

1. `VITE_FEATURE_MARKETING_ROADMAP=true` → `/roadmap` renders the page.
2. Flag OFF (default) → `/roadmap` falls through to
   `MarketingNotFoundPage`.
3. `FRONT_PATH_NAMES.marketing.roadmap === '/roadmap'`.
4. `just check-write && just tsc-front` both exit 0.
5. Page is responsive (xs / md / lg breakpoints) and renders cleanly in
   light + dark mode.
6. No raw HTML elements (`<div>`, `<h1>`, etc.) — MUI components only.
7. No Tailwind classes; all styling via `sx` prop.
8. No `function` keyword for components — arrow functions only.
9. All icons reference registered `IconifyName` symbols.
10. Page-level `meta` export present (plain pattern — title +
    description + og tags).
