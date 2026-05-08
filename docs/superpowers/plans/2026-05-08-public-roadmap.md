# Public Roadmap — Implementation Plan

**Date:** 2026-05-08
**Spec:** `docs/superpowers/specs/2026-05-08-public-roadmap-design.md`
**Issue:** #372 (slice 2)

Each task ends with `just check-write && just tsc-front` (both exit 0)
and a commit using the message template in the task body.

## Task 1 — Feature flag, path constant, icons

**Edits:**

- `apps/front/src/lib/features/flags.ts` — add
  `marketing.roadmap: readFlag('VITE_FEATURE_MARKETING_ROADMAP', false)`
- `packages/shared-ts/lib/constants.ts` — add
  `roadmap: makePath('roadmap')` to `FRONT_PATH_NAMES.marketing`
- `apps/front/src/components/iconify/icon-sets.ts` — register two new
  Phosphor icons referenced by the roadmap UI:
  - `ph:caret-up-bold` (vote pill)
  - `ph:archive-tray-fill` (Later column header)

**Commit:**

```
chore(front): add public-roadmap flag, path, and icons

Refs #372

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Task 2 — Roadmap data file

**New file:** `apps/front/src/routes/marketing/_data/roadmap.ts`

Exports:

- `RoadmapStatus` literal union
  (`'in-progress' | 'researching' | 'design' | 'planned' | 'backlog'`)
- `RoadmapColumnId` (`'now' | 'next' | 'later'`)
- `RoadmapItem` type (id, columnId, category, title, description,
  status, voteCount)
- `ShippedItem` type (id, dateIso, title, description)
- `ROADMAP_ITEMS: RoadmapItem[]` — 8 placeholder entries spanning all
  three columns (3 / 3 / 2)
- `RECENTLY_SHIPPED: ShippedItem[]` — 3 placeholder entries
- `getItemsForColumn(columnId)` helper

**Commit:**

```
feat(front): add public-roadmap placeholder data

Refs #372

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Task 3 — New component primitives

**New files in `apps/front/src/routes/marketing/_components/`:**

- `roadmap-stats.tsx` — `RoadmapStats({ shipped, inProgress, votes })`,
  three inline pills under the hero. Animated entry via `varFade('inUp',
  { distance: 24 })`.
- `roadmap-card.tsx` — `RoadmapCard({ item })`. Category pill (neutral),
  title, description, footer with vote pill (`ph:caret-up-bold` +
  count, static) and status pill (semantic color via `statusToken`
  helper). Wraps in `m.div` with `hoverLift({ y: -4, scale: 1.01 })`.
- `roadmap-column.tsx` — `RoadmapColumn({ id, label, icon, tone,
  children })`. Sticky-style header pill (tone = emerald / amber /
  neutral), stacked children, optional reduced opacity for `tone === 'neutral'`.
- `roadmap-shipped-timeline.tsx` —
  `RoadmapShippedTimeline({ items })`. Alternating left/right entries
  on `md+`, single column on `xs/sm`. Central dashed vertical line +
  node dots + per-entry card + date pill on the spacer side. First
  entry's node uses `primary.main`; subsequent nodes are
  `text.disabled` and shift to `primary.main` on hover via group
  selectors.

All four primitives follow project conventions: arrow function
components, MUI v6 only, sx prop styling, palette tokens, registered
Iconify names.

**Commit:**

```
feat(front): add public-roadmap component primitives

Refs #372

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Task 4 — Roadmap page

**New file:**
`apps/front/src/routes/marketing/roadmap/roadmap-page.tsx`

Composes the page in section order:

1. `MarketingHero` — eyebrow, title, subhead.
2. `RoadmapStats` — counts derived from `ROADMAP_ITEMS` +
   `RECENTLY_SHIPPED` length + a fixed placeholder vote total.
3. **Kanban board section** — three `RoadmapColumn`s, each populated
   by `getItemsForColumn(columnId)` mapped to `RoadmapCard`. Wrapped in
   `MotionViewport` with section-level `varFade('inUp')`.
4. **Recently shipped section** — heading + (changelog flag-gated)
   "View full changelog" link to `FRONT_PATH_NAMES.marketing.changelog`,
   then `RoadmapShippedTimeline`.
5. **Help-shape band** — `ContentBand` with two side-by-side cards
   (Suggest a feature, Get roadmap updates), each CTA → `/contact` if
   `FEATURES.marketing.contact`, else falls back to a static text
   block.
6. `CtaBand` — final dark CTA, primary CTA → signup.

Default export `RoadmapPage`. Per-page `meta` export with title +
description + og tags (plain pattern, no `buildSeoMeta` in this branch).

**Commit:**

```
feat(front): add public roadmap page

Refs #372

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Task 5 — Register route

**Edit:** `apps/front/src/routes/_tree/marketing.routes.ts` — add
flag-guarded `route('roadmap', 'routes/marketing/roadmap/roadmap-page.tsx')`
inside the marketing layout, immediately before the catch-all `*` route.

**Commit:**

```
feat(front): register public-roadmap route under marketing layout

Refs #372

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Task 6 — Final verification + open PR

- Final `just check-write && just tsc-front` (both exit 0).
- `git push -u origin feature/public-roadmap`.
- Open PR via `gh pr create` with title
  `feat(front): public roadmap` and a body containing Summary, Closes
  link to issue #372, and a manual smoke checklist for the user.

No commit for this task.
