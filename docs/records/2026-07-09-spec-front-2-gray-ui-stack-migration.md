Status: Historical — not normative
Original location: docs/superpowers/specs/2026-07-09-front-2-gray-ui-stack-migration-design.md
Archive reason: Completed design retained only for architectural decision history.
Superseded by: Current apps/front-2 implementation and docs/guides/front-2/conventions.md.

# Front-2 Gray UI Stack Migration Design

## Status

Accepted by Radan on 2026-07-09. This supersedes the HeroUI-targeted parts of
`docs/superpowers/plans/2026-07-08-front-2-staff-admin-design-handoff.md`.

## Goal

Rebuild `apps/front-2` staff/admin UI with the actual styling stack used by the
`gray-ui-csm` reference while keeping PublyApp's existing front-2 application
architecture.

The visual acceptance target is the design handoff in
`.dump/design_handoff_publyapp_staff_admin/README.md` and its design canvas, not
the current HeroUI adaptation.

## Decision

Front-2 keeps:

- TanStack Start, Vite, React 19, TanStack Router, TanStack Query, TanStack Table.
- Existing generated API client, query hooks, route layout, auth/session behavior,
  and URL-state conventions.
- Existing test posture: Vitest for component/unit logic and Playwright for shell,
  table, and visual smoke coverage.

Front-2 removes:

- `@heroui/react`.
- `@heroui/styles`.
- HeroUI component composition, variants, selection types, alert-dialog API, and
  product guard language.
- The lucide-first icon direction for staff/admin surfaces.

Front-2 adopts from `gray-ui-csm`:

- `@base-ui/react` for headless interactive primitives.
- `class-variance-authority`, `clsx`, and `tailwind-merge` for shadcn-style local
  component variants.
- `tw-animate-css` and `shadcn/tailwind.css` for the same Tailwind v4 utility
  surface used by the reference.
- `@tabler/icons-react` as the staff/admin icon system.
- Local components under `apps/front-2/src/components/ui/`, adapted from the
  Gray UI reference rather than consumed as a binary package.

## Migration Principle

This is a component-system migration, not a framework migration. Do not move
front-2 to Next.js, app-router conventions, RSC-only patterns, or Gray UI's route
structure. The reference app is used for component code, tokens, density, motion,
and visual patterns only.

HeroUI may remain installed only during the migration while existing imports are
being replaced. The completed migration must have zero imports from
`@heroui/react` and `@heroui/styles`, and package metadata must no longer list
them.

## Visual Contract

The proof slice is staff/admin screens 1a and 1b from the handoff:

- Staff Users List + Admin Shell.
- Staff User Detail.

These two screens must look like the Gray UI handoff before the migration scales
to invitations, profiles, roles, permissions, tenants, and form/dialog states.
The proof slice is the acceptance gate for whether the stack pivot is working.

Required traits:

- Geist/system typography, zinc grays, yellow chrome primary, dense 13px UI text.
- 48px icon rail and 272px secondary panel.
- Base/shadcn-style buttons, menus, selects, tabs, switches, checkboxes, dialogs,
  table, skeleton, badges, avatars, cards, breadcrumbs, and tooltips.
- 28px blurred modals and soft destructive actions.
- Table rows, toolbar, footer, chips, and row menus matching the handoff density.
- Responsive tablet/mobile behavior from handoff screens 1h and 1i.

## Component Boundaries

Create local primitives under `apps/front-2/src/components/ui/`:

- `button.tsx`
- `input.tsx`
- `label.tsx`
- `card.tsx`
- `badge.tsx`
- `avatar.tsx`
- `dropdown-menu.tsx`
- `select.tsx`
- `dialog.tsx`
- `confirm-dialog.tsx`
- `tabs.tsx`
- `checkbox.tsx`
- `switch.tsx`
- `table.tsx`
- `skeleton.tsx`
- `tooltip.tsx`
- `separator.tsx`

Shared product components in `product-page.tsx` should compose these local
primitives. Route files should avoid one-off visual CSS when a local primitive
exists.

## Guardrails

The design-system guard changes from HeroUI protection to Gray UI protection:

- Forbid `@heroui/react` and `@heroui/styles` imports in `apps/front-2/src`.
- Forbid `@heroui/styles` in `apps/front-2/src/styles/app.css`.
- Forbid new `lucide-react` imports in staff/admin UI once Tabler is available,
  except while untouched legacy files are being migrated.
- Allow shadcn token names such as `text-muted-foreground`, `border-border`,
  `bg-background`, and `text-primary-foreground`.
- Continue forbidding raw internal anchors and native `globalThis.confirm`.
- For product surfaces, prefer local `Select`/`DropdownMenu` primitives over
  native selects.

The guard should support a temporary migration allowlist only when needed to keep
the branch typecheckable between tasks. The final task removes that allowlist.

## Verification

Each task must run the narrow relevant tests plus:

- `pnpm --filter front-2 typecheck`
- `pnpm --filter front-2 test:design-system-guard`
- `pnpm --filter front-2 check:design-system`

The proof slice and final migration also require Playwright visual smoke:

- `pnpm --filter front-2 exec playwright test e2e/gray-ui-visual.spec.ts --reporter=line`
- `pnpm --filter front-2 exec playwright test e2e/shell.spec.ts e2e/table.spec.ts --reporter=line`

Docker-backed Playwright stacks remain serialized.

## Non-Goals

- No migration to Next.js.
- No backend/API contract changes.
- No marketing-site redesign.
- No full dark-mode visual acceptance in this pass; staff/admin light mode is the
  source of truth.
- No wholesale import of Gray UI route/domain code.
