# Client-Side Error Handling Implementation Plan

## Overview

Implement a robust, centralized error handling system for the frontend that:
1. Normalizes all API errors into a discriminated union (`ApiFailure`)
2. Uses Zod for reliable error shape detection
3. **Global toast by default** for errors and success messages (with opt-out)
4. Maps validation errors to form fields (never toasted)
5. Handles non-ProblemDetails failures gracefully (network, abort, unknown)

---

## Review Feedback Addressed

| Feedback | Resolution |
|----------|------------|
| Global success toast is risky/noisy | Success toasts are now **opt-in** via `meta.showSuccessToast` or `meta.successMessage` |
| Validation silently ignored | Validation errors **toast by default** unless `meta.validationHandledByForm: true` |
| AbortError handling | Added `kind: 'abort'` - cancelled requests are **always silent** |
| SSR import safety | `safeToast()` uses **dynamic import** to avoid module-eval crashes |
| i18n namespace loading | `safeTranslate()` uses `i18next.exists()` with fallback to `defaultValue` |
| Don't toast query errors | Queries **only log** - no toasts (error boundaries handle display) |
| TypeScript meta typing | **Module augmentation** for `@tanstack/react-query` Register interface |
| Zod schema strategy | Use `safeParse` + `.passthrough()` to preserve Kiota extras |
| Form validation DX | `withFormValidation()` helper ensures `meta.validationHandledByForm` is set |
| No backward compatibility | `isJsClientError` is **deleted** - all usages migrated to `toApiFailure()` |
| Centralized 401/403 handling | **Both**: Global `onAuthError` (logout) + ErrorBoundary (UI transition) |
| Dynamic import caching | Cache import promise + `.catch()` to avoid unhandled rejections |
| Nested validation fields | Handle `user.email` style keys + special keys (`""`, `_`, `general`) |
| TypeScript augmentation | Ensure `.d.ts` is in tsconfig `include` |
| Prevent auth-error loops | **Idempotent `onAuthError`**: module-level `authLogoutInProgress` flag prevents multiple parallel 401s from triggering repeated logout/navigation/toasts |
| Avoid catching intentional 401s | **`meta.skipAuthErrorHandler`**: opt-out for rare multi-step auth flows where 401 is expected (works for both queries and mutations) |
| 403 should not logout | **401-only logout**: 403 = "authenticated but forbidden" → let error boundary show `View403` / switch tenant flow. Don't boot valid users! |
| Query meta support | **Symmetric meta**: Queries also support `meta.skipAuthErrorHandler` (TanStack Query supports meta on queries too) |

---

## Design Principles

1. **Errors toast by default**: `problem`/`network`/`unknown` errors auto-toast (opt-out available)
2. **Validation toasts unless handled**: Validation errors toast UNLESS component declares it handles them
3. **Success is opt-in**: Success toasts only when explicitly requested via `meta.successMessage`
4. **Abort is silent**: Cancelled requests (navigation, unmount) never toast
5. **SSR-safe**: All toast/i18n calls guarded for server-side rendering
6. **401-only logout**: Global hook triggers logout for 401 only. 403 = "forbidden but authenticated" → error boundary shows View403 (no logout)

---

## 401/403 Auth Error Strategy

**Key distinction:**
- **401 Unauthorized** = session invalid/expired → **logout + redirect to login**
- **403 Forbidden** = authenticated but not allowed → **show View403 / switch tenant flow** (no logout!)

**Approach: Global hook for 401 + Error boundary for both**

```
401 error occurs (query or mutation)
         │
         ▼
┌─────────────────────────────────────┐
│  QueryClient onAuthError callback   │  ← FIRST: Triggers logout immediately
│  logout({ redirectCause: '...' })   │     Ensures no 401 is ever missed
└─────────────────────────────────────┘
         │
         ▼ (error still propagates)
┌─────────────────────────────────────┐
│  ErrorBoundary in authed-layout     │  ← SECOND: Shows transition UI
│  if (401) return <SplashScreen />   │     Clean UX during redirect
└─────────────────────────────────────┘

403 error occurs (query or mutation)
         │
         ▼
┌─────────────────────────────────────┐
│  Global handler: NO ACTION          │  ← 403 does NOT trigger logout
│  (user is authenticated, just       │     Don't boot valid users!
│   forbidden from this resource)     │
└─────────────────────────────────────┘
         │
         ▼ (error propagates to boundary)
┌─────────────────────────────────────┐
│  ErrorBoundary in authed-layout     │  ← Shows View403 or switch tenant UI
│  if (403) return <View403 />        │
└─────────────────────────────────────┘
```

**Why this split?**
- **401 = session invalid**: Must logout immediately. Global hook catches ALL 401s (queries, mutations, background refetches).
- **403 = forbidden but authenticated**: User is logged in but accessing wrong tenant/resource. Don't log them out! Let error boundary show appropriate UI.

**Implementation:**
1. `onAuthError` in QueryClient → only called for **401**, calls `logout()`
2. ErrorBoundary checks for 401 → returns `<SplashScreen />` (transition during redirect)
3. ErrorBoundary checks for 403 → returns `<View403 />` (no logout, show forbidden UI)

**Safeguards:**
1. **Idempotent logout**: Module-level `authLogoutInProgress` flag prevents multiple parallel 401s from triggering repeated logout/navigation/toasts
2. **Opt-out escape hatch**: `meta.skipAuthErrorHandler` (works for both queries and mutations) for rare cases where 401 is intentional (multi-step auth flows)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Kiota API Client                                 │
│              (throws errors / returns success responses)                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                ┌───────────────────┴───────────────────┐
                ▼                                       ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────┐
│         ERROR PATH                │   │        SUCCESS PATH               │
│                                   │   │                                   │
│   toApiFailure(error: unknown)    │   │   extractSuccessMessage(data)     │
│                                   │   │                                   │
│   Zod-validated conversion:       │   │   Extracts translationKey or      │
│   • validation → fieldErrors      │   │   message from API response       │
│   • problem → status, detail      │   │                                   │
│   • network → message             │   │                                   │
│   • abort → silent (no toast)     │   │                                   │
│   • unknown → message, raw        │   │                                   │
└───────────────────────────────────┘   └───────────────────────────────────┘
                │                                       │
                ▼                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     React Query MutationCache                           │
│                                                                         │
│  onError (global):                        onSuccess (global):           │
│  ┌─────────────────────────────────┐     ┌─────────────────────────────┐│
│  │ if (abort) return; // silent    │     │ if (meta.successMessage)    ││
│  │                                 │     │   toast(successMessage)     ││
│  │ if (skipGlobalErrorHandler)     │     │                             ││
│  │   return; // opt-out            │     │ else if (showSuccessToast)  ││
│  │                                 │     │   toast(API.translationKey) ││
│  │ if (validation) {               │     │                             ││
│  │   if (validationHandledByForm)  │     │ // else: no toast           ││
│  │     return; // form handles     │     │                             ││
│  │   toast.error(message) // else  │     │                             ││
│  │ }                               │     │                             ││
│  │                                 │     │                             ││
│  │ toast.error(message)            │     │                             ││
│  └─────────────────────────────────┘     └─────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                │                                       │
                ▼                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Component Level                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ DEFAULT: No onError/onSuccess needed - global handler works         ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ FORMS: Only handle validation errors                                ││
│  │                                                                     ││
│  │ onError: (error) => {                                               ││
│  │   const f = toApiFailure(error);                                    ││
│  │   if (f.kind === 'validation') {                                    ││
│  │     mapValidationErrors(f, form.setError);                          ││
│  │   }                                                                 ││
│  │   // problem/network/unknown → global handler toasts                ││
│  │ }                                                                   ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ OPT-OUT: Custom handling (alert, modal, navigate, etc.)             ││
│  │                                                                     ││
│  │ meta: { skipGlobalErrorHandler: true, skipGlobalSuccessHandler: true}│
│  │ onError: (error) => { /* show alert instead */ }                    ││
│  │ onSuccess: (data) => { /* navigate instead of toast */ }            ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Behavior Summary

| Scenario | Default Behavior | Override |
|----------|------------------|----------|
| **Success** | No toast | `meta.showSuccessToast: true` → use API's translationKey |
|            |          | `meta.successMessage: "key"` → use explicit key/message |
| **Validation (422)** | Toast generic validation error | `meta.validationHandledByForm: true` → skip toast, form handles |
| **Problem (4xx/5xx)** | Toast error message | `meta.skipGlobalErrorHandler: true` → handle locally |
| **Network error** | Toast "Network error" | `meta.skipGlobalErrorHandler: true` → handle locally |
| **Abort (cancelled)** | Silent (no toast) | N/A - always silent |
| **Unknown error** | Toast "Something went wrong" + log | `meta.skipGlobalErrorHandler: true` → handle locally |

### Mutation Meta Options

```typescript
type MutationMeta = {
  /** Opt-in: Extract and toast translationKey/message from API response */
  showSuccessToast?: boolean;

  /** Opt-in: Override with explicit success message (translation key or string) */
  successMessage?: string;

  /** Opt-out: Component handles validation via form.setError() */
  validationHandledByForm?: boolean;

  /** Opt-out: Component handles all errors locally */
  skipGlobalErrorHandler?: boolean;
};
```

**Success toast priority:**
1. `successMessage` (if provided) - uses this explicit key/message
2. `showSuccessToast: true` - extracts `translationKey` or `message` from API response
3. Neither - no success toast

---

## File Structure

```
apps/front/app/lib/
├── api-failure/
│   ├── index.ts                    # Re-exports
│   ├── types.ts                    # ApiFailure discriminated union
│   ├── schemas.ts                  # Zod schemas for ProblemDetails
│   ├── to-api-failure.ts           # Main conversion function
│   ├── map-validation-errors.ts    # Form field mapping utility
│   └── with-form-validation.ts     # React Query mutation helper
├── react-query/
│   ├── query-client.ts             # QueryClient with global error/success handling
│   └── ...existing files
└── js-client/
    ├── client-manager.ts           # Existing (no changes needed)
    ├── js-client-error.ts          # DELETE (no backward compat)
    └── ...existing files
```

---

## Phase 1: Create ApiFailure Types and Schemas

### File: `apps/front/app/lib/api-failure/types.ts`

```typescript
/**
 * Discriminated union representing all possible API failure types.
 *
 * This approach:
 * - Works across SSR/client boundaries (plain objects serialize correctly)
 * - Enables exhaustive switch statements with TypeScript
 * - Avoids instanceof/prototype chain issues
 */

/**
 * Validation error from the API (HTTP 422).
 * Contains field-level errors that should be mapped to form fields.
 */
export type ValidationFailure = {
  kind: 'validation';
  status: number;
  translationKey: string | undefined;
  detail: string | undefined;
  title: string | undefined;
  fieldErrors: Record<string, string[]>;
  raw: unknown;
};

/**
 * General API error (HTTP 400, 401, 403, 404, 500, etc.).
 * Should be displayed as a toast notification.
 */
export type ProblemFailure = {
  kind: 'problem';
  status: number;
  translationKey: string | undefined;
  detail: string | undefined;
  title: string | undefined;
  raw: unknown;
};

/**
 * Network-level failure (offline, DNS, CORS, timeout).
 * Should be displayed as a toast notification.
 */
export type NetworkFailure = {
  kind: 'network';
  message: string;
  raw: unknown;
};

/**
 * Request was aborted/cancelled (navigation, component unmount, timeout).
 * Should NEVER be displayed to user - this is expected behavior.
 */
export type AbortFailure = {
  kind: 'abort';
  raw: unknown;
};

/**
 * Unknown/unexpected error.
 * Should be logged and displayed as a generic toast.
 */
export type UnknownFailure = {
  kind: 'unknown';
  message: string;
  raw: unknown;
};

/**
 * Union of all failure types.
 */
export type ApiFailure =
  | ValidationFailure
  | ProblemFailure
  | NetworkFailure
  | AbortFailure
  | UnknownFailure;

/**
 * Type guard for ValidationFailure.
 */
export function isValidationFailure(failure: ApiFailure): failure is ValidationFailure {
  return failure.kind === 'validation';
}

/**
 * Type guard for ProblemFailure.
 */
export function isProblemFailure(failure: ApiFailure): failure is ProblemFailure {
  return failure.kind === 'problem';
}

/**
 * Type guard for NetworkFailure.
 */
export function isNetworkFailure(failure: ApiFailure): failure is NetworkFailure {
  return failure.kind === 'network';
}

/**
 * Type guard for AbortFailure.
 */
export function isAbortFailure(failure: ApiFailure): failure is AbortFailure {
  return failure.kind === 'abort';
}

/**
 * Type guard for UnknownFailure.
 */
export function isUnknownFailure(failure: ApiFailure): failure is UnknownFailure {
  return failure.kind === 'unknown';
}
```

### File: `apps/front/app/lib/api-failure/schemas.ts`

```typescript
import { z } from 'zod';

/**
 * Zod schema for RFC 7807 ProblemDetails with our custom translationKey.
 *
 * Using Zod instead of simple 'in' checks because:
 * - Validates the actual shape, not just property existence
 * - Prevents false positives from random objects with 'detail' property
 * - Provides type inference automatically
 * - Already in the stack (used for form validation with i18n)
 */

/**
 * Base ProblemDetails schema matching Kiota's generated AppProblemDetails.
 *
 * Uses .passthrough() to preserve any extra Kiota fields (responseHeaders, etc.)
 * that we don't explicitly define but might need later.
 */
export const AppProblemDetailsSchema = z.object({
  // RFC 7807 standard fields
  type: z.string().nullish(),
  title: z.string().nullish(),
  status: z.number().nullish(),
  detail: z.string().nullish(),
  instance: z.string().nullish(),

  // Our custom extension for i18n
  translationKey: z.string().nullish(),

  // Kiota's ApiError fields (added during error handling)
  // responseStatusCode is the "real" status from Kiota - prefer this over status
  responseStatusCode: z.number().optional(),
  responseHeaders: z.record(z.array(z.string())).optional(),
}).passthrough(); // Preserve any extra fields from Kiota

/**
 * ValidationProblemDetails schema - extends AppProblemDetails with errors dictionary.
 */
export const ValidationProblemDetailsSchema = AppProblemDetailsSchema.extend({
  errors: z.record(z.array(z.string())).nullish(),
}).passthrough();

/**
 * Inferred types from schemas.
 */
export type AppProblemDetailsShape = z.infer<typeof AppProblemDetailsSchema>;
export type ValidationProblemDetailsShape = z.infer<typeof ValidationProblemDetailsSchema>;

/**
 * Type guard: checks if error matches AppProblemDetails shape.
 */
export function isAppProblemDetailsShape(error: unknown): error is AppProblemDetailsShape {
  return AppProblemDetailsSchema.safeParse(error).success;
}

/**
 * Type guard: checks if error matches ValidationProblemDetails shape.
 * Must have non-null errors property with at least one entry.
 */
export function isValidationProblemDetailsShape(error: unknown): error is ValidationProblemDetailsShape {
  const result = ValidationProblemDetailsSchema.safeParse(error);
  if (!result.success) return false;

  // Must have actual errors to be considered a validation error
  const errors = result.data.errors;
  return errors != null && Object.keys(errors).length > 0;
}

/**
 * Safe parse that returns the data if valid, undefined otherwise.
 */
export function parseAppProblemDetails(error: unknown): AppProblemDetailsShape | undefined {
  const result = AppProblemDetailsSchema.safeParse(error);
  return result.success ? result.data : undefined;
}

export function parseValidationProblemDetails(error: unknown): ValidationProblemDetailsShape | undefined {
  const result = ValidationProblemDetailsSchema.safeParse(error);
  if (!result.success) return undefined;
  if (!result.data.errors || Object.keys(result.data.errors).length === 0) return undefined;
  return result.data;
}
```

### File: `apps/front/app/lib/api-failure/to-api-failure.ts`

```typescript
import type { ApiFailure } from './types';
import {
  isValidationProblemDetailsShape,
  isAppProblemDetailsShape,
  parseValidationProblemDetails,
  parseAppProblemDetails,
} from './schemas';

/**
 * Converts any error into a normalized ApiFailure discriminated union.
 *
 * This is the single source of truth for error classification.
 * All error handling in the app should go through this function.
 *
 * @param error - Any error thrown by the API client or network layer
 * @returns Normalized ApiFailure object
 */
export function toApiFailure(error: unknown): ApiFailure {
  // 1. ValidationProblemDetails (HTTP 422) - field-level errors
  const validationDetails = parseValidationProblemDetails(error);
  if (validationDetails) {
    return {
      kind: 'validation',
      status: validationDetails.status ?? validationDetails.responseStatusCode ?? 422,
      translationKey: validationDetails.translationKey ?? undefined,
      detail: validationDetails.detail ?? undefined,
      title: validationDetails.title ?? undefined,
      fieldErrors: validationDetails.errors ?? {},
      raw: error,
    };
  }

  // 2. AppProblemDetails (HTTP 400, 401, 403, 404, 500, etc.)
  const problemDetails = parseAppProblemDetails(error);
  if (problemDetails) {
    return {
      kind: 'problem',
      status: problemDetails.status ?? problemDetails.responseStatusCode ?? 500,
      translationKey: problemDetails.translationKey ?? undefined,
      detail: problemDetails.detail ?? undefined,
      title: problemDetails.title ?? undefined,
      raw: error,
    };
  }

  // 3. AbortError - request was cancelled (user navigated away, component unmount)
  // IMPORTANT: Check this BEFORE network errors - AbortError should be silent
  if (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError') ||
    (error instanceof Error && error.message.includes('aborted'))
  ) {
    return {
      kind: 'abort',
      raw: error,
    };
  }

  // 4. Network errors - TypeError usually indicates fetch failure
  if (error instanceof TypeError) {
    // Common fetch failure messages
    const message = error.message.toLowerCase();
    if (
      message.includes('fetch') ||
      message.includes('network') ||
      message.includes('failed to fetch') ||
      message.includes('networkerror')
    ) {
      return {
        kind: 'network',
        message: 'Network error - please check your connection',
        raw: error,
      };
    }
  }

  // 5. Raw Response object (rare - usually means unexpected response format)
  if (error instanceof Response) {
    return {
      kind: 'problem',
      status: error.status,
      translationKey: undefined,
      detail: `HTTP ${error.status}: ${error.statusText}`,
      title: error.statusText,
      raw: error,
    };
  }

  // 6. Kiota's DefaultApiError or similar (has responseStatusCode but failed shape validation)
  if (
    error != null &&
    typeof error === 'object' &&
    'responseStatusCode' in error &&
    typeof (error as Record<string, unknown>).responseStatusCode === 'number'
  ) {
    const statusCode = (error as { responseStatusCode: number }).responseStatusCode;
    return {
      kind: 'problem',
      status: statusCode,
      translationKey: undefined,
      detail: error instanceof Error ? error.message : `HTTP Error ${statusCode}`,
      title: `HTTP Error ${statusCode}`,
      raw: error,
    };
  }

  // 7. Standard Error object
  if (error instanceof Error) {
    return {
      kind: 'unknown',
      message: error.message || 'An unexpected error occurred',
      raw: error,
    };
  }

  // 8. Truly unknown - string, null, undefined, or other primitive
  return {
    kind: 'unknown',
    message: error != null ? String(error) : 'An unexpected error occurred',
    raw: error,
  };
}

/**
 * Helper to get a user-friendly message from any ApiFailure.
 * Useful for simple toast notifications.
 */
export function getFailureMessage(failure: ApiFailure, t?: (key: string) => string): string {
  switch (failure.kind) {
    case 'validation':
      // For validation, prefer translationKey, then generic message
      if (failure.translationKey && t) {
        return t(failure.translationKey);
      }
      return failure.detail ?? failure.title ?? 'Validation failed';

    case 'problem':
      // For problem, prefer translationKey, then detail, then title
      if (failure.translationKey && t) {
        return t(failure.translationKey);
      }
      return failure.detail ?? failure.title ?? 'An error occurred';

    case 'network':
      return failure.message;

    case 'unknown':
      return failure.message;
  }
}
```

### File: `apps/front/app/lib/api-failure/map-validation-errors.ts`

```typescript
import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';
import type { ValidationFailure } from './types';

/**
 * Options for mapping validation errors to form fields.
 */
export type MapValidationErrorsOptions<TForm extends FieldValues> = {
  /**
   * Maps server field names to form field names.
   * Use when server uses different naming conventions (e.g., PascalCase vs camelCase).
   *
   * @example
   * { 'Email': 'email', 'FirstName': 'firstName' }
   */
  fieldMapping?: Record<string, FieldPath<TForm>>;

  /**
   * If true, converts PascalCase server field names to camelCase automatically.
   * @default true
   */
  autoConvertCase?: boolean;

  /**
   * How to handle non-field errors (empty string "", "_", "general", or nested paths).
   * - 'root': Set as root form error (form.setError('root', ...))
   * - 'ignore': Silently ignore these errors
   * - 'collect': Return in unmappedErrors for custom handling
   * @default 'collect'
   */
  nonFieldErrorStrategy?: 'root' | 'ignore' | 'collect';
};

/**
 * Result of mapping validation errors.
 */
export type MapValidationErrorsResult = {
  /** Number of errors successfully mapped to form fields */
  mappedCount: number;
  /** Errors that couldn't be mapped to any form field */
  unmappedErrors: Array<{ field: string; messages: string[] }>;
};

/**
 * Converts PascalCase to camelCase.
 */
function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Checks if a field name is a "non-field" error (general form error, not tied to a specific field).
 * Common patterns: "", "_", "general", "$", or dot-notation paths the form doesn't have.
 */
function isNonFieldError(fieldName: string): boolean {
  const nonFieldPatterns = ['', '_', 'general', '$', 'root'];
  return nonFieldPatterns.includes(fieldName.toLowerCase());
}

/**
 * Maps server validation errors to React Hook Form field errors.
 *
 * This function:
 * - Sets form field errors using setError()
 * - Handles field name mapping (server vs form naming conventions)
 * - Handles nested field names (e.g., "user.email" → "user.email" in RHF)
 * - Handles non-field errors ("", "_", "general") based on strategy
 * - Returns unmapped errors for optional toast display
 *
 * @param failure - ValidationFailure from toApiFailure()
 * @param setError - React Hook Form's setError function
 * @param options - Mapping options
 * @returns Result with mapped count and unmapped errors
 *
 * @example
 * const { mutate } = useCreateUser({
 *   onError: (error) => {
 *     const failure = toApiFailure(error);
 *     if (failure.kind === 'validation') {
 *       const result = mapValidationErrors(failure, form.setError, {
 *         fieldMapping: { 'Email': 'email' },
 *         nonFieldErrorStrategy: 'root', // Set general errors as root form error
 *       });
 *       if (result.unmappedErrors.length > 0) {
 *         // Optionally toast unmapped errors
 *       }
 *     }
 *   }
 * });
 */
export function mapValidationErrors<TForm extends FieldValues>(
  failure: ValidationFailure,
  setError: UseFormSetError<TForm>,
  options: MapValidationErrorsOptions<TForm> = {},
): MapValidationErrorsResult {
  const { fieldMapping = {}, autoConvertCase = true, nonFieldErrorStrategy = 'collect' } = options;

  const result: MapValidationErrorsResult = {
    mappedCount: 0,
    unmappedErrors: [],
  };

  for (const [serverField, messages] of Object.entries(failure.fieldErrors)) {
    if (!messages || messages.length === 0) continue;

    // Handle non-field errors (general form errors)
    if (isNonFieldError(serverField)) {
      switch (nonFieldErrorStrategy) {
        case 'root':
          // Set as root form error
          try {
            setError('root' as FieldPath<TForm>, {
              type: 'server',
              message: messages.join(', '),
            });
            result.mappedCount++;
          } catch {
            result.unmappedErrors.push({ field: serverField, messages });
          }
          break;
        case 'ignore':
          // Silently ignore
          break;
        case 'collect':
        default:
          result.unmappedErrors.push({ field: serverField, messages });
          break;
      }
      continue;
    }

    // Try to find the form field name
    let formField: string;

    // 1. Check explicit mapping first
    if (serverField in fieldMapping) {
      formField = fieldMapping[serverField];
    }
    // 2. Handle nested paths (e.g., "User.Email" → "user.email")
    else if (serverField.includes('.')) {
      formField = autoConvertCase
        ? serverField.split('.').map(toCamelCase).join('.')
        : serverField;
    }
    // 3. Try auto case conversion
    else if (autoConvertCase) {
      formField = toCamelCase(serverField);
    }
    // 4. Use server field name as-is
    else {
      formField = serverField;
    }

    // Try to set the error on the form field
    try {
      setError(formField as FieldPath<TForm>, {
        type: 'server',
        message: messages[0], // Show first error message
      });
      result.mappedCount++;
    } catch {
      // Field doesn't exist in form - collect for potential toast
      result.unmappedErrors.push({ field: serverField, messages });
    }
  }

  return result;
}

/**
 * Formats unmapped errors into a single string for toast display.
 */
export function formatUnmappedErrors(
  unmappedErrors: Array<{ field: string; messages: string[] }>,
): string {
  return unmappedErrors
    .map(({ field, messages }) => `${field}: ${messages.join(', ')}`)
    .join('\n');
}
```

### File: `apps/front/app/lib/api-failure/index.ts`

```typescript
// Types
export type {
  ApiFailure,
  ValidationFailure,
  ProblemFailure,
  NetworkFailure,
  AbortFailure,
  UnknownFailure,
} from './types';

export {
  isValidationFailure,
  isProblemFailure,
  isNetworkFailure,
  isAbortFailure,
  isUnknownFailure,
} from './types';

// Main conversion function
export { toApiFailure, getFailureMessage } from './to-api-failure';

// Form field mapping
export {
  mapValidationErrors,
  formatUnmappedErrors,
  type MapValidationErrorsOptions,
  type MapValidationErrorsResult,
} from './map-validation-errors';

// React Query helpers
export { withFormValidation } from './with-form-validation';

// Schemas (for advanced use cases)
export {
  AppProblemDetailsSchema,
  ValidationProblemDetailsSchema,
  isAppProblemDetailsShape,
  isValidationProblemDetailsShape,
} from './schemas';
```

### File: `apps/front/app/lib/api-failure/with-form-validation.ts`

```typescript
import type { UseMutationOptions } from '@tanstack/react-query';
import type { FieldValues, UseFormSetError } from 'react-hook-form';
import { toApiFailure } from './to-api-failure';
import { mapValidationErrors, type MapValidationErrorsOptions } from './map-validation-errors';

/**
 * Wraps mutation options to automatically handle form validation errors.
 *
 * This helper:
 * 1. Sets meta.validationHandledByForm: true (prevents global toast for validation)
 * 2. Maps validation errors to form fields in onError
 * 3. Calls your onError AFTER mapping (so you can access failure and do additional handling)
 *
 * **onError execution order:**
 * 1. Convert error to ApiFailure
 * 2. If validation: map to form fields
 * 3. Call your onError (if provided) - can access error, do additional handling
 * 4. Global handler runs (but skips validation toast due to meta flag)
 *
 * @example
 * const form = useForm<MyFormData>();
 *
 * const { mutate } = useCreateStaffUser(
 *   withFormValidation(form.setError, {
 *     meta: { showSuccessToast: true },
 *     onSuccess: () => navigate('/staff-users'),
 *     onError: (error) => {
 *       // This runs AFTER field errors are mapped
 *       // You can do additional handling here if needed
 *       const failure = toApiFailure(error);
 *       if (failure.kind === 'validation' && failure.fieldErrors['_']) {
 *         // Handle general validation errors specially
 *       }
 *     },
 *   })
 * );
 */
export function withFormValidation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
  TForm extends FieldValues = FieldValues,
>(
  setError: UseFormSetError<TForm>,
  options: UseMutationOptions<TData, TError, TVariables, TContext> & {
    fieldMapping?: MapValidationErrorsOptions<TForm>['fieldMapping'];
    nonFieldErrorStrategy?: MapValidationErrorsOptions<TForm>['nonFieldErrorStrategy'];
  } = {},
): UseMutationOptions<TData, TError, TVariables, TContext> {
  const { onError, fieldMapping, nonFieldErrorStrategy, meta, ...rest } = options;

  return {
    ...rest,
    meta: {
      ...meta,
      validationHandledByForm: true, // Prevent global toast for validation errors
    },
    onError: (error, variables, context) => {
      // Step 1: Handle validation errors by mapping to form fields
      const failure = toApiFailure(error);
      if (failure.kind === 'validation') {
        const result = mapValidationErrors(failure, setError, {
          fieldMapping,
          nonFieldErrorStrategy,
        });

        // Log unmapped errors in dev for debugging
        if (result.unmappedErrors.length > 0 && import.meta.env.DEV) {
          console.warn('[withFormValidation] Unmapped validation errors:', result.unmappedErrors);
        }
      }

      // Step 2: Call original onError if provided
      // This runs AFTER field mapping, so you can do additional handling
      onError?.(error, variables, context);
    },
  };
}
```

**Usage:**

```typescript
// Simple - just pass setError
const { mutate } = useCreateStaffUser(
  withFormValidation(form.setError, {
    meta: { showSuccessToast: true },
    onSuccess: () => navigate('/staff-users'),
  })
);

// With field mapping (when server uses different naming)
const { mutate } = useCreateStaffUser(
  withFormValidation(form.setError, {
    fieldMapping: { 'Email': 'email', 'FirstName': 'firstName' },
    meta: { showSuccessToast: true },
    onSuccess: () => navigate('/staff-users'),
  })
);
```

---

## Phase 2: Configure Global Error Handling in React Query

### File: `apps/front/app/lib/react-query/query-client.ts`

```typescript
import { QueryClient, MutationCache, QueryCache } from '@tanstack/react-query';
import i18next from 'i18next';
import { toApiFailure } from '@/front/lib/api-failure';

// NOTE: Do NOT import toast at module level - some toast libs crash on SSR import
// We use dynamic import inside safeToast() instead

/**
 * Auth error callback type.
 * Called for 401 errors ONLY from both queries and mutations.
 * 403 = "authenticated but forbidden" → handled by error boundary (View403/switch tenant)
 * This ensures centralized session invalidation regardless of where the error occurs.
 */
export type OnAuthErrorCallback = (
  status: 401,
  failure: ReturnType<typeof toApiFailure>,
) => void;

/**
 * Mutation meta options for controlling global handlers.
 */
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Opt-in: Extract and toast translationKey/message from API response */
      showSuccessToast?: boolean;
      /** Opt-in: Override with explicit success message (translation key or string) */
      successMessage?: string;
      /** Opt-out: Component handles validation via form.setError() */
      validationHandledByForm?: boolean;
      /** Opt-out: Component handles all errors locally */
      skipGlobalErrorHandler?: boolean;
      /** Opt-out: Don't trigger onAuthError for 401/403 (rare: multi-step auth flows) */
      skipAuthErrorHandler?: boolean;
    };
  }
}

// Cache the toast module promise to avoid multiple imports on rapid toasts
let toastModulePromise: Promise<typeof import('sonner')> | null = null;

// Idempotency flag to prevent multiple parallel 401s from triggering repeated logout/navigation/toasts
let authLogoutInProgress = false;

/**
 * Reset the auth logout flag.
 * Only needed for testing or very rare edge cases where you need to re-trigger auth handling.
 * In normal use, the flag resets naturally on page reload after redirect.
 */
export function resetAuthLogoutFlag(): void {
  authLogoutInProgress = false;
}

/**
 * SSR-safe toast wrapper.
 * Uses dynamic import to avoid module-eval crashes on server.
 * Caches the import promise to avoid multiple imports on rapid toasts.
 */
async function safeToast(type: 'success' | 'error', message: string): Promise<void> {
  // Guard: don't even start the import on server
  if (typeof window === 'undefined') return;

  // Cache the import promise
  if (!toastModulePromise) {
    toastModulePromise = import('sonner');
  }

  const { toast } = await toastModulePromise;

  if (type === 'success') {
    toast.success(message);
  } else {
    toast.error(message);
  }
}

// Fire-and-forget wrapper (handlers can't be async)
// Includes .catch() to avoid unhandled promise rejections
function showToast(type: 'success' | 'error', message: string): void {
  safeToast(type, message).catch((err) => {
    // Log but don't crash - toast failure shouldn't break the app
    console.error('[Toast Error]', err);
  });
}

/**
 * SSR-safe and namespace-safe translation helper.
 * Falls back to defaultValue if namespace not loaded.
 */
function safeTranslate(key: string, defaultValue: string, ns = 'response'): string {
  // Check if namespace is loaded and key exists
  if (i18next.exists(key, { ns })) {
    return i18next.t(key, { ns });
  }
  return defaultValue;
}

/**
 * Get user-friendly error message from failure.
 */
function getErrorMessage(failure: ReturnType<typeof toApiFailure>): string {
  switch (failure.kind) {
    case 'validation':
      // Generic validation message - specific errors are on form fields
      return failure.translationKey
        ? safeTranslate(failure.translationKey, 'Validation failed')
        : failure.detail ?? 'Please check your input and try again';

    case 'problem':
      return failure.translationKey
        ? safeTranslate(failure.translationKey, failure.detail ?? 'An error occurred')
        : failure.detail ?? failure.title ?? 'An error occurred';

    case 'network':
      return safeTranslate('network-error', failure.message);

    case 'abort':
      return ''; // Never displayed

    case 'unknown':
      return safeTranslate('unknown-error', 'Something went wrong');
  }
}

/**
 * Create a mutation error handler with auth callback.
 */
function createMutationErrorHandler(onAuthError?: OnAuthErrorCallback) {
  return function handleMutationError(
    error: unknown,
    _variables: unknown,
    _context: unknown,
    mutation: { meta?: Register['mutationMeta'] },
  ): void {
    const failure = toApiFailure(error);

    // Log all errors for debugging (even on server for SSR debugging)
    if (import.meta.env.DEV) {
      console.error('[Mutation Error]', failure.kind, failure);
    }

    // Abort errors are ALWAYS silent - user navigated away or request was cancelled
    if (failure.kind === 'abort') {
      return;
    }

    // Centralized auth error handling - 401 ONLY triggers logout
    // 403 = "authenticated but forbidden" → let error boundary show View403/switch tenant
    // Check skipAuthErrorHandler for rare cases (multi-step auth flows)
    if (
      failure.kind === 'problem' &&
      failure.status === 401 &&
      !mutation.meta?.skipAuthErrorHandler
    ) {
      // Idempotent: only trigger once even if multiple parallel requests fail
      if (!authLogoutInProgress && onAuthError) {
        authLogoutInProgress = true;
        onAuthError(failure.status, failure);
        // Note: authLogoutInProgress stays true - reset happens on page reload after redirect
      }
      // Don't toast 401 errors - the redirect/logout handles the UX
      return;
    }

    // Allow full opt-out of global error handling
    if (mutation.meta?.skipGlobalErrorHandler) {
      return;
    }

    // Validation: toast UNLESS component declared it handles validation
    if (failure.kind === 'validation') {
      if (mutation.meta?.validationHandledByForm) {
        return; // Component handles via mapValidationErrors()
      }
      // Default: toast validation error (component forgot to handle it)
      showToast('error', getErrorMessage(failure));
      return;
    }

    // problem/network/unknown: always toast
    showToast('error', getErrorMessage(failure));
  };
}

/**
 * Extract success message from API response.
 * Looks for translationKey first, then message.
 */
function extractSuccessMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;

  const response = data as Record<string, unknown>;

  // Try translationKey first (our custom field for i18n)
  if (response.translationKey && typeof response.translationKey === 'string') {
    return safeTranslate(
      response.translationKey,
      (response.message as string) ?? 'Success'
    );
  }

  // Fallback to message field
  if (response.message && typeof response.message === 'string') {
    return response.message;
  }

  return null;
}

/**
 * Global mutation success handler.
 * Success toasts are OPT-IN via meta.showSuccessToast or meta.successMessage.
 *
 * Priority:
 * 1. meta.successMessage - explicit message/key (highest priority)
 * 2. meta.showSuccessToast - extract from API response
 * 3. Neither - no toast
 */
function handleMutationSuccess(
  data: unknown,
  _variables: unknown,
  _context: unknown,
  mutation: { meta?: Register['mutationMeta'] },
): void {
  const meta = mutation.meta;

  // Priority 1: Explicit success message
  if (meta?.successMessage) {
    const message = i18next.exists(meta.successMessage, { ns: 'response' })
      ? i18next.t(meta.successMessage, { ns: 'response' })
      : meta.successMessage;
    showToast('success', message);
    return;
  }

  // Priority 2: Extract from API response
  if (meta?.showSuccessToast) {
    const message = extractSuccessMessage(data);
    if (message) {
      showToast('success', message);
    }
  }

  // Priority 3: Neither - no toast (default)
}

/**
 * Create a query error handler with auth callback.
 * Queries use error boundaries for display, but we still need centralized auth handling.
 */
function createQueryErrorHandler(onAuthError?: OnAuthErrorCallback) {
  return function handleQueryError(
    error: unknown,
    query: { meta?: { skipAuthErrorHandler?: boolean } },
  ): void {
    const failure = toApiFailure(error);

    // Don't log abort errors - they're expected during navigation
    if (failure.kind === 'abort') return;

    if (import.meta.env.DEV) {
      console.error('[Query Error]', failure.kind, failure);
    }

    // Centralized auth error handling - 401 ONLY triggers logout
    // 403 = "authenticated but forbidden" → let error boundary show View403/switch tenant
    // This catches 401 even if the query never hits an error boundary
    if (
      failure.kind === 'problem' &&
      failure.status === 401 &&
      !query.meta?.skipAuthErrorHandler
    ) {
      // Idempotent: only trigger once even if multiple parallel requests fail
      if (!authLogoutInProgress && onAuthError) {
        authLogoutInProgress = true;
        onAuthError(failure.status, failure);
        // Note: authLogoutInProgress stays true - reset happens on page reload after redirect
      }
    }

    // Don't toast query errors - let error boundaries handle display
  };
}

/**
 * Options for creating the QueryClient.
 */
export type CreateQueryClientOptions = {
  /**
   * Called when a 401 or 403 error occurs (from queries OR mutations).
   * Use this for centralized auth invalidation (logout, redirect to login, etc.)
   *
   * @example
   * onAuthError: (status, failure) => {
   *   if (status === 401) {
   *     logout({ redirectCause: 'session_expired' });
   *   } else if (status === 403) {
   *     // Could navigate to /forbidden or just let error boundary handle
   *   }
   * }
   */
  onAuthError?: OnAuthErrorCallback;
};

/**
 * Create QueryClient with centralized error handling.
 */
export function createQueryClient(options: CreateQueryClientOptions = {}): QueryClient {
  const { onAuthError } = options;

  return new QueryClient({
    defaultOptions: {
      queries: {
        // Don't retry on 4xx errors or aborts
        retry: (failureCount, error) => {
          const failure = toApiFailure(error);

          // Never retry aborts
          if (failure.kind === 'abort') return false;

          // Don't retry client errors (4xx)
          if (failure.kind === 'problem' && failure.status >= 400 && failure.status < 500) {
            return false;
          }

          // Retry other errors up to 2 times
          return failureCount < 2;
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
      },
      mutations: {
        retry: false,
      },
    },
    queryCache: new QueryCache({
      onError: createQueryErrorHandler(onAuthError),
    }),
    mutationCache: new MutationCache({
      onError: createMutationErrorHandler(onAuthError),
      onSuccess: handleMutationSuccess,
    }),
  });
}

// Singleton for client-side
let browserQueryClient: QueryClient | undefined;

/**
 * Get or create the QueryClient singleton.
 * Call this in your app's root to get the client.
 *
 * @param options - Options passed to createQueryClient (only used on first call)
 */
export function getQueryClient(options?: CreateQueryClientOptions): QueryClient {
  // Server: always create new client (no caching across requests)
  if (typeof window === 'undefined') {
    return createQueryClient(options);
  }

  // Browser: reuse singleton
  if (!browserQueryClient) {
    browserQueryClient = createQueryClient(options);
  }
  return browserQueryClient;
}
```

### Usage in App Root

```typescript
// apps/front/app/root.tsx (or wherever you set up providers)
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/front/lib/react-query/query-client';
import { useAuth } from '@/front/lib/auth';

function App() {
  const { logout } = useAuth();

  // Create query client with auth error handling
  // Note: onAuthError is ONLY called for 401 (not 403)
  // 403 = "forbidden but authenticated" → handled by error boundary (View403)
  const queryClient = getQueryClient({
    onAuthError: (_status, _failure) => {
      // Session expired or invalid - redirect to login
      // _status is always 401 here (403 goes to error boundary instead)
      logout({ redirectCause: 'session_expired' });
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      {/* ... */}
    </QueryClientProvider>
  );
}
```

---

## Phase 3: Update Form Components

### Pattern: Form Component with Validation Error Handling

```typescript
// Example: apps/front/app/routes/authed/staff/staff-users/new/components/new-staff-user-form.tsx

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from '@tanstack/react-router'; // or your router
import { toApiFailure, mapValidationErrors } from '@/front/lib/api-failure';
import { useCreateStaffUser } from '@/front/lib/react-query/features/staff/staff-user.hooks';

const formSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

type FormData = z.infer<typeof formSchema>;

export function NewStaffUserForm() {
  const navigate = useNavigate();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
    },
  });

  const { mutate, isPending } = useCreateStaffUser({
    // Tell global handler: "I handle validation myself via form fields"
    meta: {
      validationHandledByForm: true,
      showSuccessToast: true, // Use API response's translationKey for success toast
    },
    onSuccess: () => {
      // Navigate on success - toast handled by global handler via API's translationKey
      navigate({ to: '/staff/staff-users' });
    },
    onError: (error) => {
      // Only handle validation errors - global handler does the rest
      const failure = toApiFailure(error);

      if (failure.kind === 'validation') {
        const result = mapValidationErrors(failure, form.setError, {
          // Map server field names to form field names if different
          fieldMapping: {
            'Email': 'email',
            'FirstName': 'firstName',
            'LastName': 'lastName',
          },
        });

        // Optionally handle unmapped errors (rare edge case)
        if (result.unmappedErrors.length > 0 && import.meta.env.DEV) {
          console.warn('Unmapped validation errors:', result.unmappedErrors);
        }
      }
      // No else needed - global handler shows toast for problem/network/unknown
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    mutate(data);
  });

  return (
    <form onSubmit={onSubmit}>
      {/* Form fields with error display */}
      <input {...form.register('email')} />
      {form.formState.errors.email && (
        <span className="error">{form.formState.errors.email.message}</span>
      )}

      {/* ... other fields */}

      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Staff Member'}
      </button>
    </form>
  );
}
```

---

## Phase 4: Update Auth Layout Error Boundary

### File: `apps/front/app/routes/authed/_layout/authed-layout.tsx`

```typescript
import { toApiFailure } from '@/front/lib/api-failure';

// In the ErrorBoundary component:
function AuthedLayoutErrorBoundary({ error }: { error: unknown }) {
  const failure = toApiFailure(error);
  const { logout } = useAuth();

  // Log for debugging
  useEffect(() => {
    console.error('[AuthedLayout Error]', failure);
  }, [failure]);

  // Handle specific status codes
  if (failure.kind === 'problem') {
    switch (failure.status) {
      case 401:
        // Session expired - redirect to login
        logout({ redirectCause: queryParamValue.login_page.redirect_cause.invalid_session });
        return <SplashScreen />;

      case 403:
        return <View403 />;

      case 404:
        return <NotFoundView />;

      default:
        return <GenericErrorView failure={failure} />;
    }
  }

  if (failure.kind === 'network') {
    return <NetworkErrorView message={failure.message} />;
  }

  // Unknown errors
  return <GenericErrorView failure={failure} />;
}
```

---

## Phase 5: Update Auth Hooks Retry Logic

### File: `apps/front/app/lib/react-query/features/common/auth.hooks.ts`

```typescript
import { toApiFailure } from '@/front/lib/api-failure';
import type { CreateQueryOptions } from 'react-query-kit';

// Custom retry logic for auth failures - fail fast on auth errors
const authRetry: CreateQueryOptions['retry'] = (failureCount: number, error: Error) => {
  const failure = toApiFailure(error);

  if (failure.kind === 'problem') {
    const authErrorStatuses = [401, 403, 404];
    if (authErrorStatuses.includes(failure.status)) {
      // Don't retry on auth errors - fail fast
      return false;
    }
  }

  // For other errors (network issues, etc.), retry up to 2 times
  return failureCount < 2;
};
```

---

## Phase 6: Delete Old Error Utility and Migrate All Usages

### Delete: `apps/front/app/lib/js-client/js-client-error.ts`

**No backward compatibility** - delete this file entirely. All usages will be migrated to the new `toApiFailure()` approach.

### Migration Pattern

```typescript
// ============================================
// BEFORE (old isJsClientError approach)
// ============================================
import { isJsClientError } from '@/front/lib/js-client/js-client-error';

if (isJsClientError(error)) {
  toast.error(error.key ? t(error.key) : error.messageEscaped);
}

// ============================================
// AFTER (new toApiFailure approach)
// ============================================
import { toApiFailure } from '@/front/lib/api-failure';

const failure = toApiFailure(error);
if (failure.kind === 'problem') {
  toast.error(failure.translationKey ? t(failure.translationKey) : failure.detail);
}

// OR for most cases: let global handler do it (no code needed!)
```

### Search and Replace Guide

| Find | Replace With |
|------|--------------|
| `import { isJsClientError } from '@/front/lib/js-client/js-client-error'` | `import { toApiFailure } from '@/front/lib/api-failure'` |
| `isJsClientError(error)` | `toApiFailure(error).kind !== 'unknown' && toApiFailure(error).kind !== 'abort'` |
| `error.key` | `failure.translationKey` |
| `error.messageEscaped` | `failure.detail` |
| `error.responseStatusCode` | `failure.status` (for problem/validation) |

### Files to Migrate

All files currently importing `isJsClientError`:
- `apps/front/app/components/error-boundary.tsx`
- `apps/front/app/routes/authed/_layout/authed-layout.tsx`
- `apps/front/app/lib/react-query/features/common/auth.hooks.ts`
- `apps/front/app/routes/authed/staff/profiles/new/parts/new-staff-profile-form.tsx`
- `apps/front/app/routes/authed/staff/invitations/new/parts/new-staff-invitations-form.tsx`
- `apps/front/app/routes/authed/staff/staff-users/new/components/new-staff-user-form.tsx`
- `apps/front/app/routes/authed/staff/staff-users/details/components/staff-user-update-form.tsx`
- `apps/front/app/routes/authed/staff/staff-users/list/parts/staff-users-table.tsx`

---

## Phase 7: Documentation

### 7.1 Create Developer Guide

**File:** `docs/guides/frontend-error-handling.md`

Create a comprehensive developer guide covering:

```markdown
# Frontend Error Handling Guide

## Overview

This document describes the centralized error handling system for the PublyApp frontend.
All API errors are normalized into an `ApiFailure` discriminated union and handled globally
via React Query's MutationCache and QueryCache.

## Quick Start

### Default Behavior (No Code Needed)

Most mutations "just work" - errors are automatically toasted:

\`\`\`typescript
const { mutate } = useCreateStaffUser();
mutate(data); // Errors auto-toast, no onError needed
\`\`\`

### Form Validation

For forms that need field-level validation errors:

\`\`\`typescript
import { withFormValidation } from '@/front/lib/api-failure';

const { mutate } = useCreateStaffUser(
  withFormValidation(form.setError, {
    meta: { showSuccessToast: true },
    onSuccess: () => navigate('/staff'),
  })
);
\`\`\`

### Opt-Out for Custom Handling

\`\`\`typescript
const { mutate } = useMyMutation({
  meta: { skipGlobalErrorHandler: true },
  onError: (error) => {
    // Custom handling (alert, modal, etc.)
  },
});
\`\`\`

## ApiFailure Types

| Kind | When | Default Behavior |
|------|------|------------------|
| `validation` | 422 with field errors | Toast (unless `validationHandledByForm`) |
| `problem` | 400, 401, 403, 404, 500 | Toast (401 also triggers logout) |
| `network` | Fetch failed, offline | Toast "Network error" |
| `abort` | Request cancelled | Silent (never toast) |
| `unknown` | Unexpected error | Toast "Something went wrong" |

## Auth Error Handling

- **401 Unauthorized**: Global hook triggers logout + redirect to login
- **403 Forbidden**: Error boundary shows `View403` (no logout)

## Mutation Meta Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `showSuccessToast` | boolean | false | Extract and toast `translationKey` from response |
| `successMessage` | string | - | Override success toast with explicit message/key |
| `validationHandledByForm` | boolean | false | Suppress validation toast (form handles it) |
| `skipGlobalErrorHandler` | boolean | false | Full opt-out, handle all errors locally |
| `skipAuthErrorHandler` | boolean | false | Don't trigger logout on 401 (rare) |

## Manual Error Handling

\`\`\`typescript
import { toApiFailure, mapValidationErrors } from '@/front/lib/api-failure';

onError: (error) => {
  const failure = toApiFailure(error);

  switch (failure.kind) {
    case 'validation':
      mapValidationErrors(failure, form.setError);
      break;
    case 'problem':
      if (failure.status === 404) {
        navigate('/not-found');
      }
      break;
    // network, abort, unknown handled by global handler
  }
}
\`\`\`
```

### 7.2 Update AGENTS.md

Add a new section under "### Error Handling" in `AGENTS.md`:

**Location:** After line ~1565 (current Error Handling section)

**Content to add:**

```markdown
### Frontend API Error Handling

**CRITICAL:** The frontend uses a centralized error handling system. Understanding this is essential for writing correct mutation/query code.

**Architecture:**
- All API errors are normalized into `ApiFailure` discriminated union via `toApiFailure()`
- Global handlers in `MutationCache`/`QueryCache` handle toasts and auth errors
- Forms use `withFormValidation()` helper for field-level error mapping

**Default behavior (no code needed):**
```typescript
// ✅ Errors auto-toast - no onError handler required
const { mutate } = useCreateStaffUser();
mutate(data);
```

**Form validation pattern:**
```typescript
import { withFormValidation } from '@/front/lib/api-failure';

// ✅ Field errors mapped to form, other errors still toast
const { mutate } = useCreateStaffUser(
  withFormValidation(form.setError, {
    meta: { showSuccessToast: true },
    onSuccess: () => navigate('/staff'),
  })
);
```

**Opt-out for custom handling:**
```typescript
// ✅ Full control - global handler skipped
const { mutate } = useMyMutation({
  meta: { skipGlobalErrorHandler: true },
  onError: (error) => {
    const failure = toApiFailure(error);
    // Custom handling
  },
});
```

**ApiFailure kinds:**
| Kind | HTTP Status | Default Behavior |
|------|-------------|------------------|
| `validation` | 422 | Toast (unless form handles) |
| `problem` | 400/401/403/404/500 | Toast (401 → logout) |
| `network` | - | Toast "Network error" |
| `abort` | - | Silent |
| `unknown` | - | Toast + log |

**Auth error handling:**
- **401**: Global hook triggers `logout()` immediately
- **403**: Error boundary shows `View403` (no logout - user is authenticated but forbidden)

**Mutation meta options:**
- `showSuccessToast: true` - Toast success message from API response
- `successMessage: "key"` - Override with explicit message
- `validationHandledByForm: true` - Suppress validation toast
- `skipGlobalErrorHandler: true` - Handle all errors locally
- `skipAuthErrorHandler: true` - Don't logout on 401 (rare)

**Reference:** See `docs/guides/frontend-error-handling.md` for complete guide.
```

---

## Migration Checklist

### Pre-Migration: TypeScript Setup

Ensure the module augmentation is picked up by TypeScript. Add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    // ...existing options
  },
  "include": [
    // ...existing includes
    "app/lib/react-query/query-client.ts"  // Contains module augmentation
  ]
}
```

Or create a separate `types/react-query.d.ts` file with the augmentation and ensure it's in `include`.

### Step 1: Find All Usages of isJsClientError

```bash
# Run this to find all files that need migration
rg "isJsClientError" apps/front --type ts
```

### Files to Create
- [ ] `apps/front/app/lib/api-failure/types.ts`
- [ ] `apps/front/app/lib/api-failure/schemas.ts`
- [ ] `apps/front/app/lib/api-failure/to-api-failure.ts`
- [ ] `apps/front/app/lib/api-failure/map-validation-errors.ts`
- [ ] `apps/front/app/lib/api-failure/with-form-validation.ts`
- [ ] `apps/front/app/lib/api-failure/index.ts`

### Files to Modify
- [ ] `apps/front/app/lib/react-query/query-client.ts` - Add global error/success handling
- [ ] `apps/front/app/routes/authed/_layout/authed-layout.tsx` - Update error boundary
- [ ] `apps/front/app/lib/react-query/features/common/auth.hooks.ts` - Update retry logic
- [ ] `apps/front/app/components/error-boundary.tsx` - Update to use toApiFailure
- [ ] `apps/front/app/routes/authed/staff/profiles/new/parts/new-staff-profile-form.tsx` - Use withFormValidation
- [ ] `apps/front/app/routes/authed/staff/invitations/new/parts/new-staff-invitations-form.tsx` - Use withFormValidation
- [ ] `apps/front/app/routes/authed/staff/staff-users/new/components/new-staff-user-form.tsx` - Use withFormValidation
- [ ] `apps/front/app/routes/authed/staff/staff-users/details/components/staff-user-update-form.tsx` - Use withFormValidation
- [ ] `apps/front/app/routes/authed/staff/staff-users/list/parts/staff-users-table.tsx` - Update error handling

### Documentation to Create/Update
- [ ] `docs/guides/frontend-error-handling.md` - Create developer guide for error handling system
- [ ] `AGENTS.md` - Add "Frontend API Error Handling" section after existing Error Handling

### Files to Delete
- [ ] `apps/front/app/lib/js-client/js-client-error.ts` - DELETE entirely (no backward compat)

---

## Testing Strategy

### Unit Tests for `toApiFailure`

```typescript
describe('toApiFailure', () => {
  it('should parse ValidationProblemDetails correctly', () => {
    const error = {
      status: 422,
      detail: 'Validation failed',
      translationKey: 'validation-failed',
      errors: { email: ['Email is required'] },
      responseStatusCode: 422,
    };

    const result = toApiFailure(error);

    expect(result.kind).toBe('validation');
    expect(result.fieldErrors).toEqual({ email: ['Email is required'] });
  });

  it('should parse AppProblemDetails correctly', () => {
    const error = {
      status: 404,
      detail: 'User not found',
      translationKey: 'not-found',
      responseStatusCode: 404,
    };

    const result = toApiFailure(error);

    expect(result.kind).toBe('problem');
    expect(result.status).toBe(404);
  });

  it('should handle network errors', () => {
    const error = new TypeError('Failed to fetch');

    const result = toApiFailure(error);

    expect(result.kind).toBe('network');
  });

  it('should handle AbortError as abort (not network)', () => {
    const error = new DOMException('The operation was aborted', 'AbortError');

    const result = toApiFailure(error);

    expect(result.kind).toBe('abort');
  });

  it('should handle Error with name AbortError', () => {
    const error = new Error('Request aborted');
    error.name = 'AbortError';

    const result = toApiFailure(error);

    expect(result.kind).toBe('abort');
  });

  it('should handle unknown errors', () => {
    const error = 'some string error';

    const result = toApiFailure(error);

    expect(result.kind).toBe('unknown');
    expect(result.message).toBe('some string error');
  });
});
```

### Integration Tests

1. Test form submission with validation errors → errors appear on fields
2. Test form submission with 400 error → toast appears
3. Test network failure → network error toast appears
4. Test 401 error in auth layout → redirect to login

---

## Rollback Plan

If issues arise:
1. Revert `query-client.ts` changes to remove global error handling
2. Keep `toApiFailure` but don't use it globally
3. Components can use `toApiFailure` individually as needed
4. `isJsClientError` remains functional (just deprecated)

---

## Benefits Summary

| Aspect | Before | After |
|--------|--------|-------|
| Error detection | `isJsClientError()` with manual property checks | Zod-validated schemas |
| Error handling | Duplicated in every component | Centralized in QueryClient |
| Validation errors | Toast messages | Form field errors |
| Network errors | Often missed | Explicitly handled |
| Type safety | Weak (manual type guards) | Strong (discriminated union + Zod) |
| SSR compatibility | instanceof issues possible | Plain objects, serializable |
| Debugging | Limited | Full raw error preserved |
