# AI Agent Preferences (Repo-Specific)

This guide captures **repository-specific preferences** for AI coding assistants.
It is intended to reduce review churn by making repeated feedback explicit.

These preferences are **additive** to existing repo guides (especially):
- `docs/guides/frontend-coding-standards.md`
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

- Table rows should **always show actions**; if unavailable, show them **disabled + greyed out** (do not hide the action column or render nothing).
- Avoid heavy repeated text buttons in dense lists (e.g., `Assign` repeated per row).
  - Prefer subtle icon buttons with tooltips.
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
