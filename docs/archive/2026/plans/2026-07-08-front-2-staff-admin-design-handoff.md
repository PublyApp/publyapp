Status: Historical — not normative
Original location: docs/superpowers/plans/2026-07-08-front-2-staff-admin-design-handoff.md
Archive reason: Superseded HeroUI implementation handoff retained because an archived migration design depends on it.
Superseded by: docs/guides/front-2/conventions.md and apps/front-2/src/styles/app.css.

# Front-2 Staff Admin Design Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `front-2` staff/admin screens to match the Claude Design handoff in `.dump/design_handoff_publyapp_staff_admin/README.md` and `PublyApp Staff Admin.dc.html`.

**Architecture:** Treat the handoff as the visual source of truth and implement it through HeroUI, TanStack Router, existing query hooks, and shared front-2 primitives. The first task replaces the earlier Publy-blue/Inter reset with the handoff's Geist/zinc/yellow chrome design tokens; downstream tasks apply those primitives across shell, data tables, staff users, invitations, profiles, permission assignment, and visual smoke coverage.

**Tech Stack:** React 19, TanStack Router/Start, TanStack Query/Table, HeroUI v3.2.1, Tailwind v4, React Hook Form, Vitest, Playwright.

---

## Source Of Truth

- Design handoff: `.dump/design_handoff_publyapp_staff_admin/README.md`
- Design canvas: `.dump/design_handoff_publyapp_staff_admin/PublyApp Staff Admin.dc.html`
- Design assets: `.dump/design_handoff_publyapp_staff_admin/assets/logo.svg`, `.dump/design_handoff_publyapp_staff_admin/assets/avatar-profile.jpg`
- Existing front-2 conventions: `docs/guides/front-2/index.md`, `docs/guides/front-2/conventions.md`
- Current branch baseline: `feat/front-2-gray-ui-reset` at `548d6671`

## Execution Route

- Implementer: OpenCode `opencode-go/deepseek-v4-flash --variant max`
- Reviewer: Claude Opus or Sonnet, different model family from implementer
- Branch: continue on `feat/front-2-gray-ui-reset` unless the captain creates a clone-local `.worktrees/<task>` worktree for a task wave
- Commits: one commit per task after captain verification and Claude review
- Heavy verification: serialize Docker/Playwright e2e; do not run multiple compose stacks concurrently

## File Structure

- Modify `apps/front-2/src/styles/app.css`: handoff tokens, HeroUI slot styling, shell/table/form/modal primitives, responsive variants.
- Modify `apps/front-2/src/components/app-shell/app-shell.tsx`: 48px rail, 272px secondary nav, topbar actions, user chip, search/nav rows.
- Modify `apps/front-2/src/lib/navigation/route-metadata.tsx`: route labels/icons/secondary items matching handoff.
- Modify `apps/front-2/src/components/ui/product-page.tsx`: richer admin primitives for page headers, cards, chips, avatars, sections, danger zones, and action clusters.
- Modify `apps/front-2/src/components/ui/confirm-dialog.tsx`: 28px blurred AlertDialog with soft destructive action and mobile stacked footer.
- Modify `apps/front-2/src/components/table/data-table.tsx`: toolbar filters/view toggle hooks, exact density, footer text, row action accommodation, responsive table-to-list behavior.
- Modify `apps/front-2/src/components/field/*.tsx`: handoff field anatomy, pill checkbox/multi-select styling, errors, mobile touch targets.
- Modify staff/admin routes under `apps/front-2/src/routes/authed/staff/**`: staff users, invitations, profiles, tenant staff-adjacent screens where they share admin primitives.
- Modify/add tests under matching `*.test.tsx` files and `apps/front-2/e2e/gray-ui-visual.spec.ts`.
- Add assets under `apps/front-2/src/assets/gray-ui/` or `apps/front-2/public/gray-ui/`; choose the path that works with existing Vite asset import rules.

---

### Task 1: Handoff Token And Asset Baseline

Status: accepted in commit `b639c1c6` after captain verification and Claude Sonnet review.

**Files:**
- Modify: `apps/front-2/src/styles/app.css`
- Modify: `apps/front-2/src/components/app-shell/app-shell.tsx`
- Modify: `apps/front-2/src/components/ui/product-page.tsx`
- Add: `apps/front-2/src/assets/gray-ui/logo.svg`
- Add: `apps/front-2/src/assets/gray-ui/avatar-profile.jpg`
- Test: `apps/front-2/scripts/check-design-system.test.mjs`

- [x] **Step 1: Write token guard tests**

Add assertions in `apps/front-2/scripts/check-design-system.test.mjs` that fail if `app.css` does not contain:

```js
assert.match(css, /--publy-font-sans:\s*Geist, ui-sans-serif/);
assert.match(css, /--publy-primary:\s*#FDC700/);
assert.match(css, /--publy-primary-foreground:\s*#733E0A/);
assert.match(css, /--publy-shell-rail-width:\s*48px/);
assert.match(css, /--publy-shell-panel-width:\s*272px/);
assert.match(css, /--publy-modal-radius:\s*28px/);
```

- [x] **Step 2: Run the guard and verify it fails**

Run: `pnpm --filter front-2 test:design-system-guard`

Expected: FAIL because current tokens still use Inter, blue primary, and wider shell values.

- [x] **Step 3: Copy handoff assets**

Copy exactly:

```bash
mkdir -p apps/front-2/src/assets/gray-ui
cp .dump/design_handoff_publyapp_staff_admin/assets/logo.svg apps/front-2/src/assets/gray-ui/logo.svg
cp .dump/design_handoff_publyapp_staff_admin/assets/avatar-profile.jpg apps/front-2/src/assets/gray-ui/avatar-profile.jpg
```

- [x] **Step 4: Replace base tokens**

Update `:root` in `apps/front-2/src/styles/app.css` with the handoff values:

```css
--publy-font-sans: Geist, ui-sans-serif, system-ui, sans-serif;
--publy-primary: #FDC700;
--publy-primary-hover: #f0bd00;
--publy-primary-active: #d9aa00;
--publy-primary-soft: #fffbeb;
--publy-primary-foreground: #733E0A;
--publy-background: #ffffff;
--publy-surface: #ffffff;
--publy-surface-raised: #fafafa;
--publy-surface-muted: #f4f4f5;
--publy-surface-hover: #fafafa;
--publy-surface-active: #ececee;
--publy-table-header: #fcfcfd;
--publy-foreground: #18181b;
--publy-foreground-secondary: #3f3f46;
--publy-foreground-muted: #71717a;
--publy-foreground-subtle: #a1a1aa;
--publy-disabled: #d4d4d8;
--publy-border: #e4e4e7;
--publy-row-border: #f1f1f3;
--publy-danger: #dc2626;
--publy-success: #047857;
--publy-warning: #b45309;
--publy-radius-control: 14px;
--publy-radius-input: 18px;
--publy-radius-frame: 16px;
--publy-modal-radius: 28px;
--publy-shell-rail-width: 48px;
--publy-shell-panel-width: 272px;
--publy-shell-topbar-height: 64px;
--publy-shadow-card: 0 0 0 1px rgba(24,24,27,0.06);
--publy-shadow-menu: 0 12px 32px rgba(24,24,27,0.14), 0 2px 6px rgba(24,24,27,0.06);
--publy-shadow-modal: 0 24px 64px rgba(24,24,27,0.28);
--publy-shadow-input: 0 1px 2px rgba(0,0,0,0.03);
--publy-shadow-chrome: 0 0 0 0.67px rgba(0,0,0,0.2) inset, 0 2px 2px rgba(255,255,255,0.1) inset, 0 2px 2.67px -0.67px rgba(42,42,42,0.1), 0 0.67px 0.67px rgba(42,42,42,0.08);
```

Keep dark-mode variables only if they remain coherent; do not let dark-mode tokens override the light staff/admin handoff during visual smoke.

- [x] **Step 5: Make HeroUI primary buttons chrome**

In `app.css`, style HeroUI primary buttons and `buttonVariants({ variant: 'primary' })` output so primary actions render yellow chrome: h36 pill, text `#733E0A`, border `1.33px rgba(255,255,255,0.12)`, and `--publy-shadow-chrome`.

- [x] **Step 6: Verify**

Run:

```bash
pnpm --filter front-2 test:design-system-guard
pnpm --filter front-2 typecheck
```

Expected: both pass.

- [x] **Step 7: Commit**

```bash
git add apps/front-2/src/styles/app.css apps/front-2/src/components/app-shell/app-shell.tsx apps/front-2/src/components/ui/product-page.tsx apps/front-2/src/assets/gray-ui apps/front-2/scripts/check-design-system.test.mjs
git commit -m "feat(front-2): align staff admin tokens with handoff"
```

---

### Task 2: Admin Shell Pixel Pass

Status: accepted in commit `98c968ee` after captain verification and Claude Sonnet review.

**Files:**
- Modify: `apps/front-2/src/components/app-shell/app-shell.tsx`
- Modify: `apps/front-2/src/lib/navigation/route-metadata.tsx`
- Modify: `apps/front-2/src/styles/app.css`
- Test: `apps/front-2/src/lib/navigation/route-metadata.test.tsx`
- Test: `apps/front-2/e2e/shell.spec.ts`

- [x] **Step 1: Add shell tests**

Update shell Playwright assertions to check:

```ts
await expect(page.getByTestId('app-shell-rail')).toHaveCSS('width', '48px');
await expect(page.getByTestId('app-shell-secondary-panel')).toHaveCSS('width', '272px');
await expect(page.getByTestId('app-shell-topbar')).toBeVisible();
await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Workspace');
```

- [x] **Step 2: Run shell tests and verify failure**

Run: `pnpm --filter front-2 exec playwright test e2e/shell.spec.ts --reporter=line`

Expected: FAIL on rail/panel measurements or missing topbar affordances.

- [x] **Step 3: Implement handoff shell**

Change the shell to match artboard 1a:

- Rail: 48px, `#fafafa`, 1px right border, 32px logo tile, 32px icon buttons, active `#ececee`.
- Secondary panel: 272px, `#fafafa`, header with "Staff", Workspace pill, h32 search, nav rows h32.
- Topbar: 14px 16px padding, breadcrumb, three 36px circular outline icon buttons, user chip.
- Detail/form routes: rail only, no secondary panel.
- Mobile: no bottom tab rail; render handoff topbar with hamburger/title/actions and keep content clear of the FAB/footer.

- [x] **Step 4: Update route metadata**

Use these primary routes and labels:

```ts
Dashboard, Content, Staff users, Roles & permissions, Invitations, Analytics
```

Staff secondary items:

```ts
All users, Invitations, Roles, Profiles, Permissions, Audit log
```

Routes without implemented pages may point to the nearest existing route and render disabled/inert styling where navigation is not available.

- [x] **Step 5: Verify**

Run:

```bash
pnpm --filter front-2 exec vitest run src/lib/navigation/route-metadata.test.tsx
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec playwright test e2e/shell.spec.ts --reporter=line
```

Expected: all pass.

- [x] **Step 6: Commit**

```bash
git add apps/front-2/src/components/app-shell/app-shell.tsx apps/front-2/src/lib/navigation/route-metadata.tsx apps/front-2/src/lib/navigation/route-metadata.test.tsx apps/front-2/src/styles/app.css apps/front-2/e2e/shell.spec.ts
git commit -m "feat(front-2): match staff admin shell handoff"
```

---

### Task 3: Admin Primitive Recipes

**Files:**
- Modify: `apps/front-2/src/components/ui/product-page.tsx`
- Modify: `apps/front-2/src/components/ui/state-surface.tsx`
- Modify: `apps/front-2/src/components/ui/confirm-dialog.tsx`
- Modify: `apps/front-2/src/components/field/field-text.tsx`
- Modify: `apps/front-2/src/components/field/field-checkbox-group.tsx`
- Modify: `apps/front-2/src/styles/app.css`
- Test: `apps/front-2/src/components/field/field.test.tsx`
- Test: `apps/front-2/src/components/field/field-checkbox-group.test.tsx`

- [ ] **Step 1: Add primitive render tests**

Add tests that render and assert class/data hooks for:

```tsx
<PageHeader title="Staff users" badge="42" actions={<button>Invite user</button>} />
<StatusPill tone="success">Active</StatusPill>
<MetadataCard title="Account">content</MetadataCard>
<DetailSection title="Contact details">content</DetailSection>
```

Expected test hooks:

```ts
getByTestId('publy-page-header')
getByTestId('publy-status-pill')
getByTestId('publy-metadata-card')
getByTestId('publy-detail-section')
```

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm --filter front-2 exec vitest run src/components/ui src/components/field`

Expected: FAIL because the new primitive API does not exist yet.

- [ ] **Step 3: Extend primitives**

Implement these exports in `product-page.tsx`:

```ts
PageHeader
ActionCluster
InitialsAvatar
StatusPill
RoleChip
ProfileChip
MetricTile
MetadataCard
DetailRow
DetailSection
FormSection
DangerZone
PermissionMeter
PillTabs
```

Each primitive must rely on `.publy-*` CSS classes and HeroUI-compatible composition, not inline style objects.

- [ ] **Step 4: Restyle fields**

Field anatomy:

- Label: 13px/500, 6px gap.
- Input: h36, radius 18, border `#e4e4e7`, bg `rgba(228,228,231,0.35)`, 13px text, `--publy-shadow-input`.
- Invalid: border `#dc2626`, ring `0 0 0 3px rgba(220,38,38,0.12)`, 12px red error row.
- Mobile: h40, 14px text.
- Checkbox group: pill/chip mode for profile selection and dense permission-row mode for permission panels.

- [ ] **Step 5: Restyle ConfirmDialog**

Match artboards 1d and 1g:

- Backdrop `rgba(24,24,27,0.32)` with 2px blur.
- Panel width 480px, mobile `calc(100% - 32px)`, radius 28, modal shadow.
- Destructive action is soft red, never solid red.
- Mobile footer stacks full-width buttons, destructive first, cancel second.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm --filter front-2 exec vitest run src/components/ui src/components/field
pnpm --filter front-2 typecheck
pnpm --filter front-2 check:design-system
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/front-2/src/components/ui apps/front-2/src/components/field apps/front-2/src/styles/app.css
git commit -m "feat(front-2): add staff admin UI recipes"
```

---

### Task 4: Data Table Handoff Pass

**Files:**
- Modify: `apps/front-2/src/components/table/data-table.tsx`
- Modify: `apps/front-2/src/components/table/data-table.test.tsx`
- Modify: `apps/front-2/src/styles/app.css`
- Modify: `apps/front-2/e2e/table.spec.ts`

- [ ] **Step 1: Add table density tests**

Assert the staff table shell renders these parts:

```ts
getByTestId('staff-users-table-toolbar')
getByTestId('staff-users-table-rows')
getByTestId('staff-users-table-footer')
getByLabelText('Search')
getByLabelText('Rows per page')
```

Add Playwright CSS checks for header height 40px, row minimum height 48px, and table border radius 14px.

- [ ] **Step 2: Run table tests and verify failure**

Run:

```bash
pnpm --filter front-2 exec vitest run src/components/table/data-table.test.tsx
pnpm --filter front-2 exec playwright test e2e/table.spec.ts --reporter=line
```

Expected: FAIL on at least one exact density assertion.

- [ ] **Step 3: Implement exact table treatment**

Apply artboard 1a:

- Card radius 14, card ring `0 0 0 1px rgba(24,24,27,0.06)`.
- Header h40, `#fcfcfd`, bottom border `#e4e4e7`.
- Rows h48, border `#f1f1f3`, hover `#fafafa`.
- Search field 420x40 desktop, full-width mobile.
- Footer h48 desktop, mobile wraps without overlap.
- Page-size select uses HeroUI `Select.Root`, not native product select.
- Add optional toolbar slot for filter buttons and view toggle.

- [ ] **Step 4: Add responsive list mode**

For 390px staff users/invitations/profile tables, provide a mobile row renderer API:

```ts
mobileRow?: (row: TData) => ReactNode
```

When `mobileRow` exists, hide table rows below 640px and render `.publy-mobile-list`.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter front-2 exec vitest run src/components/table
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec playwright test e2e/table.spec.ts --reporter=line
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/front-2/src/components/table apps/front-2/src/styles/app.css apps/front-2/e2e/table.spec.ts
git commit -m "feat(front-2): match staff admin table handoff"
```

---

### Task 5: Staff Users List And Detail Artboards

**Files:**
- Modify: `apps/front-2/src/routes/authed/staff/staff-users.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/staff-users/$userId.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/staff-users/$userId.test.tsx`
- Modify: `apps/front-2/src/lib/query/staff-users.ts`
- Modify: `apps/front-2/e2e/gray-ui-visual.spec.ts`
- Modify: `apps/front-2/src/styles/app.css`

- [ ] **Step 1: Add staff user visual assertions**

In `gray-ui-visual.spec.ts`, add checks before screenshots:

```ts
await expect(page.getByRole('heading', { name: 'Staff users' })).toBeVisible();
await expect(page.getByRole('button', { name: /all statuses/i })).toBeVisible();
await expect(page.getByRole('button', { name: /all roles/i })).toBeVisible();
await expect(page.getByRole('button', { name: /last active/i })).toBeVisible();
```

For detail:

```ts
await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
await expect(page.getByText('Contact details')).toBeVisible();
await expect(page.getByText('Assigned profiles & roles')).toBeVisible();
await expect(page.getByText('Danger zone')).toBeVisible();
```

- [ ] **Step 2: Run visual smoke and verify failure**

Run: `pnpm --filter front-2 exec playwright test e2e/gray-ui-visual.spec.ts --reporter=line`

Expected: FAIL because filters, tabs, and detail sections are incomplete.

- [ ] **Step 3: Implement list artboard 1a**

Add:

- Page count badge.
- Export outline button.
- Invite user yellow chrome button.
- Toolbar filter buttons: All statuses, All roles, Last active, view toggle.
- Columns: checkbox, name/email/avatar, role, status, profiles, 2FA, last active, actions.
- Status tones: Active success, Invited info, Suspended danger, Pending warning.
- Row actions dropdown with view/edit/reset/suspend/delete groups.
- Mobile list rows with 36px avatar, name/status inline, role/profile subline, trailing menu, 48px FAB.

- [ ] **Step 4: Implement detail artboard 1b**

Add:

- Identity header with 56px avatar, role chip, status chip, meta line, Reset invite/Edit/Suspend/actions.
- Underlined tabs: Overview, Permissions, Activity, Settings.
- Body grid `1fr / 372px`.
- Contact details card, Assigned profiles & roles card, Permission summary meters, Account side card, Recent security activity, Danger zone.
- Keep existing data hooks; when API lacks fields, render stable sample-like fallbacks only as empty labels such as `—`, never fake user data.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter front-2 exec vitest run 'src/routes/authed/staff/staff-users/$userId.test.tsx'
pnpm --filter front-2 typecheck
pnpm --filter front-2 check:design-system
pnpm --filter front-2 exec playwright test e2e/gray-ui-visual.spec.ts --reporter=line
```

Expected: all pass and screenshots are materially closer to artboards 1a, 1b, 1h, and 1i.

- [ ] **Step 6: Commit**

```bash
git add apps/front-2/src/routes/authed/staff/staff-users.tsx 'apps/front-2/src/routes/authed/staff/staff-users/$userId.tsx' 'apps/front-2/src/routes/authed/staff/staff-users/$userId.test.tsx' apps/front-2/src/lib/query/staff-users.ts apps/front-2/e2e/gray-ui-visual.spec.ts apps/front-2/src/styles/app.css
git commit -m "feat(front-2): match staff user artboards"
```

---

### Task 6: Invitations List And Modal Flow

**Files:**
- Modify: `apps/front-2/src/routes/authed/staff/invitations/index.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/invitations/new.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/invitations/table-columns.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/invitations/new.test.ts`
- Modify: `apps/front-2/e2e/staff-invitations.spec.ts`
- Modify: `apps/front-2/e2e/gray-ui-visual.spec.ts`

- [ ] **Step 1: Add invite flow tests**

Add route tests for three states:

```ts
render new invitation route
fill email and select profiles
press Continue
expect review state with Role, Profiles, Invite expires
press Send invite
expect sent state with Invite sent
```

Add Playwright screenshot coverage:

```ts
test-results/gray-ui/invite-flow-form.png
test-results/gray-ui/invite-flow-review.png
test-results/gray-ui/invite-flow-sent.png
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --filter front-2 exec vitest run src/routes/authed/staff/invitations/new.test.ts
pnpm --filter front-2 exec playwright test e2e/staff-invitations.spec.ts e2e/gray-ui-visual.spec.ts --reporter=line
```

Expected: FAIL because current invite route is a page form, not the handoff modal flow.

- [ ] **Step 3: Implement invitations list**

Use `PageHeader`, status filter chips, `DataTable` toolbar slot, `StatusPill`, and mobile row renderer. Columns should show email/invited-by, profiles, status, expiry, accepted, created, actions.

- [ ] **Step 4: Implement invite modal flow**

Keep route `/staff/invitations/new`, but visually render artboard 1d modal panel in the page content:

- Step 1 form: email, first/last name if available in schema, role/profile selection, optional note only if the API payload supports it.
- Step 2 review: user summary row, key-value card, email-preview inset.
- Step 3 sent: emerald success disc, invite email pill, Invite another and Done.
- If API remains bulk-email/profile only, keep unsupported fields as non-submitted UI state and submit only the validated payload.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter front-2 exec vitest run src/routes/authed/staff/invitations
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec playwright test e2e/staff-invitations.spec.ts e2e/gray-ui-visual.spec.ts --reporter=line
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/front-2/src/routes/authed/staff/invitations apps/front-2/e2e/staff-invitations.spec.ts apps/front-2/e2e/gray-ui-visual.spec.ts
git commit -m "feat(front-2): match staff invitation artboards"
```

---

### Task 7: Profile And Permission Assignment Artboards

**Files:**
- Modify: `apps/front-2/src/routes/authed/staff/profiles.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/profiles-new.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/profiles/$profileId.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/profiles-new.test.tsx`
- Modify: `apps/front-2/e2e/staff-profiles.spec.ts`
- Modify: `apps/front-2/e2e/gray-ui-visual.spec.ts`

- [ ] **Step 1: Add permission panel tests**

Add tests asserting:

```ts
getByText('Permissions')
getByLabelText('Search permissions')
getByText(/permissions selected/)
getByRole('button', { name: /reset to role defaults/i })
getByRole('button', { name: /apply changes/i })
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --filter front-2 exec vitest run src/routes/authed/staff/profiles-new.test.tsx
pnpm --filter front-2 exec playwright test e2e/staff-profiles.spec.ts --reporter=line
```

Expected: FAIL because current profile permission UI is a checkbox list, not the handoff panel.

- [ ] **Step 3: Implement profiles list/detail**

Use the same admin header/table/card primitives as staff users. Replace generic profile cards with frame-card sections, status/count chips, grouped permissions, and mobile rows.

- [ ] **Step 4: Implement permission assignment panel**

Match artboard 1e:

- Header with user/profile context, 240x36 search, All profiles select.
- Two-column desktop split, 1px divider.
- Group headers with checkbox, count, chevron.
- Permission rows with key, description, checkbox, Locked and Override tags.
- Footer summary and Reset to role defaults / Apply changes.

Use existing `useStaffPermissionCatalogQuery`, `useStaffProfilePermissionKeysQuery`, and create-profile mutation paths. Locked/override state may be derived client-side from selected vs default sets until the API exposes richer metadata.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter front-2 exec vitest run src/routes/authed/staff/profiles-new.test.tsx 'src/routes/authed/staff/profiles/$profileId.test.tsx'
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec playwright test e2e/staff-profiles.spec.ts e2e/gray-ui-visual.spec.ts --reporter=line
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/front-2/src/routes/authed/staff/profiles.tsx apps/front-2/src/routes/authed/staff/profiles-new.tsx 'apps/front-2/src/routes/authed/staff/profiles/$profileId.tsx' apps/front-2/src/routes/authed/staff/profiles-new.test.tsx 'apps/front-2/src/routes/authed/staff/profiles/$profileId.test.tsx' apps/front-2/e2e/staff-profiles.spec.ts apps/front-2/e2e/gray-ui-visual.spec.ts
git commit -m "feat(front-2): match profile permission artboards"
```

---

### Task 8: State Surfaces And Responsive Acceptance

**Files:**
- Modify: `apps/front-2/src/components/ui/state-surface.tsx`
- Modify: `apps/front-2/src/components/table/data-table.tsx`
- Modify: `apps/front-2/src/components/error-views/AppErrorView.tsx`
- Modify: `apps/front-2/src/styles/app.css`
- Modify: `apps/front-2/e2e/gray-ui-visual.spec.ts`

- [ ] **Step 1: Add state screenshots**

Ensure visual smoke captures:

```ts
staff-users-no-match.png
staff-users-loading.png
staff-users-error.png
staff-user-detail-mobile.png
staff-user-form-mobile.png
destructive-confirm-dialog-mobile.png
```

- [ ] **Step 2: Run visual smoke and verify failure**

Run: `pnpm --filter front-2 exec playwright test e2e/gray-ui-visual.spec.ts --reporter=line`

Expected: FAIL for new state screenshot routes or selectors.

- [ ] **Step 3: Implement state surfaces**

Match artboard 1f:

- Empty list: centered 48px icon tile, 14px title, 12px body max-width 300, outline CTA.
- No results: focused search ring, query mention, Clear search & filters secondary action.
- Skeleton: 7 rows h43 with avatar circle, text bars, pill bars, shimmer.
- Inline errors: rose banner with title/body.
- Page error: 52px rose icon tile, retry/status actions, 11px mono error id.

- [ ] **Step 4: Implement responsive acceptance rules**

Desktop, tablet, and mobile must satisfy:

- No overlapping text/buttons at 390, 768, 834, 1280, and 1440 widths.
- Mobile list uses rows, not squeezed desktop table.
- Mobile form has h40 fields and two 44px footer buttons.
- Mobile dialog width is `calc(100% - 32px)` and footer buttons stack.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter front-2 typecheck
pnpm --filter front-2 test
pnpm --filter front-2 check:design-system
pnpm --filter front-2 exec playwright test e2e/shell.spec.ts e2e/table.spec.ts e2e/staff-invitations.spec.ts e2e/staff-profiles.spec.ts e2e/gray-ui-visual.spec.ts --reporter=line
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/front-2/src/components/ui/state-surface.tsx apps/front-2/src/components/table/data-table.tsx apps/front-2/src/components/error-views/AppErrorView.tsx apps/front-2/src/styles/app.css apps/front-2/e2e/gray-ui-visual.spec.ts
git commit -m "feat(front-2): complete staff admin responsive states"
```

---

### Task 9: Final Review Packet And Acceptance Gate

**Files:**
- Create: `.dump/design/front-2-staff-admin-handoff-review.md`
- Modify: `docs/superpowers/plans/2026-07-08-front-2-staff-admin-design-handoff.md` only if implementation discoveries require plan corrections

- [ ] **Step 1: Run full local gate**

Run:

```bash
pnpm --filter @org/shared-ts test
pnpm --filter front-2 typecheck
pnpm --filter front-2 check:design-system
pnpm --filter front-2 test
```

Expected: all pass.

- [ ] **Step 2: Run serialized Docker Playwright gate**

Run:

```bash
docker compose -f apps/front-2/docker-compose.test.yml up -d --build
pnpm --filter front-2 exec playwright test e2e/shell.spec.ts e2e/table.spec.ts e2e/staff-invitations.spec.ts e2e/staff-profiles.spec.ts e2e/gray-ui-visual.spec.ts --reporter=line
docker compose -f apps/front-2/docker-compose.test.yml down -v
```

Expected: all pass and Docker stack is stopped at the end.

- [ ] **Step 3: Captain visual inspection**

Open or inspect generated screenshots under `apps/front-2/test-results/gray-ui/` and compare against handoff artboards 1a-1i. The pass criteria are:

- yellow chrome primary, Geist/zinc/yellow palette, and 48/272 shell are visible;
- staff users desktop/tablet/mobile match artboards 1a/1h/1i structurally;
- user detail has identity header, tabs, body grid, side account card, and danger zone;
- invite flow uses modal-style form/review/sent panels;
- permission assignment uses grouped dense rows and footer summary;
- destructive dialog is blurred, 28px radius, and soft red.

- [ ] **Step 4: Write review packet**

Create `.dump/design/front-2-staff-admin-handoff-review.md` with:

```md
# Front-2 Staff Admin Handoff Review Packet

Baseline: feat/front-2-gray-ui-reset
Design source: .dump/design_handoff_publyapp_staff_admin/README.md
Canvas source: .dump/design_handoff_publyapp_staff_admin/PublyApp Staff Admin.dc.html

Verification:
- pnpm --filter @org/shared-ts test: PASS
- pnpm --filter front-2 typecheck: PASS
- pnpm --filter front-2 check:design-system: PASS
- pnpm --filter front-2 test: PASS
- Playwright shell/table/invitations/profiles/gray-ui-visual: PASS

Reviewer request:
Review origin/develop..HEAD for design fidelity, HeroUI correctness, accessibility, responsive behavior, and regressions. Return blocking findings first. End with VERDICT: APPROVED only if no blocking issues remain.
```

- [ ] **Step 5: Claude review**

Run Claude Opus or Sonnet review against `origin/develop..HEAD`, using the review packet and the handoff README. Reviewer must not be OpenCode/DeepSeek.

Expected: `VERDICT: APPROVED` or actionable blocking findings.

- [ ] **Step 6: Fix loop**

For each blocking finding, dispatch OpenCode DeepSeek to fix, rerun the relevant targeted tests plus `pnpm --filter front-2 typecheck`, then rerun Claude review. Stop only when review returns `VERDICT: APPROVED`.

- [ ] **Step 7: Final status**

Report the branch, commits, verification commands, screenshot locations, and remaining nonblocking follow-ups. Do not push or merge without explicit Radan authorization.
