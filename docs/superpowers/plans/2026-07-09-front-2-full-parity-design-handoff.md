# Front-2 Full-Parity Design Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the full `.dump/design_handoff_publyapp_front2/` design bundle in `apps/front-2` using the existing React, Base UI primitive, Tailwind v4, Tabler, and TanStack Table stack.

**Architecture:** Treat the handoff bundle as the visual source of truth and keep all production code native to the current `front-2` codebase. Build shared tokens, shell, table, overlay, card, chip, and form foundations first; then implement staff, tenant, account, responsive, and drawer artboards as route/module slices that reuse those foundations.

**Tech Stack:** React 19, TanStack Start/Router/Query/Table, Base UI, local shadcn-style primitives, Tailwind v4, Tabler icons, React Hook Form, Vitest, Playwright.

---

## Source Of Truth

- Bundle overview: `.dump/design_handoff_publyapp_front2/README.md`
- Artboard spec: `.dump/design_handoff_publyapp_front2/SPEC.md`
- Machine assertions: `.dump/design_handoff_publyapp_front2/spec.json`
- Owner conventions: `.dump/design_handoff_publyapp_front2/CONVENTIONS.md`
- Visual canvas: `.dump/design_handoff_publyapp_front2/PublyApp front-2.dc.html`
- Assets: `.dump/design_handoff_publyapp_front2/assets/logo.svg`, `.dump/design_handoff_publyapp_front2/assets/avatar-profile.jpg`
- Front-2 repo guide: `docs/guides/front-2/index.md`, `docs/guides/front-2/conventions.md`
- Existing navigation decision: `docs/superpowers/specs/2026-07-09-front-2-navigation-registry-design.md`

`spec.json` currently has metadata for 57 artboards but assertion entries only for 23 artboards (`2a` through `6d`, with some gaps). Workers must assert all JSON-backed values and add prose/HTML-derived checks for missing assertion entries: `2i`, `3e`, `4c`, `4d`, `5f` through `5j`, `7a` through `7i`, and `8a` through `8p`.

## Execution Route

- Integration branch/worktree: `feat/front-2-full-parity-handoff` at `.worktrees/front-2-full-parity-handoff`.
- Do not touch `develop` directly.
- Implementation worker route: Codex CLI from this worktree, one bounded packet at a time.
- Review route: Claude CLI, two reviews per accepted packet: first spec compliance, then code quality. If Claude is unavailable, stop before integrating worker output.
- Keep implementation packets serialized until the foundation stabilizes. Parallelize only read-only inspection or verification packets.
- One commit per accepted packet after verification and review.
- Heavy verification is serialized: at most one Docker/Playwright stack at a time.

## Current Baseline

- `corepack pnpm install --frozen-lockfile`: pass.
- `pnpm --filter front-2 test:design-system-guard`: pass.
- `pnpm --filter front-2 typecheck`: pass.

## File Ownership Map

- `apps/front-2/src/styles/app.css`: design tokens, radii, typography roles, shell/table/form/drawer/modal CSS.
- `apps/front-2/src/components/app-shell/app-shell.tsx`: staff/tenant/account shell, rail, secondary panel, topbar, breadcrumbs.
- `apps/front-2/src/lib/navigation/route-metadata.tsx`: module registry, secondary destinations, breadcrumbs, detail/form panel collapse rules.
- `apps/front-2/src/components/ui/*.tsx`: Base UI primitives and product primitives.
- `apps/front-2/src/components/table/data-table.tsx`: TanStack table wrapper, toolbar, states, footer, responsive behavior.
- `apps/front-2/src/components/field/*.tsx`: React Hook Form field wrappers and form anatomy.
- `apps/front-2/src/routes/authed/staff/**`: staff, tenant-management, and audit screens.
- `apps/front-2/src/routes/authed/tenant/**`: tenant posts, members, settings, account, and portal screens.
- `apps/front-2/e2e/*.spec.ts`: visual, shell, table, responsive, and overlay browser checks.
- `apps/front-2/scripts/check-design-system.mjs`: static design-system guard.

---

### Task 1: Design Assertion Harness And Foundation Guards

**Files:**
- Create: `apps/front-2/src/design-handoff/artboard-assertions.ts`
- Create: `apps/front-2/src/design-handoff/artboard-assertions.test.ts`
- Create: `apps/front-2/e2e/design-handoff-foundation.spec.ts`
- Modify: `apps/front-2/scripts/check-design-system.mjs`
- Modify: `apps/front-2/scripts/check-design-system.test.mjs`
- Modify: `apps/front-2/src/styles/app.css`

- [ ] **Step 1: Add failing assertion tests**

Create `artboard-assertions.ts` with typed expectations for tokens, shell, table, form, modal, drawer, and missing-artboard coverage. The first test must fail if `spec.json` has delivered artboards that are not either JSON-backed or prose-backed in the local assertion map.

Run: `pnpm --filter front-2 exec vitest run src/design-handoff/artboard-assertions.test.ts`

Expected before implementation: fail on missing local assertion map.

- [ ] **Step 2: Add static guard coverage**

Extend `check-design-system.mjs` to reject:

- `border-radius: 999px` or `rounded-full` outside avatars and 36px topbar icon buttons.
- Modal usage outside confirmation components.
- Non-confirmation overlays implemented with centered dialogs.
- New `lucide-react`, `@mui/*`, or `@heroui/*` imports.
- Raw design colors outside `src/styles/app.css`.

Run: `pnpm --filter front-2 test:design-system-guard`

Expected before implementation: fail on the new fixture cases, then pass after the guard is implemented.

- [ ] **Step 3: Add Playwright foundation checks**

Create `design-handoff-foundation.spec.ts` to visit representative existing pages and assert:

- rail width `49px`
- secondary panel width `272px`
- topbar height `64px`
- no topbar bottom border
- primary button background `rgb(253, 199, 0)`
- table header height `40px`
- table body row height `48px`
- table footer height `48px`
- modal radius `28px`

Run: `pnpm --filter front-2 exec playwright test e2e/design-handoff-foundation.spec.ts --reporter=line`

Expected before implementation: fail on at least rail width and input/chip radius mismatches.

- [ ] **Step 4: Commit**

After tests are red/green and the existing guard/typecheck pass:

```bash
pnpm --filter front-2 test:design-system-guard
pnpm --filter front-2 typecheck
git add apps/front-2/src/design-handoff apps/front-2/e2e/design-handoff-foundation.spec.ts apps/front-2/scripts/check-design-system.mjs apps/front-2/scripts/check-design-system.test.mjs apps/front-2/src/styles/app.css
git commit -m "test(front-2): add full handoff design guards"
```

### Task 2: Token, Radius, And Primitive Baseline

**Files:**
- Modify: `apps/front-2/src/styles/app.css`
- Modify: `apps/front-2/src/components/ui/button.tsx`
- Modify: `apps/front-2/src/components/ui/input.tsx`
- Modify: `apps/front-2/src/components/ui/badge.tsx`
- Modify: `apps/front-2/src/components/ui/card.tsx`
- Modify: `apps/front-2/src/components/ui/checkbox.tsx`
- Modify: `apps/front-2/src/components/ui/switch.tsx`
- Modify: `apps/front-2/src/components/ui/product-page.tsx`
- Modify: `apps/front-2/src/components/ui/initials-avatar.tsx`
- Test: `apps/front-2/src/design-handoff/artboard-assertions.test.ts`

- [ ] **Step 1: Lock token values**

Update CSS variables to the bundle values: rail `49px`, panel `272px`, topbar `64px`, input radius `10px`, card/menu/button `14px`, chip `8px`, modal `28px`, frame card `16px`, small controls `9px` or `10px`, circular only for avatars and topbar icon buttons.

- [ ] **Step 2: Normalize primitive APIs**

Ensure local primitives expose enough variant/size hooks for the handoff without route-local CSS hacks:

- Button: `default`, `outline`, `ghost`, `destructive`, `softDestructive`, icon sizes `28`, `32`, `36`, default h36 r14.
- Input: h36 r10, mobile h44 via media query.
- Badge/chip: h20 r8, status-tone variants.
- Card/frame: ring-only cards, no drop shadow.
- Avatar/brand tile: person avatars circular, organization tiles square r8/r12/r14.
- Switch: 44x20 r999 with 16px thumb.

- [ ] **Step 3: Verify**

Run:

```bash
pnpm --filter front-2 exec vitest run src/design-handoff/artboard-assertions.test.ts
pnpm --filter front-2 test:design-system-guard
pnpm --filter front-2 typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/styles/app.css apps/front-2/src/components/ui apps/front-2/src/design-handoff
git commit -m "feat(front-2): align primitives with full handoff tokens"
```

### Task 3: App Shell And Navigation Registry

**Files:**
- Modify: `apps/front-2/src/components/app-shell/app-shell.tsx`
- Modify: `apps/front-2/src/lib/navigation/route-metadata.tsx`
- Modify: `apps/front-2/src/lib/navigation/route-metadata.test.tsx`
- Modify: `apps/front-2/src/styles/app.css`
- Test: `apps/front-2/e2e/shell.spec.ts`
- Test: `apps/front-2/e2e/design-handoff-foundation.spec.ts`

- [ ] **Step 1: Add registry tests**

Tests must cover staff rail modules Dashboard/Tenants/Staff/Audit; tenant rail modules Posts/Members/Settings with Account pinned bottom; panel shown only for modules with at least two destinations; panel collapsed on detail/form routes and below 1024px.

- [ ] **Step 2: Implement shell**

Use the registry to render staff, tenant, account, and rail-less portal modes. Topbar has no bottom border. Staff rail has no bottom pin. Tenant rail pins Account at bottom with avatar outline when active.

- [ ] **Step 3: Verify**

Run:

```bash
pnpm --filter front-2 exec vitest run src/lib/navigation/route-metadata.test.tsx
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec playwright test e2e/shell.spec.ts e2e/design-handoff-foundation.spec.ts --reporter=line
```

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/components/app-shell apps/front-2/src/lib/navigation apps/front-2/src/styles/app.css apps/front-2/e2e
git commit -m "feat(front-2): implement full handoff app shell"
```

### Task 4: Table, List State, And Toolbar Foundation

**Files:**
- Modify: `apps/front-2/src/components/table/data-table.tsx`
- Modify: `apps/front-2/src/components/table/data-table.test.tsx`
- Modify: `apps/front-2/src/components/table/row-actions.tsx`
- Modify: `apps/front-2/src/components/ui/state-surface.tsx`
- Modify: `apps/front-2/src/styles/app.css`
- Test: `apps/front-2/e2e/table.spec.ts`
- Test: `apps/front-2/e2e/design-handoff-foundation.spec.ts`

- [ ] **Step 1: Add table behavior tests**

Cover sticky header, body scrolling inside card, pinned footer, h40/h48 sizes, selection column width, row menu dimensions, and list states: empty, no-results, loading, error.

- [ ] **Step 2: Implement table recipe**

Use TanStack Table, exact grid templates from screen routes, h40 header, h48 base rows, h52/h56 per route override, footer h48, internal scroll, toolbar search h40 r14, filter buttons h36 r14, and view toggles r14/r10.

- [ ] **Step 3: Verify**

Run:

```bash
pnpm --filter front-2 exec vitest run src/components/table src/components/ui/state-surface.test.tsx
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec playwright test e2e/table.spec.ts e2e/design-handoff-foundation.spec.ts --reporter=line
```

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/components/table apps/front-2/src/components/ui/state-surface.tsx apps/front-2/src/styles/app.css apps/front-2/e2e
git commit -m "feat(front-2): build handoff table foundation"
```

### Task 5: Drawer, Modal, Form, And Detail Foundations

**Files:**
- Create: `apps/front-2/src/components/ui/drawer.tsx`
- Create: `apps/front-2/src/components/ui/detail-layout.tsx`
- Modify: `apps/front-2/src/components/ui/confirm-dialog.tsx`
- Modify: `apps/front-2/src/components/field/*.tsx`
- Modify: `apps/front-2/src/components/ui/tabs.tsx`
- Modify: `apps/front-2/src/styles/app.css`
- Test: `apps/front-2/src/components/ui/confirm-dialog.test.tsx`
- Test: `apps/front-2/src/components/field/*.test.tsx`
- Test: `apps/front-2/e2e/design-handoff-foundation.spec.ts`

- [ ] **Step 1: Add overlay and form tests**

Tests must assert right-side drawers for non-confirmation overlays, centered modals only for confirmation, modal r28/backdrop, form field h36/r10/error ring, sticky action bar, underline tabs, and danger-zone soft-destructive actions.

- [ ] **Step 2: Implement foundation**

Drawer: right anchored, 460px default, 400px filters, full height, border-left, drawer shadow, header/body/footer slots. Modal: confirmation only, 480px, radius 28, soft destructive confirm. Forms: centered 860/760 layouts, fields, select trigger, chips, switches, sticky action bar.

- [ ] **Step 3: Verify**

Run:

```bash
pnpm --filter front-2 exec vitest run src/components/ui/confirm-dialog.test.tsx src/components/field
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec playwright test e2e/design-handoff-foundation.spec.ts --reporter=line
```

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/components/ui apps/front-2/src/components/field apps/front-2/src/styles/app.css apps/front-2/e2e
git commit -m "feat(front-2): add handoff overlay and form foundations"
```

### Task 6: Staff Core Screens, Artboards 2a-2i

**Files:**
- Create/modify: `apps/front-2/src/routes/authed/staff/dashboard.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/staff-users.tsx`
- Modify/create: `apps/front-2/src/routes/authed/staff/staff-users/$userId.tsx`
- Modify/create: `apps/front-2/src/routes/authed/staff/staff-users/$userId-edit.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/invitations/**`
- Modify: `apps/front-2/src/routes/authed/staff/profiles**`
- Modify: `apps/front-2/src/routes.ts`
- Test: matching route tests and Playwright staff visual tests.

- [ ] **Step 1: Add route/visual tests for 2a-2i**
- [ ] **Step 2: Implement dashboard, staff users list/detail/edit, destructive confirms, list states, profiles list/detail, invitations list**
- [ ] **Step 3: Verify**

```bash
pnpm --filter front-2 exec vitest run src/routes/authed/staff
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec playwright test e2e/table.spec.ts e2e/design-handoff-staff.spec.ts --reporter=line
```

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/routes apps/front-2/src/routeTree.gen.ts apps/front-2/e2e
git commit -m "feat(front-2): implement staff core handoff screens"
```

### Task 7: Tenants And Audit Screens, Artboards 3a-3e

**Files:**
- Modify: `apps/front-2/src/routes/authed/staff/tenants**`
- Create: `apps/front-2/src/routes/authed/staff/audit.tsx`
- Modify: `apps/front-2/src/routes.ts`
- Test: matching route tests and Playwright tenant/audit visual tests.

- [ ] **Step 1: Add route/visual tests for 3a-3e**
- [ ] **Step 2: Implement tenants list/detail/create/edit and audit list with in-content slide-over**
- [ ] **Step 3: Verify**

```bash
pnpm --filter front-2 exec vitest run src/routes/authed/staff/tenants src/routes/authed/staff/audit.test.tsx
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec playwright test e2e/design-handoff-tenants-audit.spec.ts --reporter=line
```

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/routes apps/front-2/src/routeTree.gen.ts apps/front-2/e2e
git commit -m "feat(front-2): implement tenants and audit handoff screens"
```

### Task 8: Tenant Posts Screens, Artboards 4a-4d

**Files:**
- Create: `apps/front-2/src/routes/authed/tenant/posts/**`
- Modify: `apps/front-2/src/routes.ts`
- Test: tenant posts route tests and Playwright visual tests.

- [ ] **Step 1: Add tests for calendar, queue, drafts, and history**
- [ ] **Step 2: Implement calendar card, post table variants, and tenant shell panel**
- [ ] **Step 3: Verify**

```bash
pnpm --filter front-2 exec vitest run src/routes/authed/tenant/posts
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec playwright test e2e/design-handoff-posts.spec.ts --reporter=line
```

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/routes apps/front-2/src/routeTree.gen.ts apps/front-2/e2e
git commit -m "feat(front-2): implement tenant posts handoff screens"
```

### Task 9: Members And Settings Screens, Artboards 5a-5j

**Files:**
- Create: `apps/front-2/src/routes/authed/tenant/members/**`
- Create: `apps/front-2/src/routes/authed/tenant/settings/**`
- Modify: `apps/front-2/src/routes.ts`
- Test: tenant members/settings route tests and Playwright visual tests.

- [ ] **Step 1: Add tests for members, invitations, roles, role permissions, detail, and settings pages**
- [ ] **Step 2: Implement members list, invite drawer, roles, permission matrix, settings general/workspaces/integrations/billing/security**
- [ ] **Step 3: Verify**

```bash
pnpm --filter front-2 exec vitest run src/routes/authed/tenant/members src/routes/authed/tenant/settings
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec playwright test e2e/design-handoff-members-settings.spec.ts --reporter=line
```

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/routes apps/front-2/src/routeTree.gen.ts apps/front-2/e2e
git commit -m "feat(front-2): implement members and settings handoff screens"
```

### Task 10: Account And Portal Screens, Artboards 6a-6d

**Files:**
- Create: `apps/front-2/src/routes/authed/tenant/account/**`
- Create: `apps/front-2/src/routes/authed/tenant/organizations.tsx`
- Modify: `apps/front-2/src/routes.ts`
- Test: account/portal route tests and Playwright visual tests.

- [ ] **Step 1: Add tests for account profile/security/notifications and rail-less organization picker**
- [ ] **Step 2: Implement account panels, personal pill, account rail active state, and portal grid**
- [ ] **Step 3: Verify**

```bash
pnpm --filter front-2 exec vitest run src/routes/authed/tenant/account src/routes/authed/tenant/organizations.test.tsx
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec playwright test e2e/design-handoff-account-portal.spec.ts --reporter=line
```

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/routes apps/front-2/src/routeTree.gen.ts apps/front-2/e2e
git commit -m "feat(front-2): implement account and portal handoff screens"
```

### Task 11: Responsive Archetypes And Drawer Catalog, Artboards 7a-7i And 8a-8p

**Files:**
- Modify: `apps/front-2/src/styles/app.css`
- Create/modify: reusable drawer contents under `apps/front-2/src/components/drawers/**`
- Modify: routes that trigger non-confirmation overlays.
- Test: responsive and drawer Playwright specs.

- [ ] **Step 1: Add responsive tests**

Test list tablet/mobile, nav drawer, detail mobile/tablet, form mobile, confirm bottom sheet, card grid, and calendar agenda.

- [ ] **Step 2: Add drawer catalog tests**

Test every 8a-8p drawer trigger renders a right-side drawer with header, scrolling body, pinned footer, correct width, and no centered modal.

- [ ] **Step 3: Implement responsive and drawer catalog**

Use CSS/media rules and shared drawer content components. Confirmation dialogs become bottom sheets on mobile only where artboard 7f requires it.

- [ ] **Step 4: Verify**

```bash
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec playwright test e2e/design-handoff-responsive.spec.ts e2e/design-handoff-drawers.spec.ts --reporter=line
```

- [ ] **Step 5: Commit**

```bash
git add apps/front-2/src apps/front-2/e2e
git commit -m "feat(front-2): add responsive and drawer handoff coverage"
```

### Task 12: Final Parity Gate

**Files:**
- Modify: `apps/front-2/e2e/gray-ui-visual.spec.ts`
- Create: `.dump/design-handoff-front2-parity/README.md` (ignored local artifact)

- [ ] **Step 1: Run full local gates**

```bash
pnpm --filter front-2 check:design-system
pnpm --filter front-2 test
pnpm --filter front-2 typecheck
pnpm --filter front-2 build
git diff --check
```

- [ ] **Step 2: Run visual Playwright suite**

Run all handoff specs against desktop, tablet, and mobile viewports. Store screenshots under `apps/front-2/test-results/gray-ui/` or an ignored `.dump/` path.

- [ ] **Step 3: Open the design canvas for spot checks**

Compare the implemented screens against `.dump/design_handoff_publyapp_front2/PublyApp front-2.dc.html`, with special attention to artboards not covered by `spec.json` assertion entries.

- [ ] **Step 4: Final Claude review**

Run a full diff review against the branch base with the bundle paths and this plan as required context. Block completion on any critical/important finding.

- [ ] **Step 5: Commit closeout artifact if needed**

Do not commit screenshots or raw logs. Commit only stable tests, source, and docs.

```bash
git status --short
git log --oneline --decorate -12
```

Expected: clean worktree after final commit.
