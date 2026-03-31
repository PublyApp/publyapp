# Frontend Error Handling Guide

## Overview

This document describes the centralized error handling system for the PublyApp frontend. All API errors are normalized into an `ApiFailure` discriminated union and handled globally via React Query's `MutationCache` and `QueryCache`.

**Related Documentation:**
- Analysis: `docs/analysis/analysis-client-side-problem-details-error-handling.md`
- Implementation Plan: `docs/plans/plan-client-side-error-handling-implementation.md`

---

## Quick Start

### Default Behavior (No Code Needed)

Most mutations "just work" - errors are automatically toasted:

```typescript
const { mutate } = useCreateStaffUser();
mutate(data); // Errors auto-toast, no onError needed
```

### Form Validation

For forms that need field-level validation errors, use `withFormValidation`:

```typescript
import { withFormValidation } from '@/front/lib/api-failure';

const { mutate } = useCreateStaffUser(
  withFormValidation(form.setError, {
    meta: { showSuccessToast: true },
    onSuccess: () => navigate('/staff'),
  })
);
```

Or handle validation manually:

```typescript
import { toApiFailure, mapValidationErrors } from '@/front/lib/api-failure';

const { mutate } = useCreateStaffUser({
  meta: { validationHandledByForm: true },
  onError: (error) => {
    const failure = toApiFailure(error);
    if (failure.kind === 'validation') {
      mapValidationErrors(failure, form.setError);
    }
    // Other errors (problem/network/unknown) handled by global handler
  },
});
```

### Opt-Out for Custom Handling

```typescript
const { mutate } = useMyMutation({
  meta: { skipGlobalErrorHandler: true },
  onError: (error) => {
    const failure = toApiFailure(error);
    // Custom handling (alert, modal, navigation, etc.)
  },
});
```

### Local Error Message Rule

When a mutation opts out of the global error handler, the local handler must still
follow the shared `ApiFailure` message path.

**Rule:**
- Always normalize unknown errors with `toApiFailure(error)`
- Always derive user-facing text with `getFailureMessage(failure, { fallback })`
- Never translate backend `translationKey` values manually at the call site
- Never add per-component helpers like `getTranslatedProblemMessage`

`getFailureMessage(...)` is the single abstraction for:
- `response-message` namespace lookup when the backend returns `translationKey`
- fallback to `detail` / `title`
- generic network / unknown fallback text
- silent abort failures

Use local `onError` only when the component owns custom UX such as:
- a specialized bulk-action toast
- an inline alert or dialog
- navigation or modal flow

It should not re-implement backend error translation.

**Preferred local pattern:**

```typescript
import { getFailureMessage, toApiFailure } from '@/front/lib/api-failure';

const { mutate } = useMyMutation({
  meta: { skipGlobalErrorHandler: true },
  onError: (error) => {
    const failure = toApiFailure(error);
    const message = getFailureMessage(failure, {
      fallback: t('my-fallback-error'),
    });

    if (!message) {
      return;
    }

    toast.error(message);
  },
});
```

**Do not do this:**

```typescript
if (
  failure.translationKey &&
  i18n.exists(failure.translationKey, { ns: 'response-message' })
) {
  return i18n.t(failure.translationKey as never, { ns: 'response-message' });
}
```

---

## ApiFailure Discriminated Union

All errors are converted to one of these types:

| Kind | HTTP Status | When | Default Behavior |
|------|-------------|------|------------------|
| `validation` | 422 | Field-level validation errors | Toast (unless `validationHandledByForm`) |
| `problem` | 400, 401, 403, 404, 500 | General API errors | Toast (401 also triggers logout) |
| `network` | N/A | Fetch failed, offline, DNS | Toast "Network error" |
| `abort` | N/A | Request cancelled by user/navigation | Silent (never toast) |
| `unknown` | N/A | Unexpected error | Toast "Something went wrong" |

### Type Structure

```typescript
// Validation error (422 with field errors)
type ValidationFailure = {
  kind: 'validation';
  status: number;
  translationKey: string | undefined;
  detail: string | undefined;
  title: string | undefined;
  fieldErrors: Record<string, string[]>;
  raw: unknown;
};

// General API error (400, 401, 403, 404, 500)
type ProblemFailure = {
  kind: 'problem';
  status: number;
  translationKey: string | undefined;
  detail: string | undefined;
  title: string | undefined;
  raw: unknown;
};

// Network failure (offline, DNS, CORS)
type NetworkFailure = {
  kind: 'network';
  message: string;
  raw: unknown;
};

// Request cancelled
type AbortFailure = {
  kind: 'abort';
  raw: unknown;
};

// Unexpected error
type UnknownFailure = {
  kind: 'unknown';
  message: string;
  raw: unknown;
};
```

---

## Auth Error Handling

### 401 vs 403 - Critical Distinction

| Status | Meaning | Behavior |
|--------|---------|----------|
| **401 Unauthorized** | Session invalid/expired | Global hook triggers `logout()` immediately |
| **403 Forbidden** | Authenticated but not allowed | Error boundary shows `View403` (no logout) |

**Why this matters:**
- 401 = "You're not logged in" → must logout and redirect
- 403 = "You're logged in but forbidden" → show error UI, don't boot the user

### Flow Diagram

```
401 error occurs
       │
       ▼
┌─────────────────────────────────┐
│  QueryClient onAuthError        │  ← FIRST: Triggers logout
│  logout({ redirectCause: ... }) │
└─────────────────────────────────┘
       │
       ▼ (error propagates)
┌─────────────────────────────────┐
│  ErrorBoundary                  │  ← SECOND: Shows transition UI
│  return <SplashScreen />        │
└─────────────────────────────────┘

403 error occurs
       │
       ▼
┌─────────────────────────────────┐
│  Global handler: NO ACTION      │  ← 403 does NOT trigger logout
└─────────────────────────────────┘
       │
       ▼ (error propagates)
┌─────────────────────────────────┐
│  ErrorBoundary                  │  ← Shows View403 or switch tenant
│  return <View403 />             │
└─────────────────────────────────┘
```

---

## Mutation Meta Options

Configure mutation behavior via the `meta` property:

```typescript
const { mutate } = useMyMutation({
  meta: {
    showSuccessToast: true,           // Opt-in: toast success
    successMessage: 'custom-key',     // Override success message
    validationHandledByForm: true,    // Suppress validation toast
    skipGlobalErrorHandler: true,     // Handle all errors locally
    skipAuthErrorHandler: true,       // Don't logout on 401 (rare)
  },
});
```

### Option Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `showSuccessToast` | `boolean` | `false` | Extract `translationKey`/`message` from API response and toast |
| `successMessage` | `string` | - | Override success toast with explicit message or translation key |
| `validationHandledByForm` | `boolean` | `false` | Skip toast for 422 errors (form handles via `setError`) |
| `skipGlobalErrorHandler` | `boolean` | `false` | Full opt-out - handle all errors in local `onError` |
| `skipAuthErrorHandler` | `boolean` | `false` | Don't trigger logout on 401 (for multi-step auth flows) |

### Success Toast Priority

1. `meta.successMessage` - uses explicit key/message
2. `meta.showSuccessToast: true` - extracts from API response
3. Neither - no success toast (default)

---

## API Reference

### `toApiFailure(error: unknown): ApiFailure`

Converts any error into a normalized `ApiFailure` discriminated union.

```typescript
import { toApiFailure } from '@/front/lib/api-failure';

const failure = toApiFailure(error);

switch (failure.kind) {
  case 'validation':
    // Handle field-level errors
    break;
  case 'problem':
    // Handle general API error
    if (failure.status === 404) {
      navigate('/not-found');
    }
    break;
  case 'network':
    // Handle network failure
    break;
  case 'abort':
    // Request cancelled - typically ignore
    break;
  case 'unknown':
    // Unexpected error
    break;
}
```

### `getFailureMessage(failure, options?): string`

Resolves the user-facing message for any `ApiFailure`.

This helper is responsible for:
- translating backend `translationKey` values from the `response-message` namespace
- falling back to `detail`, `title`, or a caller-provided fallback
- returning `''` for abort failures so callers can stay flat and silent

```typescript
import { getFailureMessage, toApiFailure } from '@/front/lib/api-failure';

const failure = toApiFailure(error);
const message = getFailureMessage(failure, {
  fallback: t('tenant-bulk-delete-failure'),
});

if (message) {
  toast.error(message);
}
```

### `mapValidationErrors(failure, setError, options?)`

Maps server validation errors to React Hook Form fields.

```typescript
import { mapValidationErrors } from '@/front/lib/api-failure';

const result = mapValidationErrors(failure, form.setError, {
  // Map server field names to form field names
  fieldMapping: {
    'Email': 'email',
    'FirstName': 'firstName',
  },
  // Auto-convert PascalCase to camelCase (default: true)
  autoConvertCase: true,
  // How to handle non-field errors (default: 'collect')
  nonFieldErrorStrategy: 'root' | 'ignore' | 'collect',
});

// result.mappedCount - number of fields set
// result.unmappedErrors - errors that couldn't be mapped
```

### `withFormValidation(setError, options)`

Helper that wraps mutation options for form validation.

```typescript
import { withFormValidation } from '@/front/lib/api-failure';

const { mutate } = useCreateUser(
  withFormValidation(form.setError, {
    fieldMapping: { 'Email': 'email' },
    meta: { showSuccessToast: true },
    onSuccess: () => navigate('/users'),
    onError: (error) => {
      // Runs AFTER field errors are mapped
      // You can do additional handling here
    },
  })
);
```

### Type Guards

```typescript
import {
  isValidationFailure,
  isProblemFailure,
  isNetworkFailure,
  isAbortFailure,
  isUnknownFailure,
} from '@/front/lib/api-failure';

if (isValidationFailure(failure)) {
  // failure.fieldErrors is available
}

if (isProblemFailure(failure)) {
  // failure.status, failure.detail available
}
```

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
└── react-query/
    └── query-client.tsx            # QueryClient with global handlers
```

---

## Examples

### Simple Mutation (Default Behavior)

```typescript
// Errors auto-toast, no configuration needed
const { mutate, isPending } = useDeleteUser({
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: useFindUsers.getKey() });
  },
});

<Button onClick={() => mutate({ id: userId })} disabled={isPending}>
  Delete
</Button>
```

### Form with Validation

```typescript
import { withFormValidation } from '@/front/lib/api-failure';

const form = useForm<FormData>({
  resolver: zodResolver(schema),
});

const { mutate, isPending } = useCreateUser(
  withFormValidation(form.setError, {
    meta: { showSuccessToast: true },
    onSuccess: () => {
      form.reset();
      navigate('/users');
    },
  })
);

const onSubmit = form.handleSubmit((data) => mutate(data));
```

### Custom Error UI (Opt-Out)

```typescript
const [errorModal, setErrorModal] = useState<string | null>(null);

const { mutate } = useDangerousAction({
  meta: { skipGlobalErrorHandler: true },
  onError: (error) => {
    const failure = toApiFailure(error);
    if (failure.kind === 'problem' && failure.status === 409) {
      setErrorModal('This action conflicts with existing data');
    } else {
      // Re-throw to let global handler toast it
      throw error;
    }
  },
});
```

### Query with Error Boundary

```typescript
// Queries don't toast - they throw to error boundary
const { data } = useGetUserDetails({
  variables: { userId },
  // Error will propagate to nearest ErrorBoundary
});
```

### Detail Page Error Views (Not Found vs Generic Error)

For detail pages that load a resource by ID (e.g. tenant details, staff user details), use `QueryDisplay` with an `ErrorSlot` that differentiates malformed IDs and missing resources from other errors:

```typescript
import { isProblemFailure, toApiFailure } from '@/front/lib/api-failure';
import { NotFoundView } from '@/front/components/error/not-found-view';
import { ErrorContent } from '@/front/components/empty-content/error-content';

const ErrorView: FC<{ error: unknown }> = ({ error }) => {
  const { t } = useTranslate();
  const failure = toApiFailure(error);

  if (
    isProblemFailure(failure) &&
    (failure.status === 404 ||
      (failure.status === 400 &&
        failure.translationKey === 'malformed-id'))
  ) {
    return (
      <NotFoundView
        withLayout={false}
        title={_.capitalize(t('my-entity-not-found-title'))}
        description={t('my-entity-not-found-description')}
      />
    );
  }

  return (
    <Box sx={{ py: 10 }}>
      <ErrorContent
        title={t('my-entity-details-error-title')}
        description={t('my-entity-details-error-description')}
      />
    </Box>
  );
};
```

**Key rules:**
- **404** (entity not found) and **400 with `malformed-id` translationKey** (invalid GUID) both show `NotFoundView`
- **Other 400 errors** (missing headers, other bad requests) fall through to the generic `ErrorContent`
- Use `withLayout={false}` for inline rendering inside a dashboard layout
- Provide custom `title` and `description` per entity context (e.g. "Tenant not found" vs "Staff user not found")
- The `malformed-id` translation key is set by the backend when `Guid.TryParse` fails (see `api-route-parameters.md`)

---

## Migration Guide

### From `isJsClientError`

The old `isJsClientError` utility is **deleted**. Here's how to migrate:

```typescript
// BEFORE
import { isJsClientError } from '@/front/lib/js-client/js-client-error';

if (isJsClientError(error)) {
  toast.error(error.key ? t(error.key) : error.messageEscaped);
}

// AFTER
import { toApiFailure } from '@/front/lib/api-failure';

const failure = toApiFailure(error);
if (failure.kind === 'problem') {
  toast.error(failure.translationKey ? t(failure.translationKey) : failure.detail);
}

// OR: Let global handler do it (recommended)
// Just remove the onError entirely!
```

### Property Mapping

| Old `isJsClientError` | New `ApiFailure` |
|----------------------|------------------|
| `error.key` | `failure.translationKey` |
| `error.messageEscaped` | `failure.detail` |
| `error.responseStatusCode` | `failure.status` |

---

## Best Practices

1. **Prefer default behavior**: Let global handler toast errors unless you have a specific reason not to.

2. **Use `withFormValidation` for forms**: It handles the boilerplate of validation error mapping.

3. **Don't suppress errors silently**: If you use `skipGlobalErrorHandler`, make sure you actually handle the error.

4. **Success toasts are opt-in**: Don't enable them unless the action warrants user confirmation.

5. **Test error scenarios**: Verify that validation errors appear on correct form fields.

---

## Troubleshooting

### Error not showing on form field

1. Check that `validationHandledByForm: true` is set
2. Verify field names match (use `fieldMapping` if server uses different names)
3. Check `result.unmappedErrors` for debugging

### Toast appears for validation error

You forgot to set `meta: { validationHandledByForm: true }` or use `withFormValidation`.

### 401 error doesn't redirect

1. Check that `onAuthError` is configured in `getQueryClient()`
2. Verify `skipAuthErrorHandler` isn't set on the mutation

### Network error not detected

The error must be a `TypeError` with a fetch-related message. Other network errors may fall through to `unknown`.
