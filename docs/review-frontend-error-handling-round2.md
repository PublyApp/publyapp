# Code Review Request: Frontend ProblemDetails Error Handling System (Round 2)

## Context

We migrated the backend to use RFC 7807 ProblemDetails. The frontend error handling has been updated to work with the new error format. This is a follow-up review after addressing feedback from the first review.

## Changes Since Last Review

Based on previous GPT feedback, the following issues were addressed:

1. **Schema discriminator**: Made `responseStatusCode` required in `AppProblemDetailsSchema` to prevent false positives
2. **SSR QueryClient leak**: Moved QueryClient creation inside `Layout` component with SSR/browser branching
3. **authLogoutInProgress reset**: Added `resetAuthLogoutFlag()` call in `AuthQueriesLoader` when session is valid
4. **DOMException SSR guard**: Added `typeof DOMException !== 'undefined'` check
5. **mapValidationErrors**: Removed try/catch detection (RHF's setError doesn't throw)
6. **navigation-helper**: Added SSR guard + `replace` option support
7. **logout cache clearing**: Changed `.removeQueries()` to `.clear()`

## Files Changed

### New Files (apps/front/app/lib/api-failure/)
- `types.ts` - ApiFailure discriminated union (validation, problem, network, abort, unknown)
- `schemas.ts` - Zod schemas with required `responseStatusCode` discriminator
- `to-api-failure.ts` - Main error conversion function with SSR-safe DOMException check
- `map-validation-errors.ts` - Maps server errors to React Hook Form fields
- `with-form-validation.ts` - Helper wrapper for mutations with form validation
- `index.ts` - Re-exports

### New Files (apps/front/app/lib/react-router/)
- `navigation-helper.ts` - Global navigate function with SSR guard and replace support

### Modified Files
- `apps/front/app/lib/react-query/query-client.tsx`:
  - Exports `resetAuthLogoutFlag()` for session establishment
  - `getQueryClient()` singleton pattern for browser, fresh per-request for SSR
  - Global error/success handling via MutationCache/QueryCache
  - Module augmentation for mutation/query meta typing

- `apps/front/app/root.tsx`:
  - `useQueryClient()` hook with SSR/browser branching (no ternary - uses if/else)
  - Sets up `setGlobalNavigate(navigate)` for global navigation

- `apps/front/app/lib/cookies/logout.utils.ts`:
  - Uses `fetch()` + `globalNavigate()` instead of form submission (no page reload)
  - Uses `URL` class for building login URL with searchParams
  - Uses `.clear()` instead of `.removeQueries()`
  - Uses `{ replace: true }` to prevent back-button issues

- `apps/front/app/routes/authed/_layout/authed-layout.tsx`:
  - Calls `resetAuthLogoutFlag()` in `AuthQueriesLoader` when session valid
  - ErrorBoundary uses `toApiFailure()` for error classification

### Deleted Files
- `apps/front/app/lib/js-client/js-client-error.ts`

## Architecture Diagram

```
Kiota API Client
(throws errors with responseStatusCode - REQUIRED)
                |
        +-------+-------+
        |               |
        v               v
   ERROR PATH      SUCCESS PATH
   toApiFailure()  meta.showSuccessToast / meta.successMessage

   Zod validates responseStatusCode (required discriminator)

   Returns discriminated union:
   - validation -> fieldErrors
   - problem -> status, detail
   - network -> message
   - abort -> silent (no toast)
   - unknown -> message, raw
        |               |
        v               v
React Query MutationCache / QueryCache

  MutationCache onError:                MutationCache onSuccess:
  - abort -> silent                     - meta.successMessage -> toast
  - 401 -> onAuthError (logout)         - meta.showSuccessToast -> toast
  - validation + !handledByForm -> toast
  - problem/network/unknown -> toast

  QueryCache onError:
  - 401 -> onAuthError (logout)
  - other errors -> dev log only (no toast, errors propagate to ErrorBoundary)
        |
        v (401 only)
logout()
  1. clearSessionCookie()
  2. getQueryClient().clear()
  3. fetch(/auth/clear-session)
  4. globalNavigate(loginUrl, { replace: true })
        |
        v (on next authed route load)
AuthQueriesLoader (authed-layout.tsx)
  - useSuspenseQueries() succeeds
  - resetAuthLogoutFlag()
```

## Review Focus Areas

1. **Schema validation**: Is requiring `responseStatusCode` sufficient to prevent false positives?

2. **SSR safety**:
   - Is the `useQueryClient()` hook pattern correct for SSR vs browser?
   - Are all window/DOMException references properly guarded?

3. **Auth logout flow**:
   - Is `resetAuthLogoutFlag()` called at the right time?
   - Any edge cases where the flag could get stuck?

4. **Logout navigation**:
   - Is `fetch()` with `credentials: 'include'` correctly processing Set-Cookie?
   - Is `{ replace: true }` the right choice for logout navigation?

5. **Global navigation pattern**:
   - Is the `setGlobalNavigate`/`globalNavigate` pattern safe?
   - Any issues with stale navigate function after hot reload?

6. **Form validation**:
   - Is it acceptable that `mapValidationErrors` can't detect unmapped fields?
   - Should we require explicit `knownFields` option?

7. **Error classification order**: Is the order in `toApiFailure()` correct?
   - ValidationProblemDetails before AppProblemDetails
   - AbortError before network errors
   - Kiota errors before generic Error

## Code to Review

Please review the following key files:
- `apps/front/app/lib/api-failure/schemas.ts` - Zod schemas with required discriminator
- `apps/front/app/lib/api-failure/to-api-failure.ts` - Error conversion with SSR guards
- `apps/front/app/lib/react-query/query-client.tsx` - Global handlers + resetAuthLogoutFlag
- `apps/front/app/lib/react-router/navigation-helper.ts` - Global navigation with SSR guard
- `apps/front/app/lib/cookies/logout.utils.ts` - Logout with fetch + React Router nav
- `apps/front/app/root.tsx` - useQueryClient hook with SSR branching
- `apps/front/app/routes/authed/_layout/authed-layout.tsx` - resetAuthLogoutFlag call
