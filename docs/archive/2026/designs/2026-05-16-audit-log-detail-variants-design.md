Status: Historical — not normative
Original location: docs/superpowers/specs/2026-05-16-audit-log-detail-variants-design.md
Archive reason: Completed design retained only for architectural decision history.
Superseded by: apps/front is retired; apps/front-2 and docs/guides/front-2/conventions.md are current.

# Audit Log Detail Page — Layout Variants Design

> Historical PR #401 working artifact. Do not execute this as a current
> implementation plan without first checking the live code and AGENTS.md-linked
> guides.

## Context

The Staff audit log detail page at
`apps/front/src/routes/authed/staff/audit-logs/details/staff-audit-log-details-page.tsx`
currently renders the event inside a single 800px-wide `<Card>` with a flat 2-column
key/value grid and a tiny ID caption at the bottom. The visual treatment is
"under expectations" — no hero for the action, IDs buried, no semantic category color,
and a hard-coded width that makes the card feel cramped on wider screens. The
information and structure are otherwise fine — pivots, related events, and target
resolution are explicitly out of scope.

Other Staff detail pages (e.g. `tenant-details-general-page.tsx:107`) use the
`<Stack spacing={3}>` page-level pattern with multiple `<Card>` sections instead of a
single outer Card. Today's audit-log detail page is the outlier.

Rather than picking one new layout up front, the user wants all three candidates
implemented behind a URL-bound switcher so the final choice is made by trying them with
real data.

## Decision

Refactor the detail page so the existing data flow is preserved but the success branch
delegates to one of three layout variants:

- `sectioned` — one outer `<Card>` with a `background.neutral` hero block, then
  `<Divider>`-separated sections (Actor, Context grid, Payload).
- `split` — page-level `<Stack>` with a chrome-less Hero, then a `<Grid container>`
  splitting Overview (Actor + Context) from Payload. Stacks below `md`.
- `stacked` — page-level `<Stack>` with a chrome-less Hero, then three discrete
  `<Card>` sections (Overview, Context, Payload). Matches the rest of the app's
  detail-page idiom.

The active variant is read from a `?variant=…` query parameter via nuqs. A small
`<ToggleButtonGroup>` next to the breadcrumb writes the param. `stacked` is the
default because it matches the app's `<Stack> + Cards` convention.

The hard-coded `width: 800` on the Card goes away. Each variant lets the existing
`<DashboardContent maxWidth="lg" compact>` define the width envelope.

## URL Contract & Variant Switcher

- nuqs param shape:
  `useQueryState('variant', parseAsStringLiteral(['sectioned','split','stacked']).withDefault('stacked'))`
- Invalid or missing value → silently falls back to `stacked` (default `parseAsStringLiteral` behavior).
- Param lives only on the audit-log detail route; it is not propagated through the
  breadcrumb "Audit logs" link.
- Switcher UI:
  - `<ToggleButtonGroup size="small" exclusive>` aligned to the right of the page heading
  - Three `<ToggleButton>`s labeled `Sectioned · Split · Stacked` (textual, not iconified)
  - Theme-native styling — no custom palette
  - Rendered inside the page chrome (between `CustomBreadcrumbs` and the
    `QueryDisplay`), not inside any variant
- The switcher is always visible (even during loading / error / empty) so the user can
  flip variants without re-fetching.

## Reusable Building Blocks

All new files live in `apps/front/src/routes/authed/staff/audit-logs/details/_parts/`.

| File | Responsibility |
| --- | --- |
| `audit-log-hero.tsx` | Hero block: single category `<Chip>` (color from the category helper) + monospace action title + absolute timestamp + relative timestamp. Caller controls outer chrome (the `sectioned` variant wraps it inside the Card with a `background.neutral` `bgcolor`; the other two render it page-level with no wrapper). |
| `audit-log-actor.tsx` | Actor block: small `<Avatar>` (initials, `primary.lighter` background, `primary.darker` text) + name + email. Falls back to `-` when fields are null. |
| `audit-log-context-grid.tsx` | 2-column `<Grid>` of label/value cells. Takes a `fields` prop — `Array<'ip' \| 'userAgent' \| 'targetId' \| 'eventId'>` — so each variant chooses which cells to render. Long values truncate with ellipsis and reveal in a `<Tooltip>` on hover. |
| `audit-log-payload.tsx` | JSON viewer: pretty-printed via `JSON.stringify(JSON.parse(details), null, 2)` with a `try/catch` fallback to the raw string. Rendered in a `background.neutral` well with `max-height: 360px` and overflow auto. Hidden entirely when `details` is null. |
| `audit-log-action-category.ts` | Pure helper: `categorizeAuditAction(action: string): { kind: string; color: 'success' \| 'warning' \| 'error' \| 'info' \| 'default'; }`. See "Action Category Mapping" below. |
| `audit-log-variant-switcher.tsx` | The `<ToggleButtonGroup>` reading/writing the nuqs `variant` param. |

Each block takes the relevant slice of `AuditLogDetail` (or the full object) as props.
No querying inside blocks. No i18n strings hard-coded — use `useTranslate` and the
existing keys (`action`, `user`, `ip-address`, `user-agent`, `target-id`, `details`,
`created-at`) plus a few new ones for the variant switcher labels and the hero status
chip text.

## Variant Compositions

Three sibling components, all arrow-component, all under the same `_parts/` folder:

- **`audit-log-detail-sectioned.tsx`**
  - One `<Card>` with no `width` override.
  - Vertical layout inside the Card:
    `<Hero bgcolor="background.neutral" />` → `<Divider />` → `<Actor />` →
    `<Divider />` → `<ContextGrid fields={['ip','userAgent','targetId','eventId']} />` →
    `<Divider />` → `<Payload />`.
  - The Hero block gets visual emphasis through the neutral background tint, not the
    typography (which is the same across all variants).

- **`audit-log-detail-split.tsx`**
  - Page-level `<Stack spacing={3}>`.
  - Chrome-less `<Hero />` at the top.
  - `<Grid container spacing={3}>` below with two `<Grid item>`s:
    - Left (`xs=12`, `md=7`) → `<Card>` containing `<Actor />` +
      `<ContextGrid fields={['ip','userAgent','targetId','eventId']} />`.
    - Right (`xs=12`, `md=5`) → `<Card>` containing `<Payload />` (or a small
      "No payload" empty state when null).
  - Stacks vertically below the `md` breakpoint.

- **`audit-log-detail-stacked.tsx`**
  - Page-level `<Stack spacing={3}>`.
  - Chrome-less `<Hero />` at the top.
  - Three discrete `<Card>` sections in order:
    - `<Card>` Overview — `<Actor />` plus
      `<ContextGrid fields={['targetId','eventId']} />`.
    - `<Card>` Context — `<ContextGrid fields={['ip','userAgent']} />`.
    - `<Card>` Payload — `<Payload />` (Card is omitted when `details` is null).
  - Matches the existing `<Stack> + Cards` detail-page pattern.

Each composition takes `(auditLog: AuditLogDetail)` and renders. No conditional logic
beyond null/empty handling on individual fields.

## Page-Level Wiring

`staff-audit-log-details-page.tsx` after the refactor:

1. Reads `logId` from `useParams()` and validates as today (early `<View400>` on missing).
2. Renders the breadcrumb header.
3. Renders `<AuditLogVariantSwitcher />` in the same header row (right-aligned).
4. Renders `<QueryDisplay>` exactly as today (skeleton / error / empty unchanged).
5. The success branch reads the current `variant` from nuqs and renders the matching
   composition with `auditLog` as the only prop.

The skeleton stays as the existing one (it covers all three variants well enough
because the rough vertical rhythm matches). No per-variant skeletons.

## Action Category Mapping

`audit-log-action-category.ts` parses the dotted action string and returns a
`{ kind, color }` tuple consumed by `<Hero />` to pick the category chip color and
optional status chip.

Rules (first match wins):

| Action shape | `kind` | `color` |
| --- | --- | --- |
| `auth.login.succeeded` | `Auth` | `success` |
| `auth.login.failed` | `Auth` | `error` |
| `auth.*` (other) | `Auth` | `info` |
| `*.deleted` / `*.removed` / `*.revoked` | derived from first segment, title-cased | `error` |
| `*.suspended` | derived from first segment | `warning` |
| `*.reactivated` | derived from first segment | `success` |
| `*.created` / `*.updated` / `*.accepted` / `*.assigned` / `*.unassigned` | derived from first segment | `default` |
| `impersonation.*` | `Impersonation` | `warning` |
| `system.*` | `System` | `info` |
| fallback | first segment title-cased, or `Event` if empty | `default` |

The helper is pure, returns synchronously, and is unit-testable in isolation. The
`kind` label is rendered as-is from the helper (no separate i18n key per category in
this iteration; adding `audit-category-*` keys is left for a follow-up if the labels
need translation). The mapping table intentionally does not enumerate every
`AuditActions.*` constant — it derives the category from the verb suffix so new actions
added on the backend pick up a sensible default without a frontend code change.

## Theme & Style Anchors

All variants must:

- Use only theme tokens: `text.primary`, `text.secondary`, `divider`,
  `background.neutral`, `background.paper`, `primary.lighter` / `primary.darker`, and
  the semantic palette (`success` / `warning` / `error` / `info`) via `<Chip color=…>`.
- Use the existing typography scale — no custom font sizes for headings. The action
  title in the Hero uses `Typography variant="h5"` with `fontFamily: 'monospace'`.
- No gradients. No dark-mode flips. No custom backgrounds outside theme tokens.
- Avatar fallback color is the muted neutral treatment used elsewhere in the codebase
  (per the existing "first-column avatar fallback" convention in `AGENTS.md`).
- Respect `compact` mode on the `<DashboardContent>` wrapper (already on the page).

## Out of Scope

The following are deliberately deferred and will be tracked as separate work:

- The list-page drawer with the same content (the "quick view" path) — separate
  follow-up; this spec focuses only on the permalink detail page.
- Target resolution (looking up the target type/name from `targetId`).
- Related-events pivots ("show all events by this user", "show next/previous event in
  this session").
- Backend action category metadata. Categorization stays a frontend concern for now.

## Testing

Frontend verification only — no backend changes:

```bash
just tsc-front
just check-write
just knip
```

Manual browser smoke checks:

- Load a real event detail; flip through `?variant=sectioned`, `?variant=split`,
  `?variant=stacked` and confirm the page recomposes without remounting the query.
- Omit the `variant` param; confirm `stacked` renders by default.
- Pass `?variant=bogus`; confirm `stacked` still renders (no error).
- Confirm the switcher is visible during loading, error, and empty states (it lives
  outside the `<QueryDisplay>`).
- Confirm hero category chip color matches the action verb (try a `auth.login.failed`,
  a `*.deleted`, a `*.suspended`, a `*.created`).
- Confirm `details === null` hides the Payload block in all three variants without
  leaving a dangling Divider or empty Card.

No new unit tests are required for the variant compositions themselves (they are pure
presentational). The category helper warrants a small unit test if a testing
infrastructure exists for frontend pure functions; otherwise rely on type checking and
manual verification.

## Open Questions

None. Switcher placement (in-header), default variant (`stacked`), action category
mapping (verb-derived), and switcher labels (Sectioned / Split / Stacked) were all
resolved during brainstorming.
