# Implementation Plan: Single Cookie with User→Tenant Mapping

## Status: PLANNING (v4.1 - Single Cookie with User Mapping)

## Revision History
- v1: Initial plan with `userId:tenantId` cookie format
- v2: Simplified to plain `tenantId` (GPT feedback)
- v3: Per-user cookie keys `publyapp-last_tenant_{userId}` (user feedback)
- v4: Single cookie with versioned user→tenant mapping (avoids cookie explosion)
- **v4.1: GPT review feedback - lowercase GUID normalization, explicit HttpOnly note, security/trust model section, legacy clearing location, API ID comparison normalization, atomic cookie write note, write-time UUID validation, robust secure flag detection (X-Forwarded-Proto), factorization/reuse with existing cookie utils layer, public vs internal API distinction, hardening against cookie tampering (bounded parsing, multi-path legacy clear, DoS protection)**

## Problem Summary

When multiple users share the same browser:

1. User A logs in, belongs to Tenant A + Tenant B
2. User A switches to Tenant B → browser stores `publyapp-last_used_tenant = B`
3. User A logs out
4. User C logs in (belongs only to Tenant C)
5. App calls `GetRedirectCode` with stale `tenantId=B` → User C gets "unauthorized"

The cookie persists across different user sessions, causing incorrect redirects.

## Desired Behavior

1. **Per-user preference isolation:** Each user's last-used tenant is stored separately
2. **Graceful fallback:** Treat inaccessible tenant hints as stale, not hard unauthorized
3. **Smart tenant selection when no valid hint:**
   - 0 tenants → "unauthorized"
   - 1 tenant → redirect directly to that tenant
   - ≥2 tenants → redirect to tenant picker page
4. **No cookie explosion:** Single cookie stores all user preferences

## Key Decisions (v4)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cookie key | `publyapp-last_tenants` (single) | Avoids N cookies for N users. Browser cookie limits not an issue. |
| Cookie value format | `v1\|userId:tenantId\|userId:tenantId\|...` | Versioned, compact, parseable. Supports future format changes. |
| Max entries | 10 users | Keeps cookie size ~740 bytes (well under 4KB limit). Oldest evicted on overflow. |
| Cookie options | `Path=/`, `SameSite=Lax`, `Secure` (prod), `Max-Age=30d` | Standard security. 30-day expiry balances UX and cleanup. **No HttpOnly** - client-side writable. |
| GUID format | Lowercase canonical | `3fa85f64-...` not `3FA85F64-...`. Consistent comparison, smaller cookie. |
| Legacy migration | Read `publyapp-last_used_tenant` once, migrate to new format | Backward compatible. **Cleared in login-page.tsx action** after successful redirect. |
| Tenant picker location | `/app` (existing portal route) | Reuse existing route, no new paths |
| New redirect code | `"tenant-picker"` | Frontend can distinguish picker vs single tenant |
| Backend hint handling | Treat non-member hint as stale | Falls through to tenant selection instead of hard "unauthorized" |

---

## Factorization / Reuse

### Alignment with Existing Cookie Utils Layer

Tenant hint cookie utilities follow the **same design pattern** as the existing session cookie layer:

| Existing | New (Tenant Hints) |
|----------|-------------------|
| `session-cookie.utils.ts` | `tenant-hint-cookie.utils.ts` |
| Client helpers (browser read/write) | Client helpers (browser read/write) |
| Server helpers (Set-Cookie headers) | Server helpers (Set-Cookie headers) |
| Exported via `cookies/index.ts` | Exported via `cookies/index.ts` |

**Key principle:** Session cookie behavior is NOT modified. Tenant hints are a separate, independent cookie.

### File Structure

All tenant hint cookie utilities live under `apps/front/src/lib/cookies/`:

```
apps/front/src/lib/cookies/
├── index.ts                        # Re-exports (UPDATE)
├── session-cookie.utils.ts         # Existing - DO NOT MODIFY
├── server-cookie.utils.ts          # Existing - DO NOT MODIFY
├── logout.utils.ts                 # Existing - DO NOT MODIFY
└── tenant-hint-cookie.utils.ts     # NEW - All tenant hint logic
```

### No Ad-Hoc Tenant Hint Logic in Routes

**CRITICAL:** Routes must NOT interpret tenant-hint cookie formats/keys directly. They may parse request cookies for other purposes (locale, etc.), but tenant hint reading/writing must go through the cookie utils.

| File | Constraint | Use these imports from `@/front/lib/cookies` |
|------|------------|---------------------------------------------|
| `login-page.tsx` | Don't read `TENANT_HINTS_COOKIE_KEY` directly | `readTenantHintsFromRequestHeaders()`, `serializeTenantHintsForResponse()` |
| `auth-layout.tsx` | (no tenant hint logic needed) | N/A - backend determines redirect |
| `tenant-layout.tsx` | Don't write `document.cookie` for tenant hints | `updateTenantHintInBrowser()` |
| `tenant-portal-page.tsx` | Don't parse tenant hint cookie manually | `readTenantHintsFromBrowser()`, `getTenantHintForUser()` |

**Why this matters:**
- Cookie format (`v1|userId:tenantId|...`) is an implementation detail
- LRU eviction, UUID validation, normalization are encapsulated
- Future format changes (v2, etc.) only require updating the utils module

### Public API vs Internal Helpers

To prevent duplication and keep the API surface small:

**Public API** (exported via `index.ts`, used by routes):

```typescript
// Server-side (SSR loaders/actions)
readTenantHintsFromRequestHeaders(request: Request): { map, legacyTenantId }  // Preferred - parses cookies internally
readTenantHintsFromRequest(cookies: Record<string, string>): { map, legacyTenantId }  // If you already have parsed cookies
serializeTenantHintsForResponse(map: TenantHintsMap, isSecure: boolean): string
serializeClearLegacyCookieHeaders(): string[]  // Preferred - clears at all likely paths
serializeClearLegacyCookie(): string           // Deprecated - only clears at /
isSecureCookieFromRequest(request: Request): boolean

// Client-side (browser)
readTenantHintsFromBrowser(): TenantHintsMap
updateTenantHintInBrowser(userId: string, tenantId: string): boolean
isSecureCookieFromBrowser(): boolean

// Map operations (used by both)
getTenantHintForUser(map: TenantHintsMap, userId: string): string | undefined
setTenantHintForUser(map: TenantHintsMap, userId: string, tenantId: string): TenantHintsMap
```

**Internal helpers** (NOT exported, implementation details):

```typescript
// Parsing/serialization
parseTenantHintsCookie(value: string | undefined): TenantHintsMap  // Internal
serializeTenantHintsCookie(map: TenantHintsMap): string            // Internal

// UUID handling
isValidUuid(value: string): boolean      // Internal
normalizeUuid(uuid: string): string      // Internal

// Cookie options
getCookieOptions(isSecure: boolean): CookieOptions  // Internal

// Low-level browser write (use updateTenantHintInBrowser instead)
writeTenantHintsToBrowser(map: TenantHintsMap): void  // Internal
```

**Rationale:** Routes should only use high-level helpers. Low-level parsing/serialization/validation is encapsulated to prevent inconsistent usage.

---

## Cookie Format Specification

### Format
```
v1|<userId>:<tenantId>|<userId>:<tenantId>|...
```

### Example
```
v1|3fa85f64-5717-4562-b3fc-2c963f66afa6:a1b2c3d4-5678-90ab-cdef-1234567890ab|9b2e4f80-1234-5678-90ab-cdef12345678:cc334455-6677-8899-aabb-ccddeeff0011
```

**Note:** All UUIDs are lowercase canonical format (normalized on write).

### Size Calculation
- Version prefix: ~3 bytes (`v1|`)
- Each entry: ~73 bytes (36-char UUID + `:` + 36-char UUID + `|`)
- 10 entries: ~733 bytes
- Well under browser cookie limit (4KB typical, some browsers 4093 bytes)

### Parsing Rules
1. Split by `|` → first element is version, rest are entries
2. For each entry, split by `:` → `[userId, tenantId]`
3. Validate both are valid UUIDs (skip invalid entries)
4. Build map: `{ userId → tenantId }`

### Writing Rules
1. Normalize GUIDs to lowercase canonical format
2. Update/insert current user's entry
3. Move updated entry to end (most recent)
4. If >10 entries, drop from front (oldest)
5. Serialize: `v1|` + entries joined by `|`

### Security & Trust Model

**Cookie is untrusted input:**
- The cookie value can be freely tampered with by users or malicious scripts
- Backend NEVER trusts the hint blindly — always validates via `IsUserMemberOfActiveTenantAsync`
- Worst-case tampering: user gets shown tenant picker (graceful fallback)
- Cookie cannot grant access to tenants the user doesn't already have permission to access

**Cookie sent on every request:**
- Browser sends cookies with every request to the domain
- Keeping max entries at 10 (~740 bytes) ensures minimal bandwidth overhead
- Cookie is not HttpOnly because frontend needs to read/write it client-side

**No HttpOnly flag:**
- Cookie MUST be readable/writable by JavaScript (client-side tenant switching)
- This is intentional and documented (not a security oversight)
- Cookie contains no secrets — just user→tenant preference hints

**GUID normalization consistency:**
- All cookie read/write operations normalize GUIDs to lowercase
- When comparing cookie hints against API responses, normalize API IDs too (`.toLowerCase()`)
- This handles any mixed-case GUIDs from backend (though C# `Guid.ToString()` returns lowercase by default)

**Atomic cookie writes (legacy migration):**
- New mapping cookie and legacy clear are in the same HTTP response
- Browser processes all Set-Cookie headers atomically
- If response fails to reach browser, neither cookie is modified
- New cookie is appended FIRST, ensuring it exists before legacy is cleared

**Write-time validation:**
- `setTenantHintForUser()` validates both IDs are valid UUIDs before updating
- Invalid inputs (e.g., backend bug returning non-UUID) are rejected with a warning
- Prevents cookie poisoning from upstream bugs

**Secure flag detection (reverse proxy safe):**
- Server-side: checks `X-Forwarded-Proto` header first (set by Traefik/nginx)
- Falls back to URL protocol check for direct connections
- Client-side: uses `window.location.protocol` which is always accurate

### Hardening Against Cookie Tampering (DevTools / DoS)

Users with DevTools can modify cookies arbitrarily. This section ensures tampering is harmless (worst-case = picker), with bounded parse work and no redirect/unauthorized loops.

**1. Bounded parsing (CPU/memory safe):**

```typescript
// Constants
const MAX_COOKIE_VALUE_LENGTH = 2048;  // ~2x expected max (10 entries ≈ 740 bytes)

// In parseTenantHintsCookie():
// - If raw value length > MAX_COOKIE_VALUE_LENGTH → return empty map immediately
// - Stop parsing after TENANT_HINTS_MAX_ENTRIES + 1 entries (ignore rest)
// - Wrap entire parsing in try/catch; on any error → return empty map
// - NEVER log raw cookie values (could be malicious payloads)
```

**2. No hard "unauthorized" from hint:**

- **Backend (`GetRedirectCode.cs`):** Stale/invalid tenant hint ALWAYS falls through to tenant selection logic. The hint is NEVER a reason to return "unauthorized".
- **Frontend (portal/login):** Invalid hint → show picker (if ≥2 tenants) or redirect to single tenant (if 1). Never force unauthorized from hint.
- **Result:** Tampering a hint can only affect which tenant is auto-selected, not lock users out.

**3. Duplicate-cookie / Path tampering resilience:**

Legacy cookie (`publyapp-last_used_tenant`) might exist at multiple paths if historically set without explicit `path` option. To ensure clean migration, clear at all likely paths:

- `/` — standard root path (most common)
- `/auth`, `/auth/login` — if cookie was set during SSR login flow
- `/app` — if cookie was set client-side in `tenant-layout.tsx` while user was at `/app/{tenantId}/...` (browser default path = current URL directory)

```typescript
// Clear legacy cookie at multiple likely paths
export const serializeClearLegacyCookieHeaders = (): string[] => {
  const paths = ['/', '/auth', '/auth/login', '/app'];
  return paths.map(path =>
    cookie.serialize(TENANT_HINTS_COOKIE_KEY_LEGACY, '', {
      path,
      maxAge: 0,
    })
  );
};
```

- Always write NEW cookie with consistent options: `Path=/`, `SameSite=Lax`, `Secure` (detected), `Max-Age=30d`
- Clear legacy at ALL likely paths, not just `/`
- Append legacy clears ONLY AFTER successfully setting new mapping cookie

**4. Write-time validation:** (already documented above)
- UUID validation before updating map
- Invalid inputs rejected silently (warning logged, map unchanged)

**5. Proxy-safe secure detection:** (already documented above)
- Uses `X-Forwarded-Proto` header for reverse proxy scenarios

**Tampering summary:**

| Attack | Result |
|--------|--------|
| Oversized cookie value (DoS attempt) | Ignored, empty map returned, picker/normal flow |
| Malformed entries | Skipped, valid entries still used |
| Invalid UUIDs in cookie | Skipped during parsing |
| Non-existent tenant ID | Falls through to picker (not unauthorized) |
| Duplicate legacy cookies at weird paths | Cleared at multiple paths |
| Inject thousands of entries | Parsing stops after MAX_ENTRIES + 1 |

---

## Changes Overview (v4)

| File | Change |
|------|--------|
| `packages/shared/lib/constants.ts` | Add `REDIRECT_CODE` constants + new cookie key |
| `apps/api/.../AccountService.cs` | Add `IsUserMemberOfActiveTenantAsync` method |
| `apps/api/.../GetRedirectCode.cs` | New decision tree: stale hint → fallback, picker for ≥2 tenants |
| `apps/front/.../tenant-hint-cookie.utils.ts` | **NEW** - Cookie mapping parse/serialize utilities |
| `apps/front/.../login-page.tsx` | Parse mapping, pass hint to GetRedirectCode, update mapping |
| `apps/front/.../tenant-portal-page.tsx` | Use `GetUserTenants` only + picker UI + read/write mapping |
| `apps/front/.../tenant-layout.tsx` | Update mapping on tenant navigation (client-side) |
| `apps/front/.../auth-layout.tsx` | Handle `tenant-picker` redirect code |
| `common.json` | Add UI translations for tenant picker |

---

## Phase 1: Add Shared Constants

**File:** `packages/shared/lib/constants.ts`

Add redirect code constants and cookie keys:

```typescript
export const REDIRECT_CODE = {
  STAFF: 'staff',
  UNAUTHORIZED: 'unauthorized',
  TENANT_PICKER: 'tenant-picker',
} as const;

export type RedirectCode = (typeof REDIRECT_CODE)[keyof typeof REDIRECT_CODE] | string;

/** New cookie key for user→tenant mapping (v4 format) */
export const TENANT_HINTS_COOKIE_KEY = 'publyapp-last_tenants';

/** Legacy cookie key (v1-v3, for migration) */
export const TENANT_HINTS_COOKIE_KEY_LEGACY = 'publyapp-last_used_tenant';

/** Max users to store in mapping (keeps cookie under 1KB) */
export const TENANT_HINTS_MAX_ENTRIES = 10;

/** Cookie version for future format changes */
export const TENANT_HINTS_COOKIE_VERSION = 'v1';

/** Max cookie value length before treating as invalid (DoS protection) */
export const TENANT_HINTS_MAX_COOKIE_LENGTH = 2048;

/** Paths to clear legacy cookie from (handles historical path-scoped duplicates) */
export const TENANT_HINTS_LEGACY_CLEAR_PATHS = ['/', '/auth', '/auth/login', '/app'];
```

---

## Phase 2: Create Cookie Mapping Utilities

**New File:** `apps/front/src/lib/cookies/tenant-hint-cookie.utils.ts`

> **Pattern:** This file follows the same structure as `session-cookie.utils.ts` - separating client helpers (browser) from server helpers (Set-Cookie), with internal parsing logic kept unexported. See "Factorization / Reuse" section above.

```typescript
import * as cookie from 'cookie';
import {
  TENANT_HINTS_COOKIE_KEY,
  TENANT_HINTS_COOKIE_KEY_LEGACY,
  TENANT_HINTS_MAX_ENTRIES,
  TENANT_HINTS_COOKIE_VERSION,
  TENANT_HINTS_MAX_COOKIE_LENGTH,
  TENANT_HINTS_LEGACY_CLEAR_PATHS,
} from '@/shared/lib/constants';
import duration from '@org/shared/utils/duration.utils';

// UUID regex for validation (case-insensitive for parsing, but we normalize to lowercase)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidUuid = (value: string): boolean => UUID_REGEX.test(value);

/**
 * Normalizes UUID to lowercase canonical format.
 * Ensures consistent comparison and smaller cookie size.
 */
const normalizeUuid = (uuid: string): string => uuid.toLowerCase();

export type TenantHintsMap = Map<string, string>; // userId → tenantId

/**
 * Parses the tenant hints cookie value into a Map.
 * Format: v1|userId:tenantId|userId:tenantId|...
 *
 * HARDENED parsing (DoS-safe):
 * - Returns empty map for missing/invalid/oversized cookie
 * - Stops after MAX_ENTRIES + 1 entries (ignores rest)
 * - Skips entries with invalid UUIDs
 * - Never throws (wrapped in try/catch)
 * - Never logs raw cookie values
 */
const parseTenantHintsCookie = (cookieValue: string | undefined): TenantHintsMap => {
  const map = new Map<string, string>();

  try {
    if (!cookieValue || typeof cookieValue !== 'string') {
      return map;
    }

    // HARDENING: Reject oversized cookies immediately (DoS protection)
    if (cookieValue.length > TENANT_HINTS_MAX_COOKIE_LENGTH) {
      // Do NOT log the raw value - could be malicious payload
      console.warn('[tenant-hint] Cookie value exceeds max length, ignoring');
      return map;
    }

    const parts = cookieValue.split('|');

    // Check version prefix
    if (parts.length < 1 || !parts[0].startsWith('v')) {
      return map; // Unknown format, return empty
    }

    const version = parts[0];
    if (version !== TENANT_HINTS_COOKIE_VERSION) {
      // Future: handle version migrations here
      return map; // Unknown version, return empty
    }

    // HARDENING: Parse at most MAX_ENTRIES + 1 entries (ignore rest)
    const maxToParse = Math.min(parts.length, TENANT_HINTS_MAX_ENTRIES + 2); // +2 for version prefix + 1 extra

    // Parse entries (skip version prefix)
    for (let i = 1; i < maxToParse; i++) {
      const entry = parts[i];
      const colonIndex = entry.indexOf(':');

      if (colonIndex === -1) continue; // Invalid entry format

      const userId = entry.slice(0, colonIndex);
      const tenantId = entry.slice(colonIndex + 1);

      // Validate both are UUIDs
      if (!isValidUuid(userId) || !isValidUuid(tenantId)) continue;

      // Normalize to lowercase for consistent comparison
      map.set(normalizeUuid(userId), normalizeUuid(tenantId));
    }
  } catch {
    // HARDENING: Never throw from parsing - return empty map on any error
    // Do NOT log error details - could contain malicious payload
    console.warn('[tenant-hint] Error parsing cookie, ignoring');
    return new Map();
  }

  return map;
};

/**
 * Serializes the tenant hints Map to cookie value format.
 * Enforces max entries limit (oldest evicted).
 */
export const serializeTenantHintsCookie = (map: TenantHintsMap): string => {
  // Convert to array, keeping insertion order (Map preserves order)
  let entries = Array.from(map.entries());

  // Enforce max entries (drop oldest = first entries)
  if (entries.length > TENANT_HINTS_MAX_ENTRIES) {
    entries = entries.slice(entries.length - TENANT_HINTS_MAX_ENTRIES);
  }

  const entriesStr = entries.map(([userId, tenantId]) => `${userId}:${tenantId}`).join('|');

  return `${TENANT_HINTS_COOKIE_VERSION}|${entriesStr}`;
};

/**
 * Gets tenant hint for a specific user from the mapping.
 * Returns undefined if no hint exists for this user.
 * Normalizes userId for consistent lookup.
 */
export const getTenantHintForUser = (
  map: TenantHintsMap,
  userId: string
): string | undefined => {
  return map.get(normalizeUuid(userId));
};

/**
 * Updates the mapping with a user's tenant selection.
 * Moves the entry to "most recent" position (end of map).
 * Returns a new Map (immutable update).
 * Validates and normalizes IDs - returns unchanged map if invalid.
 */
export const setTenantHintForUser = (
  map: TenantHintsMap,
  userId: string,
  tenantId: string
): TenantHintsMap => {
  // Validate inputs - don't poison cookie with invalid data
  if (!isValidUuid(userId) || !isValidUuid(tenantId)) {
    console.warn('[tenant-hint] Invalid UUID, not updating cookie:', { userId, tenantId });
    return map; // Return unchanged
  }

  const newMap = new Map(map);
  const normalizedUserId = normalizeUuid(userId);
  const normalizedTenantId = normalizeUuid(tenantId);

  // Delete first to ensure it's moved to end (most recent)
  newMap.delete(normalizedUserId);
  newMap.set(normalizedUserId, normalizedTenantId);

  return newMap;
};

/**
 * Cookie serialization options for browser writes.
 */
const getCookieOptions = (isSecure: boolean) => ({
  path: '/',
  sameSite: 'lax' as const,
  secure: isSecure,
  maxAge: duration.toSeconds('30d'),
});

/**
 * Determines if cookies should use Secure flag.
 * Handles reverse proxy scenarios by checking X-Forwarded-Proto header.
 * Falls back to explicit config for reliability.
 */
export const isSecureCookieFromRequest = (request: Request): boolean => {
  // Check forwarded proto header (set by reverse proxy like Traefik/nginx)
  const forwardedProto = request.headers.get('X-Forwarded-Proto');
  if (forwardedProto) {
    return forwardedProto === 'https';
  }

  // Fallback to URL check (works for direct connections)
  return request.url.startsWith('https');
};

/**
 * Client-side secure flag detection.
 * Uses window.location.protocol which is always accurate.
 */
export const isSecureCookieFromBrowser = (): boolean => {
  return typeof window !== 'undefined' && window.location.protocol === 'https:';
};

/**
 * Reads and parses tenant hints from browser cookies (client-side).
 * Also handles legacy cookie migration.
 */
export const readTenantHintsFromBrowser = (): TenantHintsMap => {
  const browserCookies = cookie.parse(document.cookie);
  return parseTenantHintsCookie(browserCookies[TENANT_HINTS_COOKIE_KEY]);
};

/**
 * Writes tenant hints to browser cookie (client-side).
 * Auto-detects secure flag from browser protocol.
 */
export const writeTenantHintsToBrowser = (map: TenantHintsMap): void => {
  const value = serializeTenantHintsCookie(map);
  const serialized = cookie.serialize(
    TENANT_HINTS_COOKIE_KEY,
    value,
    getCookieOptions(isSecureCookieFromBrowser())
  );
  document.cookie = serialized;
};

/**
 * Convenience: Update current user's hint and write to browser cookie.
 * Auto-detects secure flag. Returns true if cookie was updated.
 */
export const updateTenantHintInBrowser = (userId: string, tenantId: string): boolean => {
  const currentMap = readTenantHintsFromBrowser();
  const updatedMap = setTenantHintForUser(currentMap, userId, tenantId);

  // Check if map actually changed (setTenantHintForUser returns unchanged map on invalid input)
  if (updatedMap === currentMap) {
    return false; // Invalid input, cookie not updated
  }

  writeTenantHintsToBrowser(updatedMap);
  return true;
};

/**
 * Reads and parses tenant hints from request cookies (server-side).
 * Also reads legacy cookie as fallback for migration.
 */
export const readTenantHintsFromRequest = (
  requestCookies: Record<string, string>
): { map: TenantHintsMap; legacyTenantId: string | undefined } => {
  const map = parseTenantHintsCookie(requestCookies[TENANT_HINTS_COOKIE_KEY]);
  const legacyTenantId = requestCookies[TENANT_HINTS_COOKIE_KEY_LEGACY];

  // Validate legacy value is a UUID
  const validLegacy = legacyTenantId && isValidUuid(legacyTenantId)
    ? legacyTenantId
    : undefined;

  return { map, legacyTenantId: validLegacy };
};

/**
 * Convenience helper that reads tenant hints directly from Request headers.
 * Preferred over readTenantHintsFromRequest() - routes don't need to parse cookies themselves.
 */
export const readTenantHintsFromRequestHeaders = (
  request: Request
): { map: TenantHintsMap; legacyTenantId: string | undefined } => {
  const cookieHeader = request.headers.get('Cookie') || '';
  const requestCookies = cookie.parse(cookieHeader);
  return readTenantHintsFromRequest(requestCookies);
};

/**
 * Serializes tenant hints cookie for Set-Cookie header (server-side).
 * Requires explicit isSecure param - use isSecureCookieFromRequest() to determine.
 */
export const serializeTenantHintsForResponse = (
  map: TenantHintsMap,
  isSecure: boolean
): string => {
  const value = serializeTenantHintsCookie(map);
  return cookie.serialize(TENANT_HINTS_COOKIE_KEY, value, getCookieOptions(isSecure));
};

/**
 * Returns Set-Cookie header value to clear the legacy cookie at root path.
 * @deprecated Use serializeClearLegacyCookieHeaders() for complete cleanup
 */
export const serializeClearLegacyCookie = (): string => {
  return cookie.serialize(TENANT_HINTS_COOKIE_KEY_LEGACY, '', {
    path: '/',
    maxAge: 0, // Expire immediately
  });
};

/**
 * Returns Set-Cookie headers to clear the legacy cookie at ALL likely paths.
 * HARDENING: Handles path-scoped duplicate cookies from historical bugs.
 * Clears at: /, /auth, /auth/login, /app
 */
export const serializeClearLegacyCookieHeaders = (): string[] => {
  return TENANT_HINTS_LEGACY_CLEAR_PATHS.map(path =>
    cookie.serialize(TENANT_HINTS_COOKIE_KEY_LEGACY, '', {
      path,
      maxAge: 0,
    })
  );
};
```

**File:** `apps/front/src/lib/cookies/index.ts`

Update exports (PUBLIC API only - internal helpers stay unexported):
```typescript
// =============================================================================
// Tenant Hint Cookie - Public API
// See: docs/records/2026-01-31-plan-identity-scoped-tenant-cookie.md
// =============================================================================

export {
  // Types
  type TenantHintsMap,

  // Map operations (used by both server and client)
  getTenantHintForUser,
  setTenantHintForUser,

  // Server-side helpers (SSR loaders/actions)
  readTenantHintsFromRequestHeaders,  // Preferred - parses cookies internally
  readTenantHintsFromRequest,          // If you already have parsed cookies
  serializeTenantHintsForResponse,
  serializeClearLegacyCookieHeaders,   // Preferred - clears at all likely paths
  serializeClearLegacyCookie,          // Deprecated - only clears at /
  isSecureCookieFromRequest,

  // Client-side helpers (browser)
  readTenantHintsFromBrowser,
  updateTenantHintInBrowser,  // Preferred over writeTenantHintsToBrowser
  isSecureCookieFromBrowser,
} from './tenant-hint-cookie.utils';

// NOTE: The following are intentionally NOT exported (internal implementation):
// - parseTenantHintsCookie, serializeTenantHintsCookie (low-level parsing)
// - writeTenantHintsToBrowser (use updateTenantHintInBrowser instead)
// - isValidUuid, normalizeUuid (validation/normalization internals)
// - getCookieOptions (cookie config internals)
```

---

## Phase 3: Add Tenant Status Check to AccountService

**File:** `apps/api/Src/Modules/Users/Services/AccountService.cs`

**Problem:** `IsUserMemberOfTenantAsync` checks user account status but NOT tenant status. This could redirect users to suspended/inactive tenants.

**Solution:** Add new method that validates both account AND tenant status:

```csharp
// Add to IAccountService interface
Task<bool> IsUserMemberOfActiveTenantAsync(Guid userId, Guid tenantId, CancellationToken cancellationToken = default);

// Implementation in AccountService
public async Task<bool> IsUserMemberOfActiveTenantAsync(
    Guid userId,
    Guid tenantId,
    CancellationToken cancellationToken = default
) {
    // Same filters as GetUserTenantsAsync for consistency
    var query =
        from ua in _dbContext.UserAccount
        join t in _dbContext.Tenant on ua.TenantId equals t.Id
        where ua.UserId == userId
            && ua.TenantId == tenantId
            && ua.Scope == AccountScope.Tenant
            && !ua.IsDeleted && !ua.IsSuspended
            && t.Status == TenantStatus.Active && !t.IsSuspended
        select ua;

    return await query.AnyAsync(cancellationToken);
}
```

---

## Phase 4: Update Backend GetRedirectCode

**File:** `apps/api/Src/Modules/Auth/Handlers/GetRedirectCode.cs`

**New decision tree:**

```csharp
public static async Task<Ok<GetRedirectCodeResult>> HandleGetRedirectCode(
    [AsParameters] GetRedirectCodeQuery query,
    IRequestAuthContext authContext,
    ILogger<GetRedirectCode> logger,
    [FromServices] IAccountService accountService,
    CancellationToken cancellationToken
) {
    // ... existing auth checks (lines 39-52) ...

    // Staff users always go to staff dashboard
    if (isUserStaffUser) {
        return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "staff" });
    }

    var tenantId = query.GetTenantId();

    // If tenant hint provided, validate access (including tenant status)
    if (tenantId is Guid hintTenantId) {
        // Use new method that checks BOTH account AND tenant status
        var isMemberOfActiveTenant = await accountService.IsUserMemberOfActiveTenantAsync(
            userId, hintTenantId, cancellationToken
        );

        if (isMemberOfActiveTenant) {
            // Hint is valid - use it
            if (logger.IsEnabled(LogLevel.Information)) {
                logger.LogInformation(
                    "Using valid tenant hint {TenantId} for user {UserId}",
                    hintTenantId, userId
                );
            }
            return TypedResults.Ok(new GetRedirectCodeResult {
                RedirectCode = hintTenantId.ToString()
            });
        }

        // Hint is stale/invalid (user not member, or tenant suspended/inactive)
        // Fall through to tenant selection instead of hard "unauthorized"
        if (logger.IsEnabled(LogLevel.Information)) {
            logger.LogInformation(
                "Stale tenant hint {TenantId} for user {UserId}, falling through to selection",
                hintTenantId, userId
            );
        }
    }

    // No valid hint - determine redirect based on tenant count
    var tenantsResult = await accountService.GetUserTenantsAsync(
        userId, limit: 2, cancellationToken: cancellationToken
    );

    if (tenantsResult.TotalCount == 0) {
        // No tenants - unauthorized
        if (logger.IsEnabled(LogLevel.Warning)) {
            logger.LogWarning("User {UserId} has no active tenants, returning unauthorized", userId);
        }
        return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "unauthorized" });
    }

    if (tenantsResult.TotalCount == 1) {
        // Exactly 1 tenant - redirect directly
        var singleTenant = tenantsResult.Tenants.First();
        return TypedResults.Ok(new GetRedirectCodeResult {
            RedirectCode = singleTenant.Id.ToString()
        });
    }

    // Multiple tenants - show picker
    if (logger.IsEnabled(LogLevel.Information)) {
        logger.LogInformation(
            "User {UserId} has {TenantCount} tenants, returning tenant-picker",
            userId, tenantsResult.TotalCount
        );
    }
    return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "tenant-picker" });
}
```

**Key Changes:**
- Use new `IsUserMemberOfActiveTenantAsync` (validates tenant status)
- Remove `ITenantService` dependency (not needed anymore)
- Remove duplicate `FindUserTenantAccountsAsync` calls
- Treat stale hints as fallback (not unauthorized)
- Add "tenant-picker" redirect code

---

## Phase 5: Update Login Flow (SSR with Mapping Cookie)

**File:** `apps/front/src/routes/auth/login/login-page.tsx`

After login, we have userId from the response. Parse the mapping cookie, extract hint for this user, call GetRedirectCode, and update the mapping.

**Changes to action (around lines 100-160):**

```typescript
import { REDIRECT_CODE } from '@/shared/lib/constants';
import {
  readTenantHintsFromRequestHeaders,  // Preferred - parses cookies internally
  getTenantHintForUser,
  setTenantHintForUser,
  serializeTenantHintsForResponse,
  serializeClearLegacyCookieHeaders,  // Clears at all likely paths (hardened)
  isSecureCookieFromRequest,
} from '@/front/lib/cookies';

// ... after successful login, before getRedirectCode call ...

// Get userId from login response
const userId = loginResult.data?.userId;
if (!userId) {
    throw new Error('Login response missing userId');
}

// Read tenant hints mapping from request (no manual cookie.parse needed)
const { map: hintsMap, legacyTenantId } = readTenantHintsFromRequestHeaders(request);

// Get hint for current user (check mapping first, then legacy cookie)
let tenantHint = getTenantHintForUser(hintsMap, userId);
if (!tenantHint && legacyTenantId) {
    // Migration: use legacy cookie as hint candidate
    tenantHint = legacyTenantId;
}

// Call getRedirectCode with user-specific hint
const getRedirectCodeResult = await authedApiClient.auth.redirectCode.get({
    queryParameters: { tenantId: tenantHint },
});

const redirectCode = getRedirectCodeResult?.redirectCode || 'unauthorized';

let redirectPath: string;
const isSecure = isSecureCookieFromRequest(request);

if (redirectCode === REDIRECT_CODE.STAFF) {
    redirectPath = FRONT_PATH_NAMES.staff.root;
} else if (redirectCode === REDIRECT_CODE.UNAUTHORIZED) {
    redirectPath = FRONT_PATH_NAMES.unauthorized;
} else if (redirectCode === REDIRECT_CODE.TENANT_PICKER) {
    // Multiple tenants, no valid hint - go to tenant picker
    redirectPath = FRONT_PATH_NAMES.tenant()._root;
} else {
    // Valid tenant - update mapping and set cookie
    const updatedMap = setTenantHintForUser(hintsMap, userId, redirectCode);
    const mappingCookie = serializeTenantHintsForResponse(updatedMap, isSecure);
    responseHeaders.append('Set-Cookie', mappingCookie);

    // Clear legacy cookie if it existed (one-time migration)
    // This is the ONLY place legacy clearing happens - on successful tenant redirect
    // IMPORTANT: All cookies are in the same HTTP response, so from the browser's
    // perspective they are atomic. If the response fails, no cookies are modified.
    // The new mapping cookie is appended FIRST, ensuring it's set before legacy is cleared.
    // HARDENING: Clear at ALL likely paths to handle path-scoped duplicates
    if (legacyTenantId) {
        for (const clearHeader of serializeClearLegacyCookieHeaders()) {
            responseHeaders.append('Set-Cookie', clearHeader);
        }
    }

    redirectPath = FRONT_PATH_NAMES.tenant(redirectCode).root;
}

return redirect(redirectPath, { headers: responseHeaders });
```

**Key changes:**
- Use `readTenantHintsFromRequestHeaders(request)` - parses cookies internally, no manual `cookie.parse()` needed
- Extract user's hint with `getTenantHintForUser(map, userId)`
- Fallback to legacy cookie for migration
- Update mapping with `setTenantHintForUser()` and serialize for response
- Clear legacy cookie at ALL paths after migration (hardened: `serializeClearLegacyCookieHeaders()`)
- Handle `tenant-picker` redirect code

---

## Phase 6: Update Tenant Portal (Mapping Cookie + GetUserTenants Only)

**File:** `apps/front/src/routes/authed/tenant/_portal/tenant-portal-page.tsx`

The portal uses `GetUserTenants` only (no GetRedirectCode). It reads the mapping cookie and extracts hint for current user.

**New implementation:**

```typescript
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';

import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { SplashScreen } from '@/front/components/loading-screen/splash-screen';
import QueryDisplay from '@/front/components/query-display';
import { Iconify } from '@/front/components/iconify/iconify';
import { useTranslate } from '@/front/hooks/use-translate';
import { useGetUserAuthData, useGetUserTenants } from '@/front/lib/react-query/features/common/auth.hooks';
import {
    readTenantHintsFromBrowser,
    getTenantHintForUser,
    updateTenantHintInBrowser,
} from '@/front/lib/cookies';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

const RedirectToUnauthorized = () => {
    const navigate = useNavigate();
    useEffect(() => {
        navigate(FRONT_PATH_NAMES.unauthorized, { replace: true });
    }, [navigate]);
    return <SplashScreen />;
};

// Auto-redirect component - updates mapping cookie before redirecting
const AutoRedirect = ({ userId, tenantId }: { userId: string; tenantId: string }) => {
    const navigate = useNavigate();
    useEffect(() => {
        updateTenantHintInBrowser(userId, tenantId);
        navigate(FRONT_PATH_NAMES.tenant(tenantId).root, { replace: true });
    }, [userId, tenantId, navigate]);
    return <SplashScreen />;
};

type TenantInfo = {
    id?: string;
    name?: string;
    code?: string;
    logoUrl?: string | null;
};

type TenantCardProps = {
    tenant: TenantInfo;
    userId: string;
};

const TenantCard = ({ tenant, userId }: TenantCardProps) => {
    const navigate = useNavigate();

    const handleSelect = () => {
        if (tenant.id) {
            updateTenantHintInBrowser(userId, tenant.id);
            navigate(FRONT_PATH_NAMES.tenant(tenant.id).root);
        }
    };

    return (
        <ButtonBase
            onClick={handleSelect}
            sx={(theme) => ({
                width: '100%',
                p: 2,
                gap: 2,
                borderRadius: 1,
                border: `1px solid ${theme.palette.divider}`,
                justifyContent: 'flex-start',
                '&:hover': {
                    bgcolor: 'action.hover',
                },
            })}
        >
            {tenant.logoUrl ? (
                <Avatar
                    alt={tenant.name}
                    src={tenant.logoUrl}
                    sx={{ width: 40, height: 40 }}
                />
            ) : (
                <Box
                    sx={{
                        width: 40,
                        height: 40,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 1,
                        bgcolor: 'background.neutral',
                    }}
                >
                    <Iconify width={24} icon="solar:buildings-bold" sx={{ color: 'text.disabled' }} />
                </Box>
            )}
            <Box sx={{ textAlign: 'left' }}>
                <Typography variant="subtitle2">{tenant.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                    {tenant.code}
                </Typography>
            </Box>
        </ButtonBase>
    );
};

type TenantPickerViewProps = {
    tenants: TenantInfo[];
    userId: string;
};

const TenantPickerView = ({ tenants, userId }: TenantPickerViewProps) => {
    const { t } = useTranslate();

    return (
        <Box sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'background.default',
        }}>
            <Paper sx={{ p: 4, maxWidth: 400, width: '100%' }}>
                <Typography variant="h5" gutterBottom>
                    {t('select-organization')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    {t('choose-organization-to-continue')}
                </Typography>
                <Stack spacing={1}>
                    {tenants.map((tenant) => (
                        <TenantCard key={tenant.id} tenant={tenant} userId={userId} />
                    ))}
                </Stack>
            </Paper>
        </Box>
    );
};

const TenantPortalPage = () => {
    // Get auth data for userId
    const { data: authData } = useGetUserAuthData();
    const userId = authData?.id;

    // Get user's tenants
    const tenantsQuery = useGetUserTenants();

    // Read mapping cookie and extract hint for current user
    const cookieHint = useMemo(() => {
        if (!userId) return undefined;
        const hintsMap = readTenantHintsFromBrowser();
        return getTenantHintForUser(hintsMap, userId);
    }, [userId]);

    // Wait for auth data
    if (!userId) {
        return <SplashScreen />;
    }

    return (
        <QueryDisplay
            query={tenantsQuery}
            LoadingSlot={SplashScreen}
            ErrorSlot={RedirectToUnauthorized}
        >
            {({ data }) => {
                const tenants = data.tenants ?? [];
                const totalCount = data.totalCount ?? tenants.length;

                // 0 tenants → unauthorized
                if (totalCount === 0) {
                    return <RedirectToUnauthorized />;
                }

                // 1 tenant → redirect directly
                if (totalCount === 1 && tenants[0]?.id) {
                    return <AutoRedirect userId={userId} tenantId={tenants[0].id} />;
                }

                // ≥2 tenants → check if cookie hint matches one of them
                if (cookieHint) {
                    // Normalize API IDs for comparison (cookie hint is already lowercase)
                    const matchingTenant = tenants.find(
                        t => t.id?.toLowerCase() === cookieHint
                    );
                    if (matchingTenant?.id) {
                        // Valid hint - auto-select
                        return <AutoRedirect userId={userId} tenantId={matchingTenant.id} />;
                    }
                    // Stale hint - fall through to picker
                }

                // Show picker
                return <TenantPickerView tenants={tenants} userId={userId} />;
            }}
        </QueryDisplay>
    );
};

export default TenantPortalPage;
```

**Key features:**
- Uses `readTenantHintsFromBrowser()` to get mapping, `getTenantHintForUser()` to extract hint
- Uses `updateTenantHintInBrowser()` for writes (reads, updates, writes in one call)
- No `GetRedirectCode` call - uses `GetUserTenants` only
- Cookie hint validated locally against tenant list (safe - can't access unlisted tenants)

---

## Phase 7: Update Auth Layout (No Hint - Simplified SSR)

**File:** `apps/front/src/routes/auth/_layout/auth-layout.tsx`

**Decision:** Don't pass tenant hint from auth-layout. Getting userId requires calling `getUserAuthData` first, which would add a waterfall. Instead, let backend determine redirect without hint:
- Staff → `/staff`
- 1 tenant → that tenant
- ≥2 tenants → `tenant-picker` → user lands on `/app` which has the per-user cookie logic

**Changes to server loader (lines 47-59) - DON'T pass tenantId:**

```typescript
// Server loader - don't pass tenantId (simplifies SSR, avoids waterfall)
const getRedirectCode = safeRun(async () => {
    return authedApiClient.auth.redirectCode.get({
        queryParameters: {}, // No hint - backend determines redirect
    });
});
```

**Changes to clientLoader (lines 171-183) - handle `tenant-picker`:**

```typescript
import { REDIRECT_CODE } from '@/shared/lib/constants';

// ... in clientLoader ...

if (redirectCode && redirectCode !== REDIRECT_CODE.UNAUTHORIZED) {
    if (redirectCode === REDIRECT_CODE.STAFF) {
        return redirect(FRONT_PATH_NAMES.staff.root);
    }

    if (redirectCode === REDIRECT_CODE.TENANT_PICKER) {
        // Multiple tenants - go to tenant picker at /app (has per-user cookie logic)
        return redirect(FRONT_PATH_NAMES.tenant()._root);
    }

    // Valid single tenant - prefetch and redirect directly
    getQueryClient().prefetchQuery({
        queryKey: useGetTenantAuthData.getKey({ tenantId: redirectCode }),
        queryFn: () => useGetTenantAuthData.fetcher({ tenantId: redirectCode }),
    });
    return redirect(FRONT_PATH_NAMES.tenant(redirectCode).root);
}
```

**Add import:**
```typescript
import { REDIRECT_CODE } from '@/shared/lib/constants';
```

**Note:** Multi-tenant users visiting auth pages (while logged in) will go to `/app` which handles the per-user cookie hint. This is one extra step but keeps auth-layout simple.

---

## Phase 8: Update Tenant Layout (Update Mapping Cookie)

**File:** `apps/front/src/routes/authed/tenant/_layout/tenant-layout.tsx`

Update to write to the mapping cookie when user navigates to a tenant.

**Changes:**

```typescript
import { useGetUserAuthData } from '@/front/lib/react-query/features/common/auth.hooks';
import { updateTenantHintInBrowser } from '@/front/lib/cookies';

const TenantLayout = () => {
    const { tenantId } = useParams();
    const { data: authData } = useGetUserAuthData();

    useEffect(() => {
        const updateCookie = () => {
            if (tenantId && authData?.id) {
                // Updates the mapping cookie: reads current map, updates user's entry, writes back
                updateTenantHintInBrowser(authData.id, tenantId);
            }
        };

        updateCookie();

        // Also update on visibility change (tab becomes active)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                updateCookie();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [tenantId, authData?.id]);

    // ... rest unchanged ...
};
```

**Key changes:**
- Use `updateTenantHintInBrowser(userId, tenantId)` - convenience function that reads, updates, and writes the mapping
- Requires userId from auth data

---

## Phase 9: Add Translation Keys

**File:** `packages/shared/lib/i18n/json/common.en.json`

Add:
```json
{
  "select-organization": "Select Organization",
  "choose-organization-to-continue": "Choose which organization to continue with"
}
```

**File:** `packages/shared/lib/i18n/json/common.fr.json`

Add:
```json
{
  "select-organization": "Select an organization",
  "choose-organization-to-continue": "Choose the organization you want to continue with",
}
```

---

## Edge Cases Handled

| Case | Behavior |
|------|----------|
| User A logs out, User C logs in | Both entries in single cookie mapping; each user's hint preserved |
| User A returns after User C's session | User A's entry still in mapping → goes to their last tenant |
| >10 users on same browser | Oldest entries evicted (LRU); keeps cookie under size limit |
| Stale tenant hint (lost access) | Falls through to tenant selection (not hard "unauthorized") |
| Suspended/inactive tenant | `IsUserMemberOfActiveTenantAsync` returns false → falls through |
| Cookie tampering/corruption | Tolerant parsing returns empty map; user goes through normal flow |
| Invalid UUIDs in cookie | Skipped during parsing; valid entries still used |
| Multi-tab (same user) | Each tab reads/updates same mapping; last write wins (acceptable) |
| Staff user | Always redirects to `/staff` (unchanged, checked first) |
| User with 0 tenants | Returns "unauthorized" |
| User with 1 tenant | Redirects directly (no picker) |
| User with ≥2 tenants + valid hint | Auto-selects matching tenant |
| User with ≥2 tenants + invalid hint | Shows tenant picker |
| Legacy cookie `publyapp-last_used_tenant` | Used as fallback hint during migration, cleared in `login-page.tsx` action after successful redirect |
| Unknown cookie version (future) | Returns empty map; user goes through normal flow |

---

## Files to Modify (Summary)

### Backend
1. `apps/api/Src/Modules/Users/Services/AccountService.cs` - Add `IsUserMemberOfActiveTenantAsync` method
2. `apps/api/Src/Modules/Auth/Handlers/GetRedirectCode.cs` - New decision tree with stale hint fallback

### Frontend - Cookie Utils Layer (Centralized)

These files contain ALL tenant hint cookie logic:

| File | Change | Notes |
|------|--------|-------|
| `apps/front/src/lib/cookies/tenant-hint-cookie.utils.ts` | **NEW** | All parsing, serialization, validation, LRU logic |
| `apps/front/src/lib/cookies/index.ts` | Update exports | Public API only (see Factorization section) |

**Existing cookie files - DO NOT MODIFY:**
- `session-cookie.utils.ts` - Session cookie logic (unchanged)
- `server-cookie.utils.ts` - Server cookie helpers (unchanged)
- `logout.utils.ts` - Logout helpers (unchanged)

### Frontend - Shared Constants

| File | Change |
|------|--------|
| `packages/shared/lib/constants.ts` | Add `REDIRECT_CODE`, `TENANT_HINTS_COOKIE_KEY`, `TENANT_HINTS_MAX_ENTRIES`, `TENANT_HINTS_COOKIE_VERSION` |

### Frontend - Route Files (Consumers of Cookie Utils)

**CONSTRAINT:** These files must NOT contain ad-hoc cookie logic (`cookie.parse()`, `cookie.serialize()`, `document.cookie`). They import from `@/front/lib/cookies`.

| File | Change | Imports Used |
|------|--------|--------------|
| `apps/front/src/routes/auth/login/login-page.tsx` | Parse mapping, pass hint, update on redirect | `readTenantHintsFromRequestHeaders`, `getTenantHintForUser`, `setTenantHintForUser`, `serializeTenantHintsForResponse`, `serializeClearLegacyCookieHeaders`, `isSecureCookieFromRequest` |
| `apps/front/src/routes/authed/tenant/_portal/tenant-portal-page.tsx` | Read mapping + picker UI | `readTenantHintsFromBrowser`, `getTenantHintForUser`, `updateTenantHintInBrowser` |
| `apps/front/src/routes/authed/tenant/_layout/tenant-layout.tsx` | Update mapping on tenant navigation | `updateTenantHintInBrowser` |
| `apps/front/src/routes/auth/_layout/auth-layout.tsx` | Handle `tenant-picker` redirect code | (No cookie imports needed - backend determines redirect) |

### Frontend - Translations

| File | Change |
|------|--------|
| `packages/shared/lib/i18n/json/common.en.json` | Add `select-organization`, `choose-organization-to-continue` |
| `packages/shared/lib/i18n/json/common.fr.json` | Add French translations |

---

## Verification

### Manual Testing

1. **Test per-user isolation (key scenario):**
   - User A logs in → switches to Tenant B → logs out
   - User C logs in (belongs to Tenant C only)
   - Expected: User C goes to Tenant C (their entry added to mapping)
   - User A logs back in
   - Expected: User A goes to Tenant B (preference preserved in mapping!)
   - Verify: Single cookie `publyapp-last_tenants` contains both entries

2. **Test tenant picker (≥2 tenants, no hint):**
   - Clear ALL cookies
   - Log in as user with multiple tenants
   - Expected: Shows tenant picker page at `/app`

3. **Test single tenant (no picker):**
   - Log in as user with exactly 1 tenant
   - Expected: Redirects directly to that tenant (no picker)

4. **Test valid hint auto-select:**
   - User A logs in → picks Tenant A from picker
   - User A logs out → logs back in
   - Expected: Goes directly to Tenant A (hint valid in mapping)

5. **Test stale hint fallback (lost access):**
   - User loses access to a tenant (admin removes them)
   - User logs in with stale hint in mapping
   - Expected: Falls through to picker (if multiple) or single tenant (if one)

6. **Test suspended tenant hint:**
   - User has access to Tenant X, which gets suspended
   - User logs in with hint pointing to Tenant X
   - Expected: Falls through to selection (suspended tenant not valid)

7. **Test staff users unaffected:**
   - Staff user with any tenant cookie
   - Expected: Always redirects to `/staff` (staff check is first)

8. **Test legacy cookie migration:**
   - Manually set old cookie `publyapp-last_used_tenant` = valid-tenant-id
   - Log in as user who has access to that tenant
   - Expected: Uses legacy hint, migrates to new format, clears legacy cookie
   - Verify: `publyapp-last_used_tenant` cookie is gone, `publyapp-last_tenants` exists

9. **Test max entries eviction:**
   - Log in as 11+ different users on same browser
   - Expected: Only last 10 entries kept, oldest evicted
   - Verify: Cookie size stays reasonable (~740 bytes for 10 entries)

10. **Test corrupted cookie handling:**
    - Manually set `publyapp-last_tenants` = garbage value
    - Log in as any user
    - Expected: Treated as no hint, user goes through normal flow

### Tampering Tests (DevTools / DoS Prevention)

11. **Test oversized cookie value (DoS attempt):**
    - In DevTools, set `publyapp-last_tenants` to a very large value (e.g., 10KB of random data)
    - Log in as any user
    - Expected: App ignores the oversized hint, shows picker/normal flow, no crash or hang
    - Verify: No error in console except warning "[tenant-hint] Cookie value exceeds max length"

12. **Test thousands of entries (parsing DoS):**
    - In DevTools, set `publyapp-last_tenants` to `v1|` followed by 1000+ fake entries
    - Log in as any user
    - Expected: App only parses first MAX_ENTRIES + 1, ignores rest, normal flow

13. **Test duplicate legacy cookie at weird path:**
    - In DevTools, manually create `publyapp-last_used_tenant` cookie at path `/auth`
    - Also create one at path `/auth/login`
    - Log in as user who has access to that tenant
    - Expected: Migration clears legacy cookie at ALL paths (/, /auth, /auth/login, /app)
    - Verify: All `publyapp-last_used_tenant` cookies are gone regardless of path

14. **Test non-existent tenant ID in hint (unauthorized loop prevention):**
    - In DevTools, set user's hint to a random UUID that doesn't exist
    - Log in as that user
    - Expected: Falls through to picker/single tenant selection - NOT "unauthorized"
    - Verify: User is NOT stuck in redirect loop

15. **Test malicious payload in cookie:**
    - In DevTools, set `publyapp-last_tenants` to `<script>alert(1)</script>` or similar
    - Log in as any user
    - Expected: Treated as invalid (fails parsing), user goes through normal flow
    - Verify: No XSS, no error logged with raw payload content

### Cookie Format Verification

Use browser DevTools to verify:
- Cookie key: `publyapp-last_tenants` (single cookie)
- Cookie value format: `v1|userId:tenantId|userId:tenantId|...`
- Each entry has valid UUIDs separated by `:`
- Entries separated by `|`
- Most recent user's entry is at the end
