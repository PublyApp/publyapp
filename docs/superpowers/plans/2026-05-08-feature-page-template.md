# Feature Page Template — Implementation Plan

> **Spec:** [`docs/superpowers/specs/2026-05-08-feature-page-template-design.md`](../specs/2026-05-08-feature-page-template-design.md)
> **Issue:** #372 (slice 3 — feature page template)
> **Branch:** `feature/feature-page-template`

## Per-task gates

After every task: `just check-write && just tsc-front` (both 0). Commit per
task with a descriptive subject + the `Co-Authored-By: Claude Opus 4.7
(1M context) <noreply@anthropic.com>` trailer.

## Task list

### Task 1 — Add feature flag + path helper

- `apps/front/src/lib/features/flags.ts` → add
  `featurePages: readFlag('VITE_FEATURE_MARKETING_FEATURE_PAGES', false)`
  inside the `marketing` block.
- `packages/shared-ts/lib/constants.ts` → add
  `featurePage: (slug: string) => makePath('features', slug)` to
  `marketing` (a function helper, not a static path).

**Commit:** `feat(front): add feature page flag + path helper`

### Task 2 — Build the `Feature` data file

- New file: `apps/front/src/routes/marketing/_data/features.ts`.
- Define `Feature*` types per the spec.
- Populate one record (`scheduling`) using verbatim canvas copy:
  - hero: "Schedule once. Publish everywhere." + canvas subhead
  - 3 steps: Compose once / Pick networks & time / Publish on autopilot
  - 6 benefits: multi-network, AI best-time, bulk CSV, approvals, visual
    calendar, smart timezones (use existing registered `ph:*` icons)
  - screenshot: `unsplashCover` slug for the canvas mockup placeholder
  - 3-up comparison: vs Spreadsheets / Native Tools / Legacy Tools
  - quote: Sarah Jenkins, Verve Media (canvas verbatim)
  - bottom CTA: "Stop juggling tabs. Start scheduling." → signup
- Export `getFeature(slug)` lookup helper.
- Map canvas icons → registered phosphor icons (from `register-icons.ts`):
  - share-network → `ph:link-bold`
  - lightning → `ph:lightning-fill`
  - file-csv → `ph:clipboard-text-bold`
  - users-three → `ph:users-three-bold`
  - calendar-check → `ph:calendar-check-fill`
  - globe-hemisphere-west → `ph:globe-bold`
  - table → `ph:clipboard-text-bold`
  - app-window → `ph:database-bold`
  - fast-forward-circle → `ph:rocket-launch-fill`

**Commit:** `feat(front): add features data with Scheduling entry`

### Task 3 — Build new primitives in `_components/`

Create six new files. Order matters only for review clarity; tsc gate runs
once at the end of the task.

1. `feature-hero.tsx` — split hero with CSS-only calendar mockup
2. `feature-step-band.tsx` — 3-numbered-step "How it works" band
3. `feature-benefit-grid.tsx` — responsive icon-card grid
4. `feature-screenshot.tsx` — browser-chrome wrapper around `<Image>`
5. `feature-comparison.tsx` — 3-up "versus X" strip
6. `feature-quote.tsx` — blockquote card with avatar + attribution

Reuse existing primitives:

- `MarketingEyebrow` for all eyebrow pills.
- `ContentBand` only where the layout matches (benefit grid, comparison).
- `CtaBand` directly for the bottom CTA.
- `varFade('inUp', { distance: 24 })` for entry animations on each
  primitive's root section. `MotionViewport` for the wrapping section.
- `hoverLift()` for benefit cards and the screenshot mockup.

**Commit:** `feat(front): add feature page template primitives`

### Task 4 — Build the page route file

- New file: `apps/front/src/routes/marketing/features/feature-page.tsx`.
- Read `:slug` via `useParams<{ slug: string }>()`.
- `getFeature(slug)` → if undefined, `throw new Response('Not Found', { status: 404 })`
  (React Router's standard 404 path → catches `MarketingNotFoundPage` via
  the existing `*` route).
- Render the template by composing the new primitives + `CtaBand`, passing
  the relevant `feature.*` slice to each.
- Export `meta = ({ params }) => …` returning `metaTitle`, description,
  and `og:*` tags. Unknown slug → `[{ title: 'Not Found | PublyApp' }]`
  (mirror the blog-article-route pattern).

**Commit:** `feat(front): add feature page route component`

### Task 5 — Register the dynamic route

- `apps/front/src/routes/_tree/marketing.routes.ts` → add
  ```ts
  ...(FEATURES.marketing.featurePages
    ? [route('features/:slug', 'routes/marketing/features/feature-page.tsx')]
    : []),
  ```
  inside the `layout` group, before the catch-all `*` route. Mirror the
  pattern used for `blog/:slug`.

**Commit:** `feat(front): register feature page dynamic route`

### Task 6 — Verify, polish, and run final gates

- Re-run `just check-write` and `just tsc-front`.
- Spot-check that the page renders with the canvas copy verbatim.
- Confirm the `/features` index is unreachable (no index registration).
- Confirm flag default is `false` (no env override committed).

**No new commit if no changes.**

### Task 7 — Push + open PR

- `git push -u origin feature/feature-page-template`.
- `gh pr create --title "feat(front): feature page template (with Scheduling)" --body "…"`.
- Body: Summary (3 bullets), Closes #372 (slice 3 link), Test plan
  checklist for manual smoke (set
  `VITE_FEATURE_MARKETING_FEATURE_PAGES=true`, visit
  `/features/scheduling/`, then `/features/nonexistent/`).
- Capture and report the PR URL.

## Commit list (target)

1. `feat(front): add feature page flag + path helper`
2. `feat(front): add features data with Scheduling entry`
3. `feat(front): add feature page template primitives`
4. `feat(front): add feature page route component`
5. `feat(front): register feature page dynamic route`

(plus the spec + plan commits already done)
