# Frontend Domain Layer

This repo uses a small frontend “domain layer” to centralize **pure product rules** (permissions, workflow decisions, derived calculations, and DTO normalization) so they don’t get duplicated across routes/components/hooks.

## Where it lives

- `apps/front/app/lib/domain/**`

Recommended structure:

```
apps/front/app/lib/domain/
ÀÄÄ features/
    ÃÄÄ staff/
    ÃÄÄ tenant/
    ÀÄÄ shared/
```

## Hard rules (non-negotiable)

1. `lib/domain/**` is **pure TypeScript**: deterministic, side-effect free.
2. `lib/domain/**` MUST NOT import from:
   - `apps/front/app/routes/**`
   - `apps/front/app/components/**`
   - `apps/front/app/lib/react-query/**`
   - `apps/front/app/lib/zustand/**`
   - any router APIs (`useParams`, loaders/actions) or networking (`fetch`)
3. Domain functions MUST NOT return translated strings or UI formatting.
   - Return stable **codes/keys**; UI translates and styles them.
4. Prefer **decision objects** over booleans.
   - Example: `{ allowed: false, reason: 'ALREADY_REVOKED' }`

## What belongs in domain

- **Permissions/capabilities** (can the user do X?)
- **Workflow rules** (valid status transitions, allowed actions)
- **Derived business calculations** (quotas/limits, totals, eligibility)
- **Cross-entity policies** (plan/feature-flag/org-setting interpretation)
- **DTO mapping/normalization** (optional; MUST stay fetch-free and UI-free)

## What does not belong in domain

- React components, hooks, JSX
- TanStack Query query keys/fetchers
- Zustand stores/slices
- Router glue
- UI-only formatting (colors, “pretty” dates, component props)

## Example pattern (recommended)

Use *data-in* → *decision-out* functions:

- Input: API DTOs (`packages/js-client/src/models`) + primitives
- Output: `{ allowed: boolean, reason?: string }`, `{ status: string }`, or discriminated unions

The UI layer then decides:

- translations (`t(reason)`)
- colors/labels
- which buttons to show

## Inventory

See `docs/front/domain-layer-inventory.md` for current candidates that should be moved into `lib/domain/**`.

