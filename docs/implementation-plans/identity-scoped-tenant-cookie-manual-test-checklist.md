# Identity-Scoped Tenant Cookie — Manual Test Checklist

This checklist verifies the end-to-end behavior of the identity-scoped tenant hint cookie (`publyapp-last_tenants`) and the updated redirect flow (`GetRedirectCode`).

## Preconditions / Setup

- Use a **single browser profile** (same cookie jar) to reproduce multi-identity behavior.
- Have these test accounts ready:
  - **User A**: member of **Tenant A** and **Tenant B** (2+ tenants).
  - **User C**: member of **Tenant C only** (1 tenant).
  - **User Z**: member of **no active tenants** (0 tenants), or a user whose tenants are all inactive/suspended/deleted.
  - **Staff S**: a staff user (staff account).
- Optional for migration tests:
  - Ensure a **legacy cookie** exists: `publyapp-last_used_tenant=<someTenantId>`.
  - If you want to test path-scoped duplicates, create the legacy cookie at multiple paths if your tooling allows.

## Core Scenarios

### 1) Multi-identity stale cookie (original bug)

1. Login as **User A**.
2. Navigate to **Tenant B** (so “last used” becomes B for User A).
3. Logout.
4. Login as **User C**.

Expected:
- User C does **not** land on `/unauthorized` due to User A’s last tenant.
- If User C has exactly one active tenant, user ends up at `/app/<TenantCId>`.
- `publyapp-last_tenants` should contain (at least) an entry for User C after first tenant navigation/selection.

### 2) Multi-tenant user with no valid hint (tenant picker)

1. Login as **User A** in a fresh browser state where:
   - There is **no** `publyapp-last_tenants` entry for User A, or
   - The stored hint for User A points to a tenant User A no longer can access.
2. Observe redirect target.

Expected:
- Redirects to `/app` (tenant portal).
- Tenant portal renders **tenant picker UI** (not `/app/tenant-picker`).
- Selecting a tenant navigates to `/app/<TenantId>`.
- After selection, `publyapp-last_tenants` updates for User A.

### 3) Single-tenant user (no picker)

1. Login as **User C** (exactly 1 active tenant).

Expected:
- Redirects directly to `/app/<TenantCId>` (no picker).

### 4) Zero-tenant user (unauthorized)

1. Login as **User Z** (0 active tenants).

Expected:
- Redirects to `/unauthorized`.
- No infinite redirect loops.

### 5) Staff user behavior

1. Login as **Staff S**.

Expected:
- Redirects to staff dashboard route (`/staff`).
- No tenant picker is shown.
- Tenant hint cookie should not affect staff redirect behavior.

## Migration / Legacy Cookie Tests

### 6) Legacy cookie fallback + clearing on success

1. Ensure legacy cookie exists: `publyapp-last_used_tenant=<TenantBId>` (where `<TenantBId>` is valid for **User A**).
2. Ensure `publyapp-last_tenants` has **no** entry for User A.
3. Login as **User A**.

Expected:
- App uses legacy cookie as a hint; if it’s valid, redirects to `/app/<TenantBId>`.
- Response should clear legacy cookie via `Set-Cookie` across likely paths.

### 7) Legacy cookie points to inaccessible tenant (stale hint)

1. Set legacy cookie to a tenant **User C does not belong to** (e.g., Tenant B).
2. Login as **User C**.

Expected:
- Does **not** hard-fail to `/unauthorized` because of the hint.
- Redirects to `/app/<TenantCId>` (single-tenant) or `/app` picker (multi-tenant).
- Legacy cookie should be cleared once the new mapping is written (after a successful tenant redirect).

## Cookie / Security / Resilience Tests

### 8) Tenant hint cookie tampering (devtools)

1. Manually edit `publyapp-last_tenants` to:
   - Oversized value (> 2048 chars)
   - Invalid format (no version prefix)
   - Invalid UUIDs
   - Duplicate user entries for same userId

Expected:
- No crashes.
- Redirect flow treats cookie as untrusted:
  - Invalid/stale hint falls through to tenant selection logic.
  - No unauthorized cross-tenant access is granted.
- No console spam / log-flooding from bad cookie values.

### 9) Secure flag behavior behind reverse proxy (if applicable)

1. In an HTTPS environment behind a proxy, verify the mapping cookie is set with `Secure`.
2. In local HTTP environment, verify it is not blocked by `Secure` being set incorrectly.

Expected:
- Cookie behavior matches environment and does not break login redirect.

## Regression Checks

### 10) Session/401 semantics regression

1. Force an invalid session token (expired/modified) and navigate to an authed route.

Expected:
- Backend still uses `401` only for invalid/missing session (frontend logs out).
- Tenant selection failures do not incorrectly trigger logout semantics.

## Notes / Evidence to Capture

- Record final `redirectCode` values observed for each scenario (`staff`, `unauthorized`, `tenant-picker`, `<tenantId>`).
- Capture cookie values for:
  - `publyapp-last_tenants`
  - `publyapp-last_used_tenant` (ensure it gets cleared after migration)
