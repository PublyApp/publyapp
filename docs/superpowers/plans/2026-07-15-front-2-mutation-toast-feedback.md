# Front-2 Mutation Toast Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every user-initiated front-2 mutation consistent toast feedback
while preserving inline field validation and persistent query errors.

**Architecture:** Pure feedback metadata and classification live in
`@org/shared-ts`. `apps/front-2` owns a Sonner host, locale-aware adapter, and
TanStack MutationCache integration. Ordinary mutations use central defaults;
bulk, clipboard, export, and compound workflows override metadata and emit one
local aggregate result.

**Tech Stack:** TypeScript 6, React 19, TanStack Query 5, i18next, Sonner 2,
Tailwind 4, Vitest, Testing Library, Playwright, pnpm.

**Issue:** #832

---

## File Structure

### New files

- `packages/shared-ts/lib/mutation-feedback/types.ts`: portable feedback
  metadata and notification-intent types.
- `packages/shared-ts/lib/mutation-feedback/policy.ts`: pure success/failure
  classification and response-message extraction.
- `packages/shared-ts/lib/mutation-feedback/policy.test.ts`: shared policy and
  type-contract coverage.
- `apps/front-2/src/components/ui/toaster.tsx`: app-styled Sonner host.
- `apps/front-2/src/components/ui/toaster.test.tsx`: host rendering and
  accessibility assertions.
- `apps/front-2/src/lib/mutation-toast.ts`: browser-safe Sonner/i18n adapter.
- `apps/front-2/src/lib/mutation-toast.test.ts`: adapter translation and
  suppression tests.

### Core files modified

- `packages/shared-ts/lib/query/create-hooks.ts`
- `packages/shared-ts/lib/query/create-hooks.test.ts`
- `apps/front-2/package.json`
- `pnpm-lock.yaml`
- `apps/front-2/src/router.tsx`
- `apps/front-2/src/router.test.ts`
- `apps/front-2/src/routes/__root.tsx`
- `apps/front-2/src/routes/__root-error-boundary.test.tsx`
- `apps/front-2/src/styles/app.css`
- Eight files under `apps/front-2/src/lib/query/`
- Mutation-owning route files and their existing focused tests
- English and French common locale JSON
- `docs/guides/frontend-error-handling.md`
- `docs/guides/front-2/conventions.md`

## Task 1: Add The Shared Feedback Policy

**Files:**

- Create: `packages/shared-ts/lib/mutation-feedback/types.ts`
- Create: `packages/shared-ts/lib/mutation-feedback/policy.ts`
- Create: `packages/shared-ts/lib/mutation-feedback/policy.test.ts`

- [ ] **Step 1: Write failing policy tests**

Create tests that specify success sources and error suppression:

```ts
import { describe, expect, test } from 'vitest';

import {
  resolveMutationFailureIntent,
  resolveMutationSuccessIntent,
} from './policy';

describe('resolveMutationFailureIntent', () => {
  test.each([
    [{ kind: 'abort' as const }, 'abort'],
    [
      {
        kind: 'problem' as const,
        status: 401,
        translationKey: undefined,
        detail: 'Unauthorized',
        title: 'Unauthorized',
      },
      'unauthorized',
    ],
  ])('keeps %s failures silent', (failure, reason) => {
    expect(resolveMutationFailureIntent(failure, {})).toEqual({
      kind: 'silent',
      reason,
    });
  });

  test('keeps locally handled validation inline', () => {
    expect(
      resolveMutationFailureIntent(
        {
          kind: 'validation',
          status: 422,
          translationKey: 'validation-failed',
          detail: undefined,
          title: undefined,
          fieldErrors: { email: ['Already used'] },
        },
        { validationHandledByForm: true },
      ),
    ).toEqual({ kind: 'silent', reason: 'handled-validation' });
  });

  test('keeps 403 visible', () => {
    expect(
      resolveMutationFailureIntent(
        {
          kind: 'problem',
          status: 403,
          translationKey: 'forbidden',
          detail: undefined,
          title: 'Forbidden',
        },
        {},
      ),
    ).toMatchObject({ kind: 'error', translationKey: 'forbidden' });
  });
});

describe('resolveMutationSuccessIntent', () => {
  test('prefers an explicit success key', () => {
    expect(
      resolveMutationSuccessIntent({}, {
        successMessage: 'tenant-updated-success',
      }),
    ).toEqual({ kind: 'success', translationKey: 'tenant-updated-success' });
  });

  test('extracts a response translation key when requested', () => {
    expect(
      resolveMutationSuccessIntent(
        { translationKey: 'tenant-suspended-success', message: 'Suspended' },
        { showSuccessToast: true },
      ),
    ).toEqual({
      kind: 'success',
      translationKey: 'tenant-suspended-success',
      fallbackMessage: 'Suspended',
    });
  });

  test('allows only explicitly internal success to be silent', () => {
    expect(
      resolveMutationSuccessIntent({}, { silentSuccess: true }),
    ).toEqual({ kind: 'silent', reason: 'configured-silent-success' });
  });
});
```

- [ ] **Step 2: Run the shared test and verify RED**

Run:

```bash
pnpm --filter @org/shared-ts exec vitest run \
  lib/mutation-feedback/policy.test.ts
```

Expected: FAIL because `./policy` does not exist.

- [ ] **Step 3: Implement portable types and pure policy**

Define the discriminated metadata union:

```ts
import type { ApiFailure } from '../api-failure/types';

export type MutationSuccessFeedback =
  | {
      successMessage: string;
      showSuccessToast?: never;
      silentSuccess?: never;
    }
  | {
      showSuccessToast: true;
      successMessage?: never;
      silentSuccess?: never;
    }
  | {
      silentSuccess: true;
      successMessage?: never;
      showSuccessToast?: never;
    };

export type MutationFailureFeedback = {
  validationHandledByForm?: boolean;
  skipGlobalErrorHandler?: boolean;
  skipAuthedErrorBackstop?: boolean;
};

export type MutationFeedbackMeta =
  MutationSuccessFeedback & MutationFailureFeedback;

export type MutationFeedbackIntent =
  | {
      kind: 'success';
      translationKey?: string;
      fallbackMessage?: string;
    }
  | {
      kind: 'error';
      failure: ApiFailure;
      translationKey?: string;
      fallbackMessage?: string;
    }
  | {
      kind: 'silent';
      reason:
        | 'abort'
        | 'unauthorized'
        | 'handled-validation'
        | 'local-error-owner'
        | 'configured-silent-success';
    };
```

Implement `resolveMutationFailureIntent` and
`resolveMutationSuccessIntent`. Success response extraction accepts only an
object with string `translationKey` or `message`; it must never stringify an
arbitrary payload. Failure classification uses the existing `ApiFailure`
discriminant and never performs translation. The failure resolver accepts
`MutationFailureFeedback` so infrastructure and local owners can classify a
failure without fabricating an unrelated success policy; complete TanStack
mutation metadata remains `MutationFeedbackMeta`.

- [ ] **Step 4: Run shared tests and verify GREEN**

Run:

```bash
pnpm --filter @org/shared-ts exec vitest run \
  lib/mutation-feedback/policy.test.ts
pnpm --filter @org/shared-ts test
```

Expected: the focused tests pass and the shared suite remains 59+ tests green.

- [ ] **Step 5: Commit shared policy**

```bash
git add packages/shared-ts/lib/mutation-feedback
git commit -m "feat(shared): add mutation feedback policy"
```

## Task 2: Add The Front-2 Sonner Host

**Files:**

- Modify: `apps/front-2/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/front-2/src/components/ui/toaster.tsx`
- Create: `apps/front-2/src/components/ui/toaster.test.tsx`
- Modify: `apps/front-2/src/styles/app.css`
- Modify: `apps/front-2/src/routes/__root.tsx`

- [ ] **Step 1: Add the pinned dependency**

Run:

```bash
pnpm --filter front-2 add sonner@2.0.6 --save-exact
```

Expected: `apps/front-2/package.json` contains `"sonner": "2.0.6"` and the
existing lockfile entry is reused.

- [ ] **Step 2: Write the failing host test**

Test one rendered host and its stable configuration:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { AppToaster } from './toaster';

describe('AppToaster', () => {
  test('mounts one top-right closeable Sonner host', () => {
    const { container } = render(<AppToaster />);
    const hosts = container.querySelectorAll('[data-sonner-toaster]');

    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.getAttribute('data-position')).toBe('top-right');
    expect(hosts[0]?.className).toContain('publy-toaster');
  });
});
```

- [ ] **Step 3: Run the host test and verify RED**

```bash
pnpm --filter front-2 exec vitest run src/components/ui/toaster.test.tsx
```

Expected: FAIL because `AppToaster` does not exist.

- [ ] **Step 4: Implement and mount the host**

Create `AppToaster` with Sonner's `Toaster`, `richColors`, `closeButton`,
`visibleToasts={4}`, `position="top-right"`, `offset={16}`, and Tabler icons.
Use `toastOptions.classNames` for app-owned classes rather than importing old
MUI styles.

Add `--publy-z-toast: 120` after `--publy-z-select` and style
`.publy-toaster`/variant classes with existing surface, foreground, border,
shadow, success, warning, and danger tokens. Use
`width: min(360px, calc(100vw - 24px))` so the longest localized message stays
inside mobile viewports.

Mount `<AppToaster />` once inside `<I18nextProvider>` in `RootShell`, after the
listeners and before `{children}`, so it shares locale/theme context and
survives route navigation.

- [ ] **Step 5: Verify host tests and root rendering**

```bash
pnpm --filter front-2 exec vitest run \
  src/components/ui/toaster.test.tsx \
  src/routes/__root-error-boundary.test.tsx
```

Expected: PASS with one host and no SSR/root regressions.

- [ ] **Step 6: Commit the host**

```bash
git add apps/front-2/package.json pnpm-lock.yaml \
  apps/front-2/src/components/ui/toaster.tsx \
  apps/front-2/src/components/ui/toaster.test.tsx \
  apps/front-2/src/routes/__root.tsx apps/front-2/src/styles/app.css
git commit -m "feat(front-2): add Sonner toast host"
```

## Task 3: Add The Locale-Aware Adapter And Central Handlers

**Files:**

- Create: `apps/front-2/src/lib/mutation-toast.ts`
- Create: `apps/front-2/src/lib/mutation-toast.test.ts`
- Modify: `apps/front-2/src/routes/__root.tsx`
- Modify: `apps/front-2/src/router.tsx`
- Modify: `apps/front-2/src/router.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Mock `sonner` and register a real in-memory i18n instance. Cover:

```ts
test('translates success keys through common', async () => {
  registerMutationToastI18n(i18n);
  await displayMutationFeedback({
    kind: 'success',
    translationKey: 'revoke-invitation-success',
  });
  expect(mocks.success).toHaveBeenCalledWith('Invitation revoked.');
});

test('translates backend keys through response-message', async () => {
  registerMutationToastI18n(i18n);
  await displayMutationFeedback({
    kind: 'error',
    failure,
    translationKey: 'bad-request',
    fallbackMessage: 'Unable to save',
  });
  expect(mocks.error).toHaveBeenCalledWith(
    i18n.t('bad-request', { ns: 'response-message' }),
  );
});

test('does nothing for silent intents', async () => {
  await displayMutationFeedback({ kind: 'silent', reason: 'abort' });
  expect(mocks.success).not.toHaveBeenCalled();
  expect(mocks.error).not.toHaveBeenCalled();
});
```

Also test fallback text, no browser access during SSR, and a rejected dynamic
Sonner import that is logged but does not reject the mutation callback. Test
that `displayLocalMutationFailure` keeps abort/401 silent and resolves an
ordinary rejected API request through the same shared policy as MutationCache.

- [ ] **Step 2: Run adapter tests and verify RED**

```bash
pnpm --filter front-2 exec vitest run src/lib/mutation-toast.test.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the app adapter**

Implement browser-only i18n registration and a cached dynamic Sonner import.
Message precedence is:

1. `response-message` when an API-provided key exists there;
2. `common` for explicit frontend success keys;
3. safe fallback text from the intent;
4. `common:an-error-occurred` for error intents.

Export these functions:

```ts
export const registerMutationToastI18n = (
  instance: I18nInstance | undefined,
): void;

export const displayMutationFeedback = async (
  intent: MutationFeedbackIntent,
): Promise<void>;

export const displayLocalMutationFailure = async (
  error: unknown,
  fallbackMessage?: string,
): Promise<void>;

export const toastLocalMutationResult = {
  success(message: string): void,
  error(message: string): void,
  warning(message: string): void,
  info(message: string): void,
};
```

`displayLocalMutationFailure` normalizes with `toApiFailure`, classifies through
`resolveMutationFailureIntent`, and delegates to `displayMutationFeedback`.
Local workflows use it for rejected API requests so abort/401/message
resolution cannot drift. `toastLocalMutationResult.error` is reserved for
already-aggregated domain results, such as a bulk response with failed counts.

Register/unregister the current root i18n instance in a `RootShell` effect. Do
not retain an SSR request's instance in module state.

- [ ] **Step 4: Write failing central handler tests**

Extend `router.test.ts` to call exported handler functions directly:

```ts
test('ordinary mutation failure emits one error intent', async () => {
  await handleMutationError(
    { responseStatusCode: 500, title: 'Server error' },
    { meta: { successMessage: 'saved' } },
  );
  expect(mocks.displayMutationFeedback).toHaveBeenCalledTimes(1);
  expect(mocks.displayMutationFeedback).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'error' }),
  );
});

test('401 invalidates the session without a toast', async () => {
  await handleMutationError(
    { responseStatusCode: 401, title: 'Unauthorized' },
    { meta: { successMessage: 'saved' } },
  );
  expect(mocks.triggerSessionInvalidated).toHaveBeenCalledTimes(1);
  expect(mocks.displayMutationFeedback).not.toHaveBeenCalled();
});
```

Add success, abort, handled validation, and local-owner cases.

- [ ] **Step 5: Wire `MutationCache` and verify GREEN**

Export `handleMutationError` and `handleMutationSuccess`, normalize through the
shared policy, and call `displayMutationFeedback` fire-and-forget with an
internal catch. Preserve the current `handleAuthedQueryError` call before
failure classification. Add `MutationCache.onSuccess` without changing
`QueryCache`; queries must never toast.

```bash
pnpm --filter front-2 exec vitest run \
  src/lib/mutation-toast.test.ts src/router.test.ts
```

Expected: PASS; router tests still prove the existing 401 backstop.

- [ ] **Step 6: Commit central integration**

```bash
git add apps/front-2/src/lib/mutation-toast.ts \
  apps/front-2/src/lib/mutation-toast.test.ts apps/front-2/src/router.tsx \
  apps/front-2/src/router.test.ts apps/front-2/src/routes/__root.tsx
git commit -m "feat(front-2): centralize mutation toasts"
```

## Task 4: Enforce Feedback Metadata On Mutation Factories

**Files:**

- Modify: `packages/shared-ts/lib/query/create-hooks.ts`
- Modify: `packages/shared-ts/lib/query/create-hooks.test.ts`
- Modify: `apps/front-2/src/lib/query/staff-invitations.ts`
- Modify: `apps/front-2/src/lib/query/staff-profiles.ts`
- Modify: `apps/front-2/src/lib/query/staff-tenant-invitations.ts`
- Modify: `apps/front-2/src/lib/query/staff-tenant-profiles.ts`
- Modify: `apps/front-2/src/lib/query/staff-tenant-users.ts`
- Modify: `apps/front-2/src/lib/query/staff-tenants.ts`
- Modify: `apps/front-2/src/lib/query/staff-uploads.ts`
- Modify: `apps/front-2/src/lib/query/staff-users.ts`
- Modify: `packages/shared-ts/lib/i18n/json/common.en.json`
- Modify: `packages/shared-ts/lib/i18n/json/common.fr.json`

- [ ] **Step 1: Add a failing type contract**

Change `BaseMutationOptions` to require `meta: MutationFeedbackMeta`, then add
type assertions in `create-hooks.test.ts`:

```ts
// @ts-expect-error mutation factories require an explicit success policy
buildStaffMutationOptions(
  { mutationKeyFn: () => ['missing-meta'], mutationFn: async () => undefined },
  createScopeOptions(accessor),
);

buildStaffMutationOptions(
  {
    mutationKeyFn: () => ['valid-meta'],
    mutationFn: async () => undefined,
    meta: { successMessage: 'saved' },
  },
  createScopeOptions(accessor),
);
```

- [ ] **Step 2: Run typecheck and verify RED at front-2 call sites**

```bash
pnpm --filter front-2 typecheck
```

Expected: FAIL at every mutation factory without `meta`.

- [ ] **Step 3: Add metadata to all eight query modules**

Use this ownership matrix:

<!-- markdownlint-disable MD013 -->

| Module and mutations | Default policy |
| --- | --- |
| `staff-invitations`: bulk create | `successMessage: 'invitations-sent-successfully'`, validation handled by form |
| `staff-invitations`: link | `silentSuccess`, local error owner because clipboard owns completion |
| `staff-invitations`: resend/revoke | `successMessage: 'resend-invitation-success'` / `'revoke-invitation-success'` |
| `staff-tenant-invitations`: revoke | `successMessage: 'revoke-invitation-success'` |
| `staff-tenants`: create/update/lifecycle | explicit create/update keys; lifecycle uses API response where available |
| `staff-tenants`: bulk lifecycle | `silentSuccess` plus local error owner for aggregate copy |
| `staff-profiles`: create | `successMessage: 'profile-created-successfully'`, validation handled by form |
| `staff-tenant-profiles`: create/update | local compound owner; delete is automatic; bulk delete is aggregate-local |
| `staff-tenant-profiles`: permission assign/unassign | automatic direct-action keys; hook accepts a metadata override for compound drawer use |
| `staff-tenant-users`: invite/update | automatic success with locally handled field validation |
| `staff-tenant-users`: lifecycle/remove | automatic success keys |
| `staff-tenant-users`: bulk remove/export | aggregate-local and completion-local respectively |
| `staff-users`: update/profile update | local compound owner |
| `staff-users`: email/lifecycle/delete | automatic success; email validation handled by form |
| `staff-uploads`: upload | local owner: success only after a usable URL is applied; corrective file/server errors stay inline |

<!-- markdownlint-enable MD013 -->

For shared hooks used in both simple and compound contexts, accept an optional
`MutationFeedbackMeta` override and merge it at hook creation:

```ts
export const useAssignStaffTenantProfilePermissionMutation = (
  meta: MutationFeedbackMeta =
    { successMessage: 'permission-assigned-success' },
) => useMutation({ ...assignPermissionOptions, meta });
```

The drawer passes `{ silentSuccess: true, skipGlobalErrorHandler: true }`; the
profile-details page uses the default.

Give the upload mutation `{ silentSuccess: true, skipGlobalErrorHandler: true }`.
Its field component owns both completion and corrective errors because a
successful HTTP response without a usable URL is not a successful user-visible
upload.

- [ ] **Step 4: Add missing bilingual success keys**

Add exact English/French pairs for mutation types without existing specific
copy:

```json
"tenant-created-success": "Tenant created successfully.",
"tenant-updated-success": "Tenant updated successfully.",
"tenant-deleted-success": "Tenant deleted successfully.",
"profile-updated-successfully": "Profile updated successfully.",
"profile-deleted-successfully": "Profile deleted successfully.",
"staff-user-updated-success": "Staff user updated successfully.",
"staff-user-deleted-success": "Staff user deleted successfully.",
"tenant-user-updated-success": "Tenant user updated successfully.",
"tenant-user-removed-success": "Tenant user removed successfully.",
"permission-assigned-success": "Permission assigned successfully.",
"permission-unassigned-success": "Permission removed successfully.",
"image-uploaded-success": "Image uploaded successfully.",
"export-completed-success": "Export downloaded successfully."
```

French values must be real translations, for example
`"Locataire mis à jour avec succès."`, not copied English.

- [ ] **Step 5: Verify metadata and i18n coverage**

```bash
pnpm --filter @org/shared-ts test
pnpm --filter front-2 typecheck
pnpm --filter front-2 exec vitest run src/lib/i18n-key-coverage.test.ts
```

Expected: PASS with no mutation factory lacking metadata and no locale drift.

- [ ] **Step 6: Commit the enforced contract**

```bash
git add packages/shared-ts/lib/query packages/shared-ts/lib/i18n/json \
  apps/front-2/src/lib/query
git commit -m "refactor(front-2): declare mutation feedback"
```

## Task 5: Migrate Invitation Feedback

**Files:**

- Modify: `apps/front-2/src/routes/authed/staff/invitations/table-columns.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/invitations/table-columns.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/invitations/$invitationId.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/invitations/$invitationId.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/invitations/new.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/invitations/new.test.ts`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/invitations.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/invitations.test.tsx`

- [ ] **Step 1: Change tests from banners to toast ownership**

Mock `~/lib/mutation-toast`. Assert:

- tenant invitation revoke success emits exactly one success toast and no
  page `role="status"` banner;
- revoke failure emits one error toast;
- 401 emits no toast and still redirects/logout;
- staff invitation copy emits success only after `clipboard.writeText`;
- clipboard fallback emits info with the link retained;
- resend/revoke row actions rely on central feedback and only invalidate/close;
- bulk-create validation remains inline and success no longer renders a
  persistent success block.

- [ ] **Step 2: Run invitation tests and verify RED**

```bash
pnpm --filter front-2 exec vitest run \
  'src/routes/authed/staff/invitations/table-columns.test.tsx' \
  'src/routes/authed/staff/invitations/$invitationId.test.tsx' \
  'src/routes/authed/staff/invitations/new.test.ts' \
  'src/routes/authed/staff/tenants/$tenantId/invitations.test.tsx'
```

Expected: FAIL because routes still render local feedback banners.

- [ ] **Step 3: Remove mutation-result banner state**

Delete `ActionFeedback`, tone helpers, `feedback` state, and mutation-result
blocks. Ordinary resend/revoke errors and successes are central. Keep the
pending-only explanatory block because it describes current page state.

Use local adapter ownership only for copy completion:

```ts
await copyLink.mutateAsync({ invitationId });
await navigator.clipboard.writeText(nextLink);
toastLocalMutationResult.success(t('copy-link-success'));
```

In `catch`, call `displayLocalMutationFailure(error, t('copy-link-failed'))`
once because the link mutation opted out centrally. The shared policy keeps
abort and 401 silent while preserving backend message resolution.

- [ ] **Step 4: Run invitation tests and verify GREEN**

Run the command from Step 2. Expected: PASS with exactly one notification per
outcome.

- [ ] **Step 5: Commit invitation migration**

```bash
git add apps/front-2/src/routes/authed/staff/invitations \
  'apps/front-2/src/routes/authed/staff/tenants/$tenantId/invitations.tsx' \
  'apps/front-2/src/routes/authed/staff/tenants/$tenantId/invitations.test.tsx'
git commit -m "refactor(front-2): toast invitation mutations"
```

## Task 6: Migrate Tenant Lifecycle And Bulk Feedback

**Files:**

- Modify: `apps/front-2/src/routes/authed/staff/tenants.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants-new.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants-new.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId-edit.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId-edit.test.tsx`

- [ ] **Step 1: Write failing tenant feedback tests**

Replace banner assertions with:

- row lifecycle success/error is handled centrally once;
- bulk success, partial success, and failure use one local toast;
- ineligible bulk selection still shows its existing warning without calling a
  mutation;
- create/update field validation remains inline;
- create/update general failure is a toast, not `serverError` text;
- successful create/update can navigate while the toast remains root-owned.

- [ ] **Step 2: Verify tenant tests fail**

```bash
pnpm --filter front-2 exec vitest run \
  src/routes/authed/staff/tenants.test.tsx \
  'src/routes/authed/staff/tenants/$tenantId.test.tsx' \
  src/routes/authed/staff/tenants-new.test.tsx \
  'src/routes/authed/staff/tenants/$tenantId-edit.test.tsx'
```

Expected: FAIL on old `bulkFeedback`/`serverError` behavior.

- [ ] **Step 3: Implement tenant ownership**

Remove page-level mutation outcome state and callbacks. Bulk handlers keep
local ownership and call one of:

```ts
toastLocalMutationResult.success(
  t(TENANT_BULK_SUCCESS_KEYS[action], { count: succeededCount }),
);
toastLocalMutationResult.error(
  t(TENANT_BULK_PARTIAL_SUCCESS_KEYS[action], {
    succeeded: succeededCount,
    failed: failedCount,
  }),
);
```

Keep mutation `try/catch` separate from invalidation/navigation. Form catches
map validation failures only; ordinary failures are already centrally toasted.

- [ ] **Step 4: Run tenant tests and verify GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 5: Commit tenant migration**

```bash
git add apps/front-2/src/routes/authed/staff/tenants.tsx \
  apps/front-2/src/routes/authed/staff/tenants.test.tsx \
  apps/front-2/src/routes/authed/staff/tenants-new.tsx \
  apps/front-2/src/routes/authed/staff/tenants-new.test.tsx \
  'apps/front-2/src/routes/authed/staff/tenants/$tenantId.tsx' \
  'apps/front-2/src/routes/authed/staff/tenants/$tenantId.test.tsx' \
  'apps/front-2/src/routes/authed/staff/tenants/$tenantId-edit.tsx' \
  'apps/front-2/src/routes/authed/staff/tenants/$tenantId-edit.test.tsx'
git commit -m "refactor(front-2): toast tenant mutations"
```

## Task 7: Migrate Profile And Permission Feedback

**Files:**

- Modify: `apps/front-2/src/routes/authed/staff/profiles-new.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/profiles-new.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/profiles.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/profiles.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/profiles/$profileId.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/profiles/$profileId.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/profiles/_profile-form-drawer.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/profiles/_profile-form-drawer.test.tsx`

- [ ] **Step 1: Write failing profile feedback tests**

Cover standalone create, direct permission assign/unassign, row delete, bulk
delete aggregate feedback, drawer validation, and drawer partial permission
failure. The compound drawer must emit one final success toast only after
profile save and permission synchronization both complete. A partial permission
failure remains inline with retryable state and emits no false full-success
toast.

- [ ] **Step 2: Verify profile tests fail**

```bash
pnpm --filter front-2 exec vitest run \
  src/routes/authed/staff/profiles-new.test.tsx \
  'src/routes/authed/staff/tenants/$tenantId/profiles.test.tsx' \
  'src/routes/authed/staff/tenants/$tenantId/profiles/$profileId.test.tsx' \
  'src/routes/authed/staff/tenants/$tenantId/profiles/_profile-form-drawer.test.tsx'
```

Expected: FAIL on banner/server-error and per-submutation expectations.

- [ ] **Step 3: Implement profile ownership**

Pass local-owner metadata to permission hooks inside the drawer:

```ts
const localPermissionMeta = {
  silentSuccess: true,
  skipGlobalErrorHandler: true,
} as const;
const assignPermission =
  useAssignStaffTenantProfilePermissionMutation(localPermissionMeta);
```

Direct profile-detail permission actions use default central metadata. Bulk
delete displays one aggregate local toast. Keep validation and retryable
permission-sync errors inline; remove general mutation banners.

- [ ] **Step 4: Run profile tests and verify GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 5: Commit profile migration**

```bash
git add apps/front-2/src/routes/authed/staff/profiles-new.tsx \
  apps/front-2/src/routes/authed/staff/profiles-new.test.tsx \
  'apps/front-2/src/routes/authed/staff/tenants/$tenantId/profiles.tsx' \
  'apps/front-2/src/routes/authed/staff/tenants/$tenantId/profiles.test.tsx' \
  'apps/front-2/src/routes/authed/staff/tenants/$tenantId/profiles/$profileId.tsx'
git add 'apps/front-2/src/routes/authed/staff/tenants/$tenantId/profiles/$profileId.test.tsx'
git add 'apps/front-2/src/routes/authed/staff/tenants/$tenantId/profiles/_profile-form-drawer.tsx'
git add \
  'apps/front-2/src/routes/authed/staff/tenants/$tenantId/profiles/_profile-form-drawer.test.tsx'
git commit -m "refactor(front-2): toast profile mutations"
```

## Task 8: Migrate Staff And Tenant User Feedback

**Files:**

- Modify: `apps/front-2/src/components/field/field-image-upload.tsx`
- Create: `apps/front-2/src/components/field/field-image-upload.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/staff-users/$userId.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/staff-users/$userId.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/staff-users/$userId-edit.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/staff-users/$userId-edit.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/staff-users/_change-email-dialog.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/staff-users/_change-email-dialog.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/users.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/users.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/users/$userId.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/users/$userId.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/users/$userId-edit.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/users/$userId-edit.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/_invite-user-drawer.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/_invite-user-drawer.test.tsx`

- [ ] **Step 1: Write failing user feedback tests**

Cover:

- staff and tenant lifecycle success/error through central feedback;
- delete/remove navigation without a persistent status block;
- email and invite 422 errors inline with no duplicate toast;
- email/invite general failures as one toast;
- compound staff-user edit with one final success toast and retained partial
  failure state;
- tenant-user bulk remove partial/success/failure as one local toast;
- export success only after `downloadFile` completes and export failure once.
- image upload success only after a usable URL is applied, while invalid file,
  missing-URL, and server failures stay inline without a duplicate toast.

- [ ] **Step 2: Verify user tests fail**

```bash
pnpm --filter front-2 exec vitest run \
  'src/routes/authed/staff/staff-users/$userId.test.tsx' \
  'src/routes/authed/staff/staff-users/$userId-edit.test.tsx' \
  src/routes/authed/staff/staff-users/_change-email-dialog.test.tsx \
  'src/routes/authed/staff/tenants/$tenantId/users.test.tsx' \
  'src/routes/authed/staff/tenants/$tenantId/users/$userId.test.tsx' \
  'src/routes/authed/staff/tenants/$tenantId/users/$userId-edit.test.tsx' \
  'src/routes/authed/staff/tenants/$tenantId/_invite-user-drawer.test.tsx' \
  src/components/field/field-image-upload.test.tsx
```

Expected: FAIL on old inline mutation feedback.

- [ ] **Step 3: Implement user ownership**

Remove mutation-result banner state. Retain `setError`/validation summaries.
Use local-owner metadata for compound edit, bulk removal, and export. Emit local
success only after the complete user-visible operation:

```ts
data = await exportMutation.mutateAsync({ tenantId, ids: selectedIds });
downloadFile({ data, fileName, mimeType: 'text/csv' });
toastLocalMutationResult.success(t('export-completed-success'));
```

Split mutation catches from invalidation/navigation so a later exception cannot
produce a false mutation-failure toast.

For export request rejection, call `displayLocalMutationFailure` once. Keep
download/post-processing failure separate from the API mutation catch and show
the localized export failure once; neither path may also reach MutationCache.

Keep upload validation and request failures in `FieldImageUpload.localError`.
After the mutation returns a non-empty URL, apply the resolved URL to the form
field and emit `toastLocalMutationResult.success(t('image-uploaded-success'))`.
Do not toast when the response has no URL.

- [ ] **Step 4: Run user tests and verify GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 5: Commit user migration**

```bash
git add apps/front-2/src/routes/authed/staff/staff-users \
  apps/front-2/src/components/field/field-image-upload.tsx \
  apps/front-2/src/components/field/field-image-upload.test.tsx \
  'apps/front-2/src/routes/authed/staff/tenants/$tenantId/users.tsx' \
  'apps/front-2/src/routes/authed/staff/tenants/$tenantId/users.test.tsx' \
  'apps/front-2/src/routes/authed/staff/tenants/$tenantId/users'
git add 'apps/front-2/src/routes/authed/staff/tenants/$tenantId/_invite-user-drawer.tsx'
git add \
  'apps/front-2/src/routes/authed/staff/tenants/$tenantId/_invite-user-drawer.test.tsx'
git commit -m "refactor(front-2): toast user mutations"
```

## Task 9: Add Regression Guardrails And Documentation

**Files:**

- Create: `apps/front-2/src/lib/mutation-feedback-architecture.test.ts`
- Modify: `docs/guides/frontend-error-handling.md`
- Modify: `docs/guides/front-2/conventions.md`

- [ ] **Step 1: Add failing guard tests**

Add a focused architecture test over production `.ts`/`.tsx` source:

- forbid direct imports from `sonner` outside
  `components/ui/toaster.tsx` and `lib/mutation-toast.ts`;
- require direct `useMutation` construction to remain under `src/lib/query`;
- verify `router.tsx` wires mutation feedback only through `MutationCache`,
  never through `QueryCache`;
- verify the generated query factories are never configured with
  `handlers.onToast`, because that seam also handles query failures.

Use the same source-walking helpers as i18n coverage tests, and test extracted
pure predicates with violating and allowed fixture strings. Do not ban generic
inline alerts or feedback state because validation, query, and precondition
messages legitimately use them.

- [ ] **Step 2: Run guards and verify RED**

```bash
pnpm --filter front-2 exec vitest run \
  src/lib/mutation-feedback-architecture.test.ts
```

Expected: FAIL because the architecture test does not exist.

- [ ] **Step 3: Implement guards and update documentation**

Document the approved matrix:

- user mutation success/general failure uses toast;
- handled field validation remains inline;
- query failures remain persistent;
- abort/401 are silent;
- compound/bulk flows name one owner;
- pure policy is shared, presentation is app-local;
- old frontend remains unchanged.

Update the old guide's success-opt-in wording with a clearly scoped front-2
section rather than rewriting legacy behavior as though it already changed.

- [ ] **Step 4: Verify guards and docs**

```bash
pnpm --filter front-2 exec vitest run \
  src/lib/mutation-feedback-architecture.test.ts \
  src/lib/i18n-key-coverage.test.ts
pnpm exec markdownlint \
  docs/guides/frontend-error-handling.md \
  docs/guides/front-2/conventions.md
```

Expected: PASS.

- [ ] **Step 5: Commit guardrails and docs**

```bash
git add apps/front-2/src/lib/mutation-feedback-architecture.test.ts \
  docs/guides/frontend-error-handling.md docs/guides/front-2/conventions.md
git commit -m "docs(front-2): enforce mutation toast rules"
```

## Task 10: Full Verification And Browser Proof

**Files:**

- Modify: `apps/front-2/e2e/staff-tenant-details.spec.ts`
- Modify: `apps/front-2/e2e/staff-invitations.spec.ts`

- [ ] **Step 1: Add Playwright assertions before implementation verification**

For tenant invitation revocation, assert:

```ts
await page.getByRole('button', { name: 'Revoke' }).click();
await expect(page.getByText('Invitation revoked.')).toBeVisible();
await expect(
  page.locator('[data-sonner-toast][data-type="success"]'),
).toHaveCount(1);
await expect(page.locator('.publy-detail-tab-body [role="status"]')).toHaveCount(0);
```

Add one mobile viewport assertion that the toast bounding box stays within the
viewport and one navigation assertion that a success toast remains visible
after redirect.

- [ ] **Step 2: Run targeted Playwright and fix only product defects**

Start the isolated front-2/API stack using the repo adapter's unique ports and
hostname. Then run the exact relevant Playwright projects/specs. Expected:
desktop and mobile pass, one toast per mutation, no overlay overlap.

- [ ] **Step 3: Run complete automated verification**

```bash
pnpm --filter @org/shared-ts test
pnpm --filter front-2 typecheck
pnpm --filter front-2 test
pnpm --filter front-2 build
pnpm lint
pnpm format
git diff --check
```

Expected:

- shared tests all pass;
- front-2 unit and guard suites all pass;
- TypeScript reports zero errors;
- production build succeeds;
- lint/format and whitespace checks are clean.

- [ ] **Step 4: Inspect browser screenshots**

Capture desktop and mobile screenshots for success, error, and long French
toast copy. Verify readable contrast, no clipped text, close-button access,
toast z-index above drawers/menus, and no overlap with critical controls.

- [ ] **Step 5: Run React Doctor**

Use the `react-doctor` skill against the final React diff. Resolve actionable
accessibility, effect, rendering, or architecture findings, then rerun affected
tests.

- [ ] **Step 6: Commit final browser coverage**

```bash
git add apps/front-2/e2e
git commit -m "test(front-2): cover mutation toast feedback"
```

- [ ] **Step 7: Request independent review**

Use the `requesting-code-review` skill. The reviewer must be from a different
model family than the implementer and must check:

- spec compliance;
- duplicate or missing toast ownership;
- false failure after post-processing;
- validation/query/session exceptions;
- SSR and i18n safety;
- mobile accessibility and z-index.

Address findings with TDD and rerun the complete verification command set.
