# Staff Tenant User Details Page Implementation Plan

**Goal:** Fix issue 386 by adding a full editable Staff dashboard tenant-user
details page at `/staff/tenant-users/:userId`.

**Final architecture:** Staff treats the page as a first-class tenant-user
identity page addressed by `User.Id`, while company memberships remain
tenant-scoped records. The details endpoint returns bounded identity data and a
`companyCount`; the company list is loaded through a separate cursor-paginated
endpoint.

## Final Route Shape

- Frontend route: `/staff/tenant-users/:userId`
- Details API: `GET /staff/tenant-users/{userId}`
- Companies API: `GET /staff/tenant-users/{userId}/companies`
- Identity update API: `PATCH /staff/tenant-users/{userId}`

Tenant-scoped membership actions stay on the existing tenant routes:

- `PATCH /staff/tenants/{tenantId}/users/{userId}`
- `POST /staff/tenants/{tenantId}/users/{userId}/suspend`
- `POST /staff/tenants/{tenantId}/users/{userId}/reactivate`
- `DELETE /staff/tenants/{tenantId}/users/{userId}`

## Backend Plan

1. Keep `GET /staff/tenant-users/{userId}` focused on shared identity fields.
2. Return `companyCount` from the details endpoint instead of embedding company
   rows.
3. Add `GET /staff/tenant-users/{userId}/companies` as a cursor-paginated list
   endpoint.
4. Support companies table sort fields: `tenant_name`, `status`, `level`, and
   `created_at`.
5. Preserve malformed ID, not-found, forbidden, and validation behavior through
   existing `TypedProblems.*` helpers and route-level permissions.
6. Regenerate OpenAPI and the Kiota TypeScript client.

## Frontend Plan

1. Register and use `/staff/tenant-users/:userId`.
2. Keep the skeleton under `_components`; place page implementation parts under
   `_parts`.
3. Split the details form and companies table into separate components.
4. Let route-owned components read `userId` with React Router `useParams()`
   instead of prop-drilling it.
5. Use the same Staff user details primitives for the top layout:
   `DashboardContent`, `CustomBreadcrumbs`, `QueryDisplay`, MUI cards/stacks,
   disabled avatar upload, `StatusChip`, hook-form `Form`/`Field.*`, and
   metadata rows.
6. Render the companies list inline below the details grid as an MRT table using
   the repo's `minimal-cursor` preset.
7. Use the same `ButtonBase` + `Label` + `Menu` interaction language as the
   tenant tables for membership `level` and `status` cells.
8. After company row actions, invalidate the details query, companies query, and
   tenant-user list queries that may include the changed membership.

## Verification Plan

- API focused tests:
  - details endpoint returns identity data without embedded `companies`
  - companies endpoint cursor-paginates memberships
  - malformed IDs return `400`
  - missing tenant-side identity returns `404`
  - tenant users without staff permission receive `403`
  - identity update returns the bounded details response
- Build and client generation:
  - `dotnet build -c Release --no-restore`
  - `dotnet kiota generate -d ../../apps/api/openapi/MainApi.json -o src -l typescript -n MainApi.Client -c ApiClient`
- Frontend verification:
  - `just check-write`
  - `just tsc-front`
  - `npx -y react-doctor@latest . --verbose --diff`

`just build-api` and `just generate-client` are still the normal commands, but
they can fail locally when a running Debug API process locks
`apps/api/bin/Debug/net10.0/MainApi.exe`. In that case, use the Release build
plus direct Kiota generation above without stopping the developer's running API.
