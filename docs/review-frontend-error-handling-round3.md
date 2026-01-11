# Code Review Request: Frontend ProblemDetails Error Handling System (Round 3)

## Context

This is a follow-up review after addressing feedback from Round 2. All previous blockers have been fixed.

## Changes Since Round 2

Based on previous GPT feedback, the following issues were addressed:

### Must-do (fixed)

1. **Side-effect during render**: Moved `resetAuthLogoutFlag()` into `useEffect(() => {...}, [])` in `AuthQueriesLoader`

2. **Misleading hook naming**: Renamed `useQueryClient()` to `getRootQueryClient()` in `root.tsx`

### Should-do (fixed)

3. **Toast import cache stuck**: Added `toastModulePromise = null` reset in the `.catch()` handler of `showToast()`

4. **Response SSR guard**: Added `typeof Response !== 'undefined'` check before `instanceof Response`

## Files Changed in Round 3

### apps/front/app/routes/authed/_layout/authed-layout.tsx
```diff
- import { type ReactNode, Suspense } from 'react';
+ import { type ReactNode, Suspense, useEffect } from 'react';

const AuthQueriesLoader = ({ children }: { children: ReactNode }) => {
  // ...
  useSuspenseQueries({ queries });

-  // Session is valid - reset the auth logout flag
-  resetAuthLogoutFlag();
+  // Session is valid - reset the auth logout flag on mount
+  // Using useEffect to avoid side-effects during render (React StrictMode safe)
+  useEffect(() => {
+    resetAuthLogoutFlag();
+  }, []);

  return <>{children}</>;
};
```

### apps/front/app/root.tsx
```diff
- const useQueryClient = () => {
+ const getRootQueryClient = () => {
    if (isServer) {
      return getQueryClient();
    }
    return getQueryClient({
      onAuthError: () => {
        logout({ redirectCause: 'invalid_session' });
      },
    });
  };

  export const Layout = ({ children }: { children: React.ReactNode }) => {
-   const queryClient = useQueryClient();
+   const queryClient = getRootQueryClient();
```

### apps/front/app/lib/react-query/query-client.tsx
```diff
  const showToast = (type: 'success' | 'error', message: string): void => {
    safeToast(type, message).catch((err) => {
+     // Reset cache so next toast will retry the import
+     toastModulePromise = null;
      logger.error('[Toast Error]', { error: err });
    });
  };
```

### apps/front/app/lib/api-failure/to-api-failure.ts
```diff
  // 5. Raw Response object (rare - usually means unexpected response format)
- if (error instanceof Response) {
+ // Guard Response for SSR where it may not exist
+ if (typeof Response !== 'undefined' && error instanceof Response) {
```

## Review Focus Areas

1. **useEffect placement**: Is the empty dependency array `[]` correct for `resetAuthLogoutFlag()`? Should it run on every render or just mount?

2. **getRootQueryClient naming**: Is this name clear enough? Any better alternatives?

3. **Toast cache reset timing**: Is resetting in `.catch()` sufficient, or should we also reset on specific error types only?

4. **Response guard**: Is `typeof Response !== 'undefined'` the correct check for all SSR runtimes (Node, Deno, Bun, edge)?

5. **Any remaining issues**: Are there any other React anti-patterns, SSR issues, or edge cases we missed?

## Summary of All Changes (Rounds 1-3)

### New Files
- `apps/front/app/lib/api-failure/` - ApiFailure discriminated union system
- `apps/front/app/lib/react-router/navigation-helper.ts` - Global navigation helper

### Modified Files
- `apps/front/app/lib/react-query/query-client.tsx` - Global error/success handlers
- `apps/front/app/root.tsx` - QueryClient setup with SSR handling
- `apps/front/app/lib/cookies/logout.utils.ts` - Fetch-based logout with React Router nav
- `apps/front/app/routes/authed/_layout/authed-layout.tsx` - Error boundary + auth reset

### Deleted Files
- `apps/front/app/lib/js-client/js-client-error.ts`

## Code to Review

Please review the specific changes listed above and confirm if the implementation is now ready to merge.
