# Fix: Raw API Error JSON Leaking to Auth Page UI

**Issue:** [#199](https://github.com/radandevist/publyapp/issues/199)
**Branch:** `fix/auth-error-json-leak`

## Problem

When the API returned an error (e.g. 500 from database being down), SSR auth pages displayed the full raw JSON error payload in the MUI Alert component. This exposed sensitive internal details: `traceId`, response headers (`content-security-policy`, `server`, `x-frame-options`), API endpoint paths, and the full `additionalData` object.

### Root Cause Chain

```
API error response
  -> Kiota client throws error object (no message/messageEscaped property)
  -> safeRun.ts: JSON.stringify(err) used as Error.message  <-- PROBLEM 1
  -> safeRun.ts: ALL properties copied onto Error object    <-- PROBLEM 2
  -> serializeError() preserves everything for client
  -> Auth form calls getErrorMessage() which returns the raw JSON string
  -> MUI Alert renders it directly
```

### Affected Pages

- Login (`/login`)
- Accept Invitation (`/accept-invitation`)
- Reset Password (`/reset-password`)

Authed pages (TanStack Query) were NOT affected -- their `toApiFailure()` system already handles this correctly.

## Solution

Three layers of defense:

### Layer 1: `safeRun.ts` -- Stop creating toxic Error objects

**Before:** When an error object had no `message`/`messageEscaped`, the entire object was `JSON.stringify()`'d as the Error message. All properties from the original error were blindly copied onto the Error.

**After:**
- `extractErrorMessage()` reads `detail` or `title` from the error, falling back to `"An unexpected error occurred"`. No JSON.stringify.
- `SAFE_ERROR_PROPERTIES` allowlist controls which properties get copied onto the Error. Only `translationKey`, `detail`, `title`, `status`, `responseStatusCode`, `type`, `instance`, `errors`, and `key` are allowed. Response headers, traceId, and other internals are excluded.

### Layer 2: `getErrorMessage()` -- Last-resort sanitization

**Before:** Returned whatever string it found, including JSON blobs.

**After:** `sanitizeMessage()` checks if a message string starts with `{` or `[` (looks like JSON) and returns a generic `"An error occurred"` fallback instead.

### Layer 3: `getSerializedErrorMessage()` -- Centralized auth form error extraction

**Before:** Each auth form had its own 9-line block to extract `translationKey`/`key` from the serialized error, translate it, or fall back to `getErrorMessage()`. The login form checked `key`, the accept-invitation form didn't check translation keys at all, and the reset-password form extracted just `result.error.message` (losing the translation key).

**After:** Single utility function in `packages/shared/utils/error.utils.ts`:

```typescript
export const getSerializedErrorMessage = (
  error: unknown,
  t: TFunction<NameSpace>,
): string | null => {
  if (error == null) return null;

  if (typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    const translationKey = obj.translationKey || obj.key;
    if (typeof translationKey === 'string' && translationKey.length > 0) {
      return t(translationKey as never, { ns: 'response-message' });
    }
  }

  return getErrorMessage(error);
};
```

All three auth forms now use:

```typescript
const errorMessage = getSerializedErrorMessage(fetcher.data?.error, t);
```

## Files Changed

| File | Change |
|------|--------|
| `apps/front/src/lib/react-router/safeRun.ts` | Replace `JSON.stringify` with `extractErrorMessage()`. Add `SAFE_ERROR_PROPERTIES` allowlist for property copying. |
| `packages/shared/utils/error.utils.ts` | Add `sanitizeMessage()` JSON guard. Add `getSerializedErrorMessage()` utility. Change final fallback to generic string. |
| `apps/front/src/routes/auth/login/login-form.tsx` | Replace 9-line error extraction with `getSerializedErrorMessage()`. Remove lodash import. |
| `apps/front/src/routes/auth/accept-invitation/accept-invitation-page.tsx` | Replace error extraction with `getSerializedErrorMessage()`. |
| `apps/front/src/routes/auth/reset-password/reset-password-page.tsx` | Action now returns `serializeError(result.error)` (was `result.error.message`). Replace error extraction with `getSerializedErrorMessage()`. |

## What Users See Now

| Scenario | Before | After |
|----------|--------|-------|
| API returns error with `translationKey` | Sometimes translated, sometimes raw JSON | Always translated via i18n |
| API returns error without `translationKey` but with `detail` | Raw JSON blob | The `detail` string (e.g. "Invalid email or password") |
| API returns 500 (db down, etc.) | Full JSON with headers, traceId, CSP | "An error occurred" |
