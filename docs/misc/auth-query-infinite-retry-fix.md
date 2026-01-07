# Auth Query Infinite Retry Fix

**Issue**: [#78](https://github.com/radandevist/publyapp/issues/78)
**Date**: November 2, 2025
**Status**: Fixed

## Problem Statement

When a user's session became invalid (user deleted/suspended, session deleted, or session expired), reloading an authenticated page would trigger an infinite loop of API calls to `GetUserAuthData` and `GetTenantAuthData` endpoints, causing browser performance issues and potential server load problems.

### Reproduction Steps

1. Login to the application
2. Intentionally soft-delete the user (`IsDeleted = true`) OR suspend the user (`IsSuspended = true`) OR delete the session from the database
3. Reload the dashboard page or any authenticated page
4. **Observed**: Infinite API calls to `/auth/user-auth-data` and `/auth/tenant-auth-data`
5. **Expected**: Single failed API call followed by redirect to login page

## Root Causes

### 1. React Query Retry Behavior
`useSuspenseQuery` was using the default retry configuration, which retries failed queries up to 2 times. When the backend returned 401 (Unauthorized), React Query would retry the request, and with suspense mode, the component would remain suspended during retries.

### 2. React Re-render Loop
After the ErrorBoundary caught the auth error and cleared the session cookie, React would attempt to re-render the component tree. This re-render would trigger the auth queries again before the redirect could complete, creating an infinite loop:

```
Auth API fails (401)
→ ErrorBoundary catches error, clears cookie
→ React re-renders
→ Auth queries run again
→ API fails (401)
→ ... (infinite loop)
```

## Solution

The fix implements a **defense-in-depth** approach with three layers of protection:

### 1. Custom Retry Logic in Auth Queries

Added custom retry logic to both `useGetUserAuthData` and `useGetTenantAuthData` queries that fails fast on authentication errors.

**File**: `apps/front/app/lib/react-query/features/common/auth.hooks.ts`

```typescript
retry: (failureCount, error) => {
	if (isJsClientError(error)) {
		const authErrorStatuses = [401, 403, 404];
		if (authErrorStatuses.includes(error.responseStatusCode)) {
			// Don't retry on auth errors - fail fast
			return false;
		}
	}
	// For other errors (network issues, etc.), retry up to 2 times
	return failureCount < 2;
}
```

**Benefits**:
- Prevents unnecessary API calls when session is invalid
- Reduces from 3 API calls (1 initial + 2 retries) to 1 API call
- Allows retries for genuine network issues while failing fast on auth errors

### 2. Session Cookie Check Before Running Queries

Added a defensive check in `AuthQueriesGuard` that verifies the session cookie exists before executing auth queries.

**File**: `apps/front/app/routes/authed/_layout/authed-layout.tsx`

```typescript
const AuthQueriesGuard = ({ children }: { children: ReactNode }) => {
	const tenantId = useTenantParam();

	// Check if session token exists before running queries
	// This prevents infinite loop when ErrorBoundary clears the cookie
	const browserCookies = cookie.parse(document.cookie);
	const sessionToken = _.get(browserCookies, SESSION_TOKEN_COOKIE_KEY);

	if (!sessionToken) {
		// No session token, redirect to login
		const url = new URL(FRONT_PATH_NAMES.auth.login, window.location.origin);
		url.searchParams.set(
			queryParamKey.login_page.redirect_cause,
			queryParamValue.login_page.redirect_cause.invalid_session,
		);
		return <Navigate to={url.pathname + url.search} replace />;
	}

	// trigger the queries in parallel
	useSuspenseQueries({
		queries: [
			useGetUserAuthData.getOptions(),
			useGetTenantAuthData.getOptions({ tenantId }),
		],
	});

	return <>{children}</>;
};
```

**Benefits**:
- Prevents queries from running after ErrorBoundary clears the cookie
- Breaks the re-render loop by immediately returning `<Navigate>` when cookie is missing
- Provides early exit path without making unnecessary API calls

### 3. Proper ErrorBoundary Cleanup

ErrorBoundary properly handles 401 errors by clearing session state and redirecting using React Router's `<Navigate>` component.

**File**: `apps/front/app/routes/authed/_layout/authed-layout.tsx`

```typescript
export const ErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
	logger.debug('ErrorBoundary', { error });

	if (
		isJsClientError(error) &&
		error.responseStatusCode === 401 &&
		_.toLower(error.messageEscaped) === _.toLower('Unauthorized')
	) {
		// remove session token cookie
		document.cookie = cookie.serialize(SESSION_TOKEN_COOKIE_KEY, '', {
			path: '/',
			expires: new Date(0),
			maxAge: 0,
		});

		// clear react-query cache too
		defaultQueryClient.removeQueries();

		// redirect to login page with a query param as redirect cause
		const url = new URL(FRONT_PATH_NAMES.auth.login, window.location.origin);
		url.searchParams.set(
			queryParamKey.login_page.redirect_cause,
			queryParamValue.login_page.redirect_cause.invalid_session,
		);

		logger.debug('Redirecting to login page', { url: url.toString() });

		return <Navigate to={url.pathname + url.search} replace />;
	}

	if (import.meta.env.DEV) {
		return <TemplateErrorBoundary error={error} />;
	}

	return <View500 />;
};
```

**Benefits**:
- Uses React Router's `<Navigate>` component (SPA navigation, no full page reload)
- Properly clears session cookie and React Query cache
- Redirects with query parameter to show appropriate message on login page

## Flow After Fix

### Normal Flow (Valid Session)
```
Page Load
→ clientLoader checks cookie exists
→ AuthQueriesGuard checks cookie exists
→ Auth queries run
→ Success (200)
→ Page renders
```

### Invalid Session Flow
```
Page Load
→ clientLoader checks cookie exists
→ AuthQueriesGuard checks cookie exists
→ Auth queries run
→ API fails with 401 (no retry due to custom retry logic)
→ ErrorBoundary catches error
→ ErrorBoundary clears cookie and cache
→ ErrorBoundary returns <Navigate> to login
→ React tries to re-render
→ AuthQueriesGuard checks cookie (missing)
→ Immediately returns <Navigate> (no API calls)
→ User redirected to login
```

## Files Changed

1. `apps/front/app/lib/react-query/features/common/auth.hooks.ts`
   - Added custom retry logic to `useGetUserAuthData`
   - Added custom retry logic to `useGetTenantAuthData`

2. `apps/front/app/routes/authed/_layout/authed-layout.tsx`
   - Added session cookie check in `AuthQueriesGuard`
   - Updated `ErrorBoundary` to use `<Navigate>` component

## Testing

### Manual Testing Steps

1. **Test valid session**: Login and navigate through authenticated pages - should work normally
2. **Test suspended user**:
   - Login to application
   - In database: `UPDATE "User" SET "IsSuspended" = true WHERE "Email" = 'test@example.com';`
   - Reload page
   - **Expected**: Single API call, immediate redirect to login
3. **Test deleted user**:
   - Login to application
   - In database: `UPDATE "User" SET "IsDeleted" = true WHERE "Email" = 'test@example.com';`
   - Reload page
   - **Expected**: Single API call, immediate redirect to login
4. **Test deleted session**:
   - Login to application
   - In database: `DELETE FROM "Session" WHERE "Token" = '<session-token>';`
   - Reload page
   - **Expected**: Single API call, immediate redirect to login

### Verification
- ✅ No infinite API calls
- ✅ Only 1 API call made when session is invalid
- ✅ Proper redirect to login page with query parameter
- ✅ No console errors
- ✅ No browser performance issues

## Performance Impact

**Before Fix**:
- Infinite API calls (hundreds per second)
- Browser becomes unresponsive
- Server load increases significantly
- User cannot interact with application

**After Fix**:
- Single API call on invalid session
- Immediate redirect to login
- No performance degradation
- Clean error handling

## Backend Behavior

The backend correctly handles invalid sessions:

**SessionService** (`apps/api/Src/Features/Common/Session/SessionService.cs`):
```csharp
public async Task<SessionData?> GetSessionByToken(string token, CancellationToken cancellationToken = default) {
	var query =
		from s in _dbContext.Session
		join u in _dbContext.User on s.UserId equals u.Id
		where s.Token == token && s.ExpiresAt > DateTime.UtcNow
		select new { Session = s, User = u };

	var result = await query.FirstOrDefaultAsync(cancellationToken);

	if (result is null) return null;

	// Runtime filtering
	if (result.User.IsDeleted || result.User.IsSuspended || !result.User.IsVerified) {
		return null;
	}

	return new SessionData {
		Session = result.Session,
		User = result.User,
	};
}
```

When session is invalid (deleted, expired) or user is deleted/suspended, the backend returns `null`, which causes the middleware to return 401 Unauthorized.

## Future Considerations

1. **Token Refresh**: Consider implementing automatic token refresh before expiration
2. **Graceful Degradation**: Consider showing a modal to user before redirecting if they have unsaved changes
3. **Analytics**: Track frequency of session invalidation scenarios to identify patterns
4. **Backend Notifications**: Consider WebSocket or polling to notify client immediately when session is invalidated server-side

## Related Documentation

- [React Query Retry Documentation](https://tanstack.com/query/latest/docs/framework/react/guides/query-retries)
- [React Router Navigation](https://reactrouter.com/en/main/components/navigate)
- [Session Management](./authentication-flow.md) (if exists)
