# Frontend Route File Organization

This guide defines how route-local files should be organized under
`apps/front/src/routes/**`.

## Mental Model

Use the smallest boundary that matches the component's real ownership.

- `_parts` means private implementation pieces for one route, page, tab, or route
  segment.
- `_components` means reusable route-family components with a stable local API.

Do not use `_components` as a generic dumping ground for files extracted from a
large page. Extraction alone does not make something reusable.

## Use `_parts` For Page Implementation

Put files in `_parts` when they are tied to one page or route segment.

Common examples:

- page-specific forms and form sections
- page-specific tables, toolbars, row actions, selection actions, and export
  dialogs
- page-specific drawers, dialogs, panels, cards, and details sections
- route-local hooks, controllers, helpers, and types
- components that call route-specific query or mutation hooks
- components that derive route params with `useParams()` or depend on outlet
  context from the current page

If a file would be hard to reuse without renaming its props, replacing its query
hooks, or changing its route assumptions, it belongs in `_parts`.

## Use `_components` For Route-Family Reuse

Put files in `_components` when they are intentionally shared by sibling routes
inside the same route family and expose a reusable API.

Common examples:

- marketing components reused across several marketing pages
- auth components reused by multiple auth flows
- shared route-family empty/error/loading views
- reusable skeletons for a route family or page shell
- generic cards, badges, toggles, and layout helpers that do not own a
  page-specific workflow

`_components` files should not silently depend on a single page's params,
queries, mutations, or route outlet context. Pass explicit props instead, or keep
the file in `_parts`.

## Skeletons And Loading Views

Skeletons can live in `_components` when they model reusable route state, such as
a shared page shell or route-family loading view.

Use `_parts` when the skeleton is only a private companion to one table, form, or
page section.

## Promotion Rules

Move a file from `_parts` to `_components` only when reuse is real:

- at least two sibling route files import it, or
- the component has a route-family role that is intentionally shared, or
- the component has a stable generic API and no hidden page workflow.

Move a file from `_components` back to `_parts` when it is only used by one page,
owns page-specific behavior, or depends on one route's params/query/mutation
shape.

If a component needs to be reused outside the route family, promote it out of
`routes/**` into the appropriate shared frontend component or feature location
instead of importing across unrelated route trees.

## Import Direction

Route pages may import from their local `_parts` and ancestor route-family
`_components`.

Avoid importing another page's `_parts`. Shared behavior should be promoted to a
route-family `_components` directory or a shared frontend module first.

## Naming

Use names that describe the ownership boundary:

- `_parts/tenant-user-companies-table.tsx`
- `_parts/staff-user-row-actions.tsx`
- `_components/marketing-hero.tsx`
- `_components/invalid-link-view.tsx`

If the name contains one concrete page workflow, entity mutation, or table action,
it is usually a `_parts` file.
