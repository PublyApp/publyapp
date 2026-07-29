Status: Historical — not normative
Original location: docs/superpowers/specs/2026-05-10-tenant-layout-access-gate-design.md
Archive reason: Completed design retained only for architectural decision history.
Superseded by: apps/front is retired; apps/front-2 and docs/guides/front-2/conventions.md are current.

# Tenant Layout Access Gate Design

## Context

Issue #418 reports that tenant users can still see the authenticated app shell after
their tenant is suspended. A related URL-manipulation case lets tenant users manually
navigate to a malformed, nonexistent, deleted, or foreign tenant ID and still see the
shell until page-level queries fail inline.

The current `AuthedLayout` validates only the session and user identity through
`useGetUserAuthData`. It does not validate access to the `:tenantId` URL parameter.
Tenant page queries can fail later, but those failures are often regular `useQuery`
errors rendered inside the page, so the surrounding dashboard shell remains visible.

## Decision

Keep `AuthedLayout` as the session and identity gate.

Make `TenantLayout` the tenant access gate. Before rendering `DashboardLayout`, it will
run a suspense auth query against the existing endpoint:

```text
GET /auth/scope-auth-data?scope={tenantId}
```

No backend contract change is needed for the first implementation.

## Security Behavior

The existing `GetScopeAuthData` endpoint already enforces the required response split:

- Valid active tenant member: return tenant scope auth data.
- Valid member of suspended tenant: return `403` with `tenant-suspended`.
- Malformed, nonexistent, deleted, or foreign tenant scope: return generic `403`.
- Invalid or missing session: return `401` through the existing session auth path.

We will keep nonexistent tenants as generic `403`, not `404`, so the client does not
leak whether a tenant ID exists.

## Frontend Design

Add a suspense auth hook in
`apps/front/src/lib/react-query/features/common/auth.hooks.ts`. The hook should use
`createAuthSuspenseQuery`, call `client.auth.scopeAuthData.get()`, and pass the route
tenant ID as the `scope` query parameter.

`TenantLayout` will read `tenantId` from `useParams()` and call that hook before it
constructs or renders the dashboard shell. The existing tenant hint cookie update should
remain behind successful validation, so invalid tenant URLs are not persisted as the
current tenant hint.

The existing authed route error boundary remains the rendering policy:

- `403` with `translationKey === "tenant-suspended"` renders `ViewTenantSuspended`.
- Other `403` errors render `View403`.
- `401` triggers the centralized logout flow and renders the splash screen during
  navigation.

Staff routes are not children of `TenantLayout`, so they do not run this query or pay the
extra request cost.

## Testing

If the frontend already has route-layout test coverage, add focused coverage for the new
tenant gate. If not, verify with type checking and browser smoke testing:

- Suspended tenant member loads `/app/{tenantId}` and sees `ViewTenantSuspended`.
- Tenant user opens `/app/{foreignTenantId}` and sees `View403`.
- Tenant user opens `/app/not-a-uuid` and sees `View403`.
- Staff routes still load without tenant validation.

Run the normal frontend verification after implementation:

```bash
just tsc-front
```

API client regeneration should not be needed because the endpoint already exists in the
generated client.
