# E2E Test Tags

Every Playwright e2e test file **must** carry at least one `@domain` tag and one `@ticket`
tag on **every** top-level `test.describe` — including the second, third, or any subsequent
sequential top-level `test.describe` in the same file. Nested `test.describe` calls inherit
tags from their parent and need none. Playwright `--grep` filters on the full test title
plus tags; an untagged sibling `describe` is silently excluded. A Vitest guard
(`e2e/__tests__/e2e-tag-guard.test.ts`) enforces this: the build breaks if any top-level
describe is missing a domain tag, uses a domain outside the vocabulary, or lacks a ticket tag.

## Tag vocabulary

| Tag | Scope |
|---|---|
| `@auth` | Login, logout, session lifecycle, tab-sync auth, cold-boot, auth-error, redirect guards |
| `@design` | Design-system chrome, handoff geometry/contrast, drawer description contrast, icon-picker pin contrast/geometry, form scroll geometry, toast contrast, field validation, form action bar |
| `@i18n` | Language, translations, locale switching |
| `@public` | Anonymous/public pages: SEO, CSP, landing page, marketing shell |
| `@security` | SSR auth shell, log-leak prevention, tenant isolation, RBAC |
| `@shell` | App shell chrome, table system, row-action centering, breadcrumb truncation, search input, scroll ownership, grey-UI screenshots |
| `@staff-audit` | Staff audit logs |
| `@staff-invitations` | Staff invitations list and details |
| `@staff-profiles` | Staff profiles list and details |
| `@staff-tenants` | Staff tenants list, create, edit, details, status panel, tenant-portal picker |
| `@staff-users` | Staff users list and details, table system |
| `@staff-dashboard` | Staff dashboard / staff-users main views |
| `@tenant-workspace` | Tenant-scoped workspace (not yet present in e2e) |
| `@uploads` | File uploads (not yet present in e2e) |

A file may carry **two** domain tags when its subject genuinely straddles two domains, but
prefer one.

## Ticket tags

Ticket tags (e.g. `@713`, `@806`, `@992`) are placed on the **parent** `test.describe`,
which means `--grep @806` runs **the entire file** linked to that ticket — not a single
isolated test. This is acceptable behaviour: the ticket relates to the whole feature under
test. Never expect `--grep @<ticket>` to isolate a single `test()` call.

When a spec has no traceable GitHub issue, use `@untracked` with a one-line reason comment
explaining why.

## Tagging syntax

Use Playwright's `tag` option on `test.describe`:

```ts
test.describe('staff tenants list', { tag: ['@staff-tenants', '@806'] }, () => {
  // ...
});
```

## Commands

```bash
# Run all e2e tests for a domain
pnpm --filter front test:e2e:tag @staff-tenants

# Run all e2e tests for a specific ticket
pnpm --filter front test:e2e:tag @992

# Combine: domain + ticket
pnpm --filter front test:e2e:tag "@staff-tenants.*@806"
```

## Enforcing tags

The Vitest guard at `apps/front/e2e/__tests__/e2e-tag-guard.test.ts` reads every
`e2e/**/*.spec.ts` file and fails when:

1. A top-level `test.describe` has no `tag` option at all.
2. The `tag` array contains no domain from the vocabulary above.
3. The `tag` array contains no ticket tag (`@<digits>` or `@untracked`).

The guard runs as part of `pnpm --filter front test` and CI. Adding a new spec without tags
breaks the gate.

## Spec inventory

| Spec | Domain tag(s) | Ticket(s) |
|---|---|---|
| `auth-error.spec.ts` | `@auth @security` | `@713` |
| `auth-redirect-guard.spec.ts` | `@auth` | `@untracked` handoff parity guard |
| `auth-screens.spec.ts` | `@auth` | `@806` |
| `breadcrumb-entity-name-truncation.spec.ts` | `@shell` | `@973` |
| `cold-boot-stability.spec.ts` | `@auth` | `@untracked` handoff stability guard |
| `csp.spec.ts` | `@public` | `@713` |
| `design-chrome-fixes.spec.ts` | `@design` | `@806` |
| `design-handoff-foundation.spec.ts` | `@design` | `@806` |
| `design-handoff-staff-profiles.spec.ts` | `@design @staff-profiles` | `@806` |
| `drawer-description-contrast.spec.ts` | `@design` | `@1043` |
| `drawer-form-scroll-geometry.spec.ts` | `@design` | `@990` |
| `field-validation.spec.ts` | `@design` | `@721` |
| `form-action-bar-clearance.spec.ts` | `@design` | `@806` |
| `gray-ui-screenshot-capture.spec.ts` | `@design @shell` | `@untracked` handoff visual capture |
| `i18n-namespaces.spec.ts` | `@i18n` | `@909` |
| `i18n.spec.ts` | `@i18n` | `@713` |
| `locale-switch.spec.ts` | `@i18n` | `@806` |
| `log-leak.spec.ts` | `@security` | `@733` |
| `logout.spec.ts` | `@auth` | `@806` |
| `parity-happy-path.spec.ts` | `@staff-dashboard` | `@723` |
| `profile-icon-picker-pin-contrast.spec.ts` | `@design @staff-profiles` | `@992` |
| `profile-icon-picker-pin-geometry.spec.ts` | `@design @staff-profiles` | `@992` |
| `request-counter.spec.ts` | `@security` | `@806` |
| `row-actions-centering.spec.ts` | `@shell` | `@806` |
| `search-input-native-cancel-suppression.spec.ts` | `@shell` | `@975` |
| `seo.spec.ts` | `@public` | `@713` |
| `shell.spec.ts` | `@shell` | `@713` |
| `smoke.spec.ts` | `@public` | `@733` |
| `ssr-auth-shell.spec.ts` | `@security` | `@997` |
| `staff-invitations.spec.ts` | `@staff-invitations` | `@742` |
| `staff-profile-edit-flow.spec.ts` | `@staff-profiles` | `@819` |
| `staff-profiles.spec.ts` | `@staff-profiles` | `@744` |
| `staff-tenant-create.spec.ts` | `@staff-tenants` | `@806` |
| `staff-tenant-details.spec.ts` | `@staff-tenants` | `@806` |
| `staff-tenant-edit.spec.ts` | `@staff-tenants` | `@806` |
| `staff-tenants.spec.ts` | `@staff-tenants` | `@806` |
| `staff-user-details.spec.ts` | `@staff-users` | `@806` |
| `table-scroll-ownership.spec.ts` | `@shell` | `@806` |
| `table.spec.ts` | `@shell @staff-users` | `@720` |
| `tab-refocus-stability.spec.ts` | `@auth` | `@806` |
| `tab-sync.spec.ts` | `@auth` | `@806` |
| `tenant-portal-picker.spec.ts` | `@staff-tenants` | `@806` |
| `toast-contrast.spec.ts` | `@design` | `@1078` |
