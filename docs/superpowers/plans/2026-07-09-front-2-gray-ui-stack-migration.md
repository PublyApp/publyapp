# Front-2 Gray UI Stack Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove HeroUI from `apps/front-2` and rebuild staff/admin UI on the Gray UI CSM shadcn/Base UI styling stack.

**Architecture:** Keep TanStack Start, Vite, Router, Query, Table, and PublyApp data contracts. Replace the UI layer with local shadcn-style primitives adapted from `/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui`, then prove the system on Staff Users list/detail before scaling to all staff/admin routes.

**Tech Stack:** React 19, TanStack Start, Vite, Tailwind v4, `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `shadcn`, `@tabler/icons-react`, Vitest, Playwright.

---

## Source Of Truth

- Stack decision spec: `docs/superpowers/specs/2026-07-09-front-2-gray-ui-stack-migration-design.md`
- Visual handoff: `.dump/design_handoff_publyapp_staff_admin/README.md`
- Design canvas: `.dump/design_handoff_publyapp_staff_admin/PublyApp Staff Admin.dc.html`
- Gray UI reference: `/home/radan/Projects/PublyApp/.references/gray-ui-csm`
- Current front-2 package: `apps/front-2/package.json`
- Current guard: `apps/front-2/scripts/check-design-system.mjs`

## Execution Route

- Use branch `feat/front-2-gray-ui-reset`.
- Do not touch `develop` directly.
- Prefer clone-local worktrees for worker execution under `publyapp/.worktrees/<task>`.
- Implementer route: Codex implementation lane from the repo adapter unless Radan explicitly changes it.
- Reviewer route: different-family reviewer when available; if unavailable in tooling, stop before merge/integration and request external review.
- One commit per accepted task.
- Do not remove HeroUI dependencies until the zero-import gate passes.

## File Structure

- Create `apps/front-2/components.json`: shadcn metadata adapted to front-2 aliases.
- Create `apps/front-2/src/lib/utils.ts`: `cn()` utility.
- Create local primitives under `apps/front-2/src/components/ui/`.
- Modify `apps/front-2/src/styles/app.css`: remove HeroUI import, add Gray UI Tailwind imports/tokens.
- Modify `apps/front-2/scripts/check-design-system.mjs` and test file to enforce the new stack.
- Modify `apps/front-2/src/components/app-shell/app-shell.tsx`: Base/shadcn shell UI.
- Modify `apps/front-2/src/components/table/data-table.tsx`: local table/select/button primitives.
- Modify `apps/front-2/src/components/field/*.tsx`: local field primitives.
- Modify routes under `apps/front-2/src/routes/authed/staff/**`: staff proof slice first, then route family migration.
- Modify `apps/front-2/package.json` and workspace lockfile through `pnpm add/remove`.

---

### Task 1: Stack Foundation And Guard Pivot

**Files:**
- Create: `apps/front-2/components.json`
- Create: `apps/front-2/src/lib/utils.ts`
- Modify: `apps/front-2/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/front-2/src/styles/app.css`
- Modify: `apps/front-2/scripts/check-design-system.mjs`
- Modify: `apps/front-2/scripts/check-design-system.test.mjs`

- [ ] **Step 1: Add Gray UI dependencies**

Run from repo root:

```bash
pnpm --filter front-2 add @base-ui/react@^1.3.0 @tabler/icons-react@^3.41.1 class-variance-authority@^0.7.1 clsx@^2.1.1 tailwind-merge@^3.5.0 tw-animate-css@^1.4.0 shadcn@^4.1.2
```

Expected: `apps/front-2/package.json` contains the new dependencies and `pnpm-lock.yaml` updates.

- [ ] **Step 2: Add shadcn metadata**

Create `apps/front-2/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-luma",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/app.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "tabler",
  "rtl": false,
  "aliases": {
    "components": "~/components",
    "utils": "~/lib/utils",
    "ui": "~/components/ui",
    "lib": "~/lib",
    "hooks": "~/hooks"
  },
  "menuColor": "inverted-translucent",
  "menuAccent": "subtle",
  "registries": {}
}
```

- [ ] **Step 3: Add `cn()`**

Create `apps/front-2/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

- [ ] **Step 4: Pivot global CSS imports and tokens**

In `apps/front-2/src/styles/app.css`, replace `@import '@heroui/styles';` with:

```css
@import 'tw-animate-css';
@import 'shadcn/tailwind.css';
```

Keep the existing Tailwind import. Add or preserve the Gray UI token names from the reference:

```css
@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}
```

Keep the handoff token values already present for staff/admin measurements.

- [ ] **Step 5: Update design-system guard tests**

In `apps/front-2/scripts/check-design-system.test.mjs`, add tests that fail if:

```js
assert.equal(
  violations.some((violation) => violation.ruleId === 'no-heroui-import'),
  true,
);
```

Use fixture source containing:

```tsx
import { Button } from '@heroui/react';
```

Also update the shadcn-token test so `text-muted-foreground`, `border-border`, `bg-background`, and `text-primary-foreground` are allowed.

- [ ] **Step 6: Update design-system guard implementation**

In `apps/front-2/scripts/check-design-system.mjs`:

```js
{
  id: 'no-heroui-import',
  message: 'Use local Gray UI primitives instead of HeroUI.',
  appliesTo: (relativePath) => relativePath.startsWith('src/'),
  patterns: [/from ['"]@heroui\/react['"]/, /import ['"]@heroui\/styles['"]/],
}
```

Change the old `no-shadcn-token-alias` rule into an allowlisted migration rule or remove it. Do not fail on the Gray UI token classes.

- [ ] **Step 7: Verify**

Run:

```bash
pnpm --filter front-2 test:design-system-guard
pnpm --filter front-2 typecheck
```

Expected: guard tests pass; typecheck passes. `pnpm --filter front-2 check:design-system` may still fail on existing HeroUI imports until later tasks, and that is acceptable only if documented in the task closeout.

- [ ] **Step 8: Commit**

```bash
git add apps/front-2/components.json apps/front-2/src/lib/utils.ts apps/front-2/package.json pnpm-lock.yaml apps/front-2/src/styles/app.css apps/front-2/scripts/check-design-system.mjs apps/front-2/scripts/check-design-system.test.mjs
git commit -m "chore(front-2): pivot design stack to Gray UI"
```

---

### Task 2: Local UI Primitive Library

**Files:**
- Create: `apps/front-2/src/components/ui/button.tsx`
- Create: `apps/front-2/src/components/ui/input.tsx`
- Create: `apps/front-2/src/components/ui/label.tsx`
- Create: `apps/front-2/src/components/ui/card.tsx`
- Create: `apps/front-2/src/components/ui/badge.tsx`
- Create: `apps/front-2/src/components/ui/avatar.tsx`
- Create: `apps/front-2/src/components/ui/dropdown-menu.tsx`
- Create: `apps/front-2/src/components/ui/select.tsx`
- Create: `apps/front-2/src/components/ui/dialog.tsx`
- Modify: `apps/front-2/src/components/ui/confirm-dialog.tsx`
- Create: `apps/front-2/src/components/ui/tabs.tsx`
- Create: `apps/front-2/src/components/ui/checkbox.tsx`
- Create: `apps/front-2/src/components/ui/switch.tsx`
- Create: `apps/front-2/src/components/ui/table.tsx`
- Create: `apps/front-2/src/components/ui/skeleton.tsx`
- Create: `apps/front-2/src/components/ui/tooltip.tsx`
- Create: `apps/front-2/src/components/ui/separator.tsx`

- [ ] **Step 1: Copy and adapt reference primitives**

Use these reference files:

```text
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/button.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/input.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/label.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/card.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/badge.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/avatar.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/dropdown-menu.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/select.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/confirm-dialog.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/tabs.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/checkbox.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/switch.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/table.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/skeleton.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/tooltip.tsx
/home/radan/Projects/PublyApp/.references/gray-ui-csm/components/ui/separator.tsx
```

Replace reference alias imports:

```ts
import { cn } from '@/lib/utils';
```

with:

```ts
import { cn } from '~/lib/utils';
```

Remove `"use client"` directives unless the file requires them for correctness in TanStack Start.

- [ ] **Step 2: Adapt `ConfirmDialog` public API**

Preserve the current front-2 prop API so existing routes keep compiling during migration:

```ts
export type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  isPending?: boolean;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onOpenChange: (isOpen: boolean) => void;
};
```

Implement it with Base UI dialog primitives or the adapted Gray UI confirm dialog. Destructive action uses `Button variant="destructive"`.

- [ ] **Step 3: Verify**

Run:

```bash
pnpm --filter front-2 typecheck
pnpm --filter front-2 test:design-system-guard
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/components/ui apps/front-2/src/lib/utils.ts
git commit -m "feat(front-2): add Gray UI primitives"
```

---

### Task 3: Product Primitives Without HeroUI

**Files:**
- Modify: `apps/front-2/src/components/ui/product-page.tsx`
- Modify: `apps/front-2/src/components/error-views/*.tsx`
- Modify: `apps/front-2/src/components/query-display.tsx`
- Test: affected component tests

- [ ] **Step 1: Replace HeroUI imports in shared product primitives**

Replace `Button`, `Card`, `Chip`, `Spinner`, and related HeroUI imports with local primitives.

Use:

```ts
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Skeleton } from '~/components/ui/skeleton';
```

Spinner becomes a CSS animated inline element:

```tsx
<span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" aria-hidden="true" />
```

- [ ] **Step 2: Verify**

Run:

```bash
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec vitest run src/components/
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add apps/front-2/src/components
git commit -m "refactor(front-2): move shared primitives off HeroUI"
```

---

### Task 4: App Shell Proof Frame

**Files:**
- Modify: `apps/front-2/src/components/app-shell/app-shell.tsx`
- Modify: `apps/front-2/src/components/app-shell/theme/theme-toggle.tsx`
- Modify: `apps/front-2/src/lib/navigation/route-metadata.tsx`
- Modify: `apps/front-2/src/styles/app.css`
- Test: `apps/front-2/e2e/shell.spec.ts`
- Test: `apps/front-2/src/lib/navigation/route-metadata.test.tsx`

- [ ] **Step 1: Replace rail/topbar controls**

Use local `Button`, `Input`, `Avatar`, `Badge`, `DropdownMenu`, and Tabler icons. Match the handoff:

```text
rail width: 48px
secondary panel width: 272px
rail icon button: 32px, radius 10px
topbar icon button: 36px, full radius
breadcrumb text: 13px
```

- [ ] **Step 2: Preserve shell behavior**

Keep:

```text
secondary panel collapse preference
route metadata based panel visibility
mobile shell behavior
TanStack Link navigation
```

- [ ] **Step 3: Verify**

Run:

```bash
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec vitest run src/lib/navigation/
pnpm --filter front-2 exec playwright test e2e/shell.spec.ts --reporter=line
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/components/app-shell apps/front-2/src/lib/navigation apps/front-2/src/styles/app.css apps/front-2/e2e/shell.spec.ts
git commit -m "feat(front-2): rebuild shell on Gray UI primitives"
```

---

### Task 5: DataTable Without HeroUI

**Files:**
- Modify: `apps/front-2/src/components/table/data-table.tsx`
- Modify: `apps/front-2/src/components/table/sort-descriptor.ts`
- Modify: `apps/front-2/src/components/table/use-row-selection.ts`
- Modify: `apps/front-2/src/components/table/*.test.tsx`
- Test: `apps/front-2/e2e/table.spec.ts`

- [ ] **Step 1: Remove HeroUI table types**

Replace HeroUI `Selection` and `SortDescriptor` types with local types:

```ts
export type TableSelection = 'all' | Set<string>;
export type TableSortDescriptor = {
  column?: string;
  direction?: 'ascending' | 'descending';
};
```

- [ ] **Step 2: Render local table markup**

Use local `Table`, `Button`, `Input`, `Select`, `DropdownMenu`, `Checkbox`, `Skeleton`, and `Badge`. Preserve TanStack Table controller behavior and cursor pagination.

- [ ] **Step 3: Verify**

Run:

```bash
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec vitest run src/components/table/
pnpm --filter front-2 exec playwright test e2e/table.spec.ts --reporter=line
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/components/table apps/front-2/e2e/table.spec.ts
git commit -m "refactor(front-2): move data table off HeroUI"
```

---

### Task 6: Staff Users List And Detail Proof Slice

**Files:**
- Modify: `apps/front-2/src/routes/authed/staff/staff-users.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/staff-users/$userId.tsx`
- Modify: related staff-users tests
- Modify: `apps/front-2/e2e/gray-ui-visual.spec.ts`

- [ ] **Step 1: Implement screen 1a**

Staff Users list must match handoff screen 1a:

```text
page header: 20px/600 title, h20 count badge
toolbar search: 420x40 desktop
filter buttons: h36, radius 14
table card: radius 14, ring shadow
rows: 48px, 13px text, h20 chips
row menu: 196px, radius 14, blurred/translucent popover
footer: 48px, table header bg #fcfcfd via token
```

- [ ] **Step 2: Implement screen 1b**

Staff User detail must match handoff screen 1b:

```text
rail-only shell
56px avatar
22px/600 identity title
underlined tabs
1fr / 372px body grid
14px card radius with ring shadow
danger zone with soft destructive actions
```

- [ ] **Step 3: Verify proof slice**

Run:

```bash
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec vitest run 'src/routes/authed/staff/staff-users*'
pnpm --filter front-2 exec playwright test e2e/gray-ui-visual.spec.ts e2e/table.spec.ts e2e/shell.spec.ts --reporter=line
```

Expected: all pass and screenshots show Gray UI fidelity for 1a/1b.

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/routes/authed/staff/staff-users.tsx 'apps/front-2/src/routes/authed/staff/staff-users/$userId.tsx' apps/front-2/e2e
git commit -m "feat(front-2): prove Gray UI staff users slice"
```

---

### Task 7: Staff/Admin Route Migration

**Files:**
- Modify: `apps/front-2/src/routes/authed/staff/invitations/**`
- Modify: `apps/front-2/src/routes/authed/staff/profiles**`
- Modify: `apps/front-2/src/routes/authed/staff/tenants**`
- Modify: `apps/front-2/src/components/field/*.tsx`
- Modify: matching tests

- [ ] **Step 1: Replace remaining HeroUI route imports**

For each route, replace HeroUI `Button`, `Card`, `Chip`, `Input`, `ListBox`, `Select`, and `Spinner` with local primitives.

- [ ] **Step 2: Convert forms**

Use local `Input`, `Select`, `Checkbox`, `Switch`, `Label`, and field error markup. Match handoff field anatomy:

```text
desktop input: h36, radius 18, 13px text
mobile input: h40, 14px text
error ring: 3px destructive/12
sticky action bar where present
```

- [ ] **Step 3: Verify**

Run:

```bash
pnpm --filter front-2 typecheck
pnpm --filter front-2 test
pnpm --filter front-2 check:design-system
```

Expected: all pass or only documented non-HeroUI migration debt remains.

- [ ] **Step 4: Commit**

```bash
git add apps/front-2/src/routes/authed/staff apps/front-2/src/components/field
git commit -m "refactor(front-2): migrate staff admin routes to Gray UI"
```

---

### Task 8: Remove HeroUI Completely

**Files:**
- Modify: `apps/front-2/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/front-2/scripts/check-design-system.mjs`
- Modify: `apps/front-2/scripts/check-design-system.test.mjs`
- Modify: any remaining source files reported by search

- [ ] **Step 1: Prove zero imports**

Run:

```bash
rg -n "@heroui/react|@heroui/styles|buttonVariants" apps/front-2/src apps/front-2/package.json apps/front-2/src/styles/app.css
```

Expected: no source imports remain except package metadata before removal.

- [ ] **Step 2: Remove dependencies**

Run:

```bash
pnpm --filter front-2 remove @heroui/react @heroui/styles
```

- [ ] **Step 3: Make guard final**

Remove temporary allowlists. `no-heroui-import` must fail on any source import or CSS import.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter front-2 typecheck
pnpm --filter front-2 test
pnpm --filter front-2 check:design-system
pnpm --filter front-2 build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/front-2/package.json pnpm-lock.yaml apps/front-2/scripts/check-design-system.mjs apps/front-2/scripts/check-design-system.test.mjs apps/front-2/src apps/front-2/src/styles/app.css
git commit -m "refactor(front-2): remove HeroUI"
```

---

### Task 9: Visual Acceptance And Cleanup

**Files:**
- Modify: `apps/front-2/e2e/gray-ui-visual.spec.ts`
- Modify: `apps/front-2/test-results/gray-ui/` generated screenshots if tracked by project policy
- Modify: docs/session notes only through the captain

- [ ] **Step 1: Run visual smoke**

Run with the Docker e2e stack serialized:

```bash
docker compose -f apps/front-2/docker-compose.test.yml up -d --build
pnpm --filter front-2 exec playwright test e2e/gray-ui-visual.spec.ts e2e/shell.spec.ts e2e/table.spec.ts --reporter=line
docker compose -f apps/front-2/docker-compose.test.yml down -v
```

Expected: all pass.

- [ ] **Step 2: Manual screenshot review**

Open generated screenshots and compare against:

```text
.dump/design_handoff_publyapp_staff_admin/README.md
.dump/design_handoff_publyapp_staff_admin/PublyApp Staff Admin.dc.html
```

Acceptance requires Staff Users list/detail to read as the same design system, not a loose approximation.

- [ ] **Step 3: Commit final visual cleanup**

```bash
git add apps/front-2/e2e apps/front-2/src apps/front-2/src/styles/app.css
git commit -m "test(front-2): accept Gray UI visual migration"
```

---

## Self-Review

- Spec coverage: the plan covers stack dependencies, local primitives, guardrails, shell, table, proof slice, route migration, HeroUI removal, and visual acceptance.
- Placeholder scan: no task relies on open placeholders or undefined later work.
- Type consistency: local primitive imports consistently use `~/components/ui/*`; utility import uses `~/lib/utils`; HeroUI removal is delayed until zero imports are verified.
