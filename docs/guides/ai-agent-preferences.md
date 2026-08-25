# AI Agent Preferences (Repo-Specific)

> **MIXED GUIDE — read the split before you follow anything.**
> **Normative:** the C#/backend and general-review preferences.
> **Not normative:** the "Frontend (React / MUI)" section and any `apps/old-front/src` path in this
> guide. `apps/old-front` was retired 2026-08-22 (tag `old-front-final`) — the retired MUI + React Router v7 app — not deployed, and the owner will
> not edit it again. Frontend work happens in `apps/front` per
> [`front/index.md`](front/index.md) and [`front/conventions.md`](front/conventions.md).
> Restating the still-useful frontend preferences in front terms is deferred to a later wave of
> the documentation remediation.

This guide captures **repository-specific preferences** for AI coding assistants.
It is intended to reduce review churn by making repeated feedback explicit.

These preferences are **additive** to existing repo guides (especially):
- `docs/guides/front/conventions.md`
- `docs/guides/frontend-error-handling.md`
- `docs/guides/api-module-structure.md`
- `docs/guides/csharp-coding-standards.md`

If a preference below conflicts with an existing guide, follow the existing guide (or ask).

## General

- Prefer **minimal diffs** and avoid stylistic churn.
- Do not run formatting/linting commands (`oxlint`, `oxfmt`, etc.) unless explicitly requested.
- Avoid large refactors unless they directly serve the task; when refactoring, keep it mechanical and behavior-preserving.
- Avoid nested ternaries; use `if`/`else`, small helpers, or early returns.

## Frontend (React / MUI)

### Component Boundaries

- Keep **route components thin**.
  - Routes should ideally: read `useParams`/outlet context, render page shell + composed children.
  - State and queries should live where they are used (self-contained composition), not plumbed through multi-hop props.
- Prefer **component composition** over prop drilling.
  - If a component can derive `profileId` via `useParams`, do that instead of passing it down.
  - If a component owns a drawer, it should own open/close state as well.

### Extracting Components (Same File vs `parts/`)

- Default: keep small, single-use helpers in the same file.
- Extract to `parts/` when:
  - the file becomes hard to review (large/complex), or
  - the extracted part is a coherent unit (e.g., an assignment drawer, a table, a form section).
- When extracting, preserve behavior and avoid changing APIs unnecessarily.

### Tables, Drawers, Actions

- Table rows should **always show actions**. If an action is not relevant for the current
  row/state/permission, render it disabled and show a tooltip explaining why; do not hide
  the action column or render nothing.
  - If a row action owns behavior/state (mutation, dialog, drawer, loading, optimistic
    update), make it its own focused action component. The row action group should compose
    action components, not own every action's internal state.
  - Dense repeated row action icon buttons should use neutral grey styling by default, not
    semantic `warning`/`success`/`primary` colors. Use existing disabled tokens first
    (`text.disabled`, `action.disabled`, or the component's disabled state). Use normal
    neutral tokens (`text.secondary`, `action.active`, `grey['500Channel']` with
    `varAlpha`) for enabled non-destructive repeated row action icons.
  - Destructive row action icons (for example delete) may use the theme danger/error
    styling when muting them would hide the risk of the action. Keep disabled destructive
    row actions on disabled tokens.
  - Destructive bulk delete actions and destructive confirmation CTAs should still use the
    theme danger/error styling (`error` / `error.main`). Do not mute destructive delete
    actions merely because they originated from a table.
  - Relationship-removal actions that are reversible in context (for example unassigning a
    user from a profile) should stay neutral unless the product explicitly treats them as
    destructive. Dense row icons can use `text.secondary`, but bulk menu labels and contained
    confirmation CTAs must still look enabled (`text.primary` or default contained styling).
  - Keep semantic colors for status badges, validation, dedicated danger-zone context, and
    other non-action state indicators where the color communicates state rather than click
    priority.
- Avoid heavy repeated text buttons in dense lists (e.g., `Assign` repeated per row).
  - Prefer subtle icon buttons with tooltips.
- Mutable enum/status columns should expose their primary change action from the cell itself when the repo already has an inline menu pattern for that entity type.
  - Use the selected-item popover/menu pattern: current value selected, menu anchored under the trigger, no disabled current-value placeholder.
  - Keep suspend/reactivate or level/role changes in the status/level cell instead of duplicating them in the row action cell.
- Do not put a plain "view details" link in dense row action cells when a quick preview drawer pattern exists.
  - Use `solar:list-bold` for the quick preview/details action.
  - Put the explicit full details link inside the drawer.
- For drawer UX:
  - Make the header (title + search) fixed.
  - Make only the list scrollable (use the shared `Scrollbar` component when appropriate).

### Popovers / Menus

- Popovers/menus should open from a predictable anchor:
  - Prefer opening at the **bottom of the trigger** (not overlapping the trigger or drifting).
- Menu state should not be confusing:
  - Do not auto-focus an unrelated option on open.
  - Do not render the current value as a disabled/greyed-out item if it harms clarity; prefer a clear “current” indicator or omit it.

### i18n

- When calling `t(...)`, do not pass `defaultValue` fallbacks.
  - Add the missing keys to `common.en.json` / `common.fr.json` instead.
- Backend `translationKey` values must be translated through the correct namespace/pattern.
  - Prefer the repo’s centralized failure-message pattern (`toApiFailure`, `getFailureMessage`, etc.) over ad-hoc translation plumbing.

### Lodash Usage

- Do not import the full lodash bundle (`import _ from 'lodash'`).
  - Prefer per-function imports: `import toStr from 'lodash/toString'`, etc.

### Reuse Utilities

- Reuse existing utilities (example: `getUserFullName`) instead of rewriting equivalents.
- If an existing utility is missing behavior, prefer improving the shared utility rather than duplicating logic locally.

### Import Paths and Barrel Files

- Prefer direct imports from the concrete frontend module file.
  - Example: `#app/components/iconify/iconify.tsx` instead of
    `#app/components/iconify/index.ts`.
- Do not add new hand-written frontend barrel files under `apps/front/src` beyond the allowlist (`packages/scripts-ts/src/check-frontend-barrels.ts`; retired `apps/old-front` allowlist archived)
  default.
- Keep a frontend barrel only when it is an intentional, narrow public facade
  with a documented reason.
- Do not manually edit generated Kiota client barrels under `packages/client-ts`.

## Backend (API)

### Error Semantics

- Prefer consistent RFC 7807 responses and established repo helpers (`TypedProblems.*` etc.).
- Validation rules should return `422` Validation Problem where appropriate.
  - Do not use `401` for anything except invalid/missing session (frontend treats `401` as logout).

### Status/Enums Consistency

- Prefer enum-based status fields over boolean flags when modeling lifecycle state.
- If helper methods exist on entities (e.g., `IsSuspended()`), prefer them over raw `Status == ...` comparisons.

### Permission Definitions

- Permission definition classes should use one fluent assignment per permission, mirroring
  `InvitationPermissionsForStaff`.
- Prefer:
  `Permission.Create*Permission(...).SetTranslation(...).SetTranslation(...)`
- Do not create a permission and then reassign the same property multiple times to append
  translations.
- Keep permission-definition blocks compact and visually consistent across modules.

## Review Hygiene

- When a change is prompted by review feedback, implement exactly the feedback without bundling unrelated cleanups.
- Add focused comments only when the code is genuinely non-obvious, especially after dense refactors.
