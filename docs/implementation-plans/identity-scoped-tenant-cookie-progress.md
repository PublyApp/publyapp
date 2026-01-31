# Identity-Scoped Tenant Cookie - Implementation Progress

## Overview
Migrating from single-tenant cookie (`X-PublyApp-TenantId`) to identity-scoped mapping cookie (`X-PublyApp-TenantHints`) that stores `{userId: tenantId}` pairs.

## Completed Phases

### Phase 1: Cookie Utility Module ✅
- Created `apps/front/src/lib/cookies/tenant-hint-cookie.utils.ts`
- Implements JSON-based `{userId: tenantId}` mapping
- Core functions: `parseTenantHintsFromRequest`, `getTenantHintForUser`, `setTenantHintForUser`, `serializeTenantHintsForResponse`
- Legacy cookie reading via `parseLegacyTenantIdFromRequest`
- Multi-path legacy clearing via `serializeClearLegacyCookieHeaders`
- Cookie name: `X-PublyApp-TenantHints`

### Phase 2: Shared Constants ✅
- Added `COOKIE_NAMES.TENANT_HINTS` to `packages/shared/lib/constants.ts`
- Kept `COOKIE_NAMES.TENANT_ID` for legacy compatibility during migration

### Phase 3: Backend GetRedirectCode Enhancement ✅
- Modified `GetRedirectCode.cs` to accept optional `tenantHint` query parameter
- Returns validated tenant ID directly when hint is valid for user
- Returns `TENANT_PICKER` when user has multiple tenants but no valid hint
- Existing behavior preserved for staff/unauthorized cases

### Phase 4: TypeScript Client Regeneration ✅
- Ran `make generate-client` to update Kiota client
- New `tenantHint` parameter available in generated types

### Phase 5: Login Page Integration ✅
- Updated `login-page.tsx` action to:
  - Read new mapping cookie via `parseTenantHintsFromRequest`
  - Fall back to legacy cookie via `parseLegacyTenantIdFromRequest`
  - Pass hint to `GetRedirectCode` API
  - Store validated tenant in new mapping format
  - Clear legacy cookie on ALL redirect paths (migration improvement)
- Uses `isSecureCookieFromRequest()` for proper Secure flag detection

**GPT Review Improvement Applied:**
- Moved legacy cookie clearing outside the tenant-specific branch
- Legacy cookie is now cleared on ALL redirect paths (STAFF, UNAUTHORIZED, TENANT_PICKER, valid tenant)
- Ensures one-time migration completes regardless of redirect outcome

**Build Result:** 0 TypeScript errors, frontend builds successfully

### Phase 6: Tenant Layout & Portal Integration ✅
- **Tenant Layout** (`tenant-layout.tsx`):
  - Now uses `updateTenantHintInBrowser(userId, tenantId)` to write identity-scoped mapping
  - Gets userId from `useGetUserAuthData()` suspense query
  - Clears legacy cookie client-side during migration
- **Tenant Portal Page** (`tenant-portal-page.tsx`):
  - Reads new mapping via `readTenantHintsFromBrowser()` + `getTenantHintForUser()`
  - Falls back to `readLegacyTenantFromBrowser()` for migration
- **Auth Layout** (`auth-layout.tsx`):
  - Uses `readTenantHintsFromRequestHeaders()` to read legacy hint
  - Legacy-only acceptable here (redirect-away edge case, userId not yet available)

**New Client-Side Utilities Added:**
- `readLegacyTenantFromBrowser()` - Read and validate legacy cookie
- `clearLegacyTenantFromBrowser()` - Clear legacy cookie from root path

**Build Result:** 0 TypeScript errors

### Phase 6b: Tenant-Picker Handling Fix ✅
**Bug:** `tenant-picker` redirect code was being treated as a tenantId, causing navigation to `/app/tenant-picker` (invalid route).

**Fixes:**
- **tenant-portal-page.tsx**: Added `TenantPicker` component that renders when `redirectCode === 'tenant-picker'`
  - Uses `useGetUserTenants` to fetch user's organizations
  - Shows card-based picker UI for tenant selection
- **auth-layout.tsx**: Added explicit handling for `REDIRECT_CODE.TENANT_PICKER`
  - Redirects to `/app` (portal) instead of treating as tenantId
  - Does NOT prefetch tenant auth data (no specific tenant yet)

**Build Result:** 0 TypeScript errors

### Phase 7: Logout Cleanup - SKIPPED ✅
**Decision:** Not needed. The identity-scoped design inherently handles multi-user scenarios:
- Each user's hint is keyed by their userId
- When User A logs out and User B logs in, User B's lookup uses User B's userId
- User A's stale entry won't affect User B (different key)
- If User A logs back in, their old hint might still be valid (nice for UX)

## Remaining Work

### Phase 8: Testing & Legacy Cleanup
- [ ] Manual testing of all flows (login, tenant switching, logout, multi-user)
- [ ] After migration period (30+ days), consider removing legacy cookie code:
  - `TENANT_HINTS_COOKIE_KEY_LEGACY` constant
  - `readLegacyTenantFromBrowser()` function
  - `clearLegacyTenantFromBrowser()` function
  - `serializeClearLegacyCookieHeaders()` function
  - Legacy fallback code in all components

## Implementation Summary

**Files Changed:**
1. `packages/shared/lib/constants.ts` - Added new cookie constants
2. `apps/front/src/lib/cookies/tenant-hint-cookie.utils.ts` - New utility module
3. `apps/api/Src/Modules/Auth/Handlers/GetRedirectCode.cs` - Added tenantHint parameter
4. `apps/front/src/routes/auth/login/login-page.tsx` - Updated login action
5. `apps/front/src/routes/authed/tenant/_layout/tenant-layout.tsx` - Updated cookie writes
6. `apps/front/src/routes/authed/tenant/_portal/tenant-portal-page.tsx` - Updated cookie reads
7. `apps/front/src/routes/auth/_layout/auth-layout.tsx` - Updated cookie reads

**Cookie Format:**
- Name: `X-PublyApp-TenantHints`
- Value: `v1|userId1:tenantId1|userId2:tenantId2|...`
- Max entries: 10 (LRU eviction)
- Max age: 30 days
- Secure: auto-detected from protocol
