# Front-2 Mutation Toast Feedback Design

**Status:** Approved design
**Issue:** #832
**Scope:** `apps/front-2` with pure policy in `packages/shared-ts`

## Problem

`apps/front-2` has no toast host or notification adapter. Mutation outcomes are
therefore implemented route by route as persistent banners, inline status
blocks, or local form messages. A successful tenant invitation revocation, for
example, renders an alert in the page body instead of transient confirmation.

The inconsistency is broader than that route. The current production inventory
contains 43 mutation calls across 18 `front-2` files. Tenant, profile, user, and
invitation workflows use several incompatible feedback patterns, and there is
no enforceable rule for future mutations.

The retiring `apps/front` application already uses Sonner and provides useful
behavioral precedent. Its renderer is MUI-specific, however, and cannot be
shared with the Tailwind/Base UI frontend. Existing front-2 conventions also
require application-bound adapters, including toast rendering and i18n, to stay
outside `@org/shared-ts`.

## Goals

- Give every user-initiated `front-2` mutation an explicit feedback policy.
- Show successful mutation outcomes as success toasts.
- Show non-field mutation failures as error toasts.
- Keep corrective field validation beside the affected field without a
  duplicate toast.
- Emit one aggregate notification for bulk and compound operations.
- Reuse the old frontend's proven behavior while keeping presentation
  compatible with each application's design system.
- Make the policy difficult to bypass accidentally when adding mutations.

## Non-goals

- Refactoring `apps/front` mutation call sites or changing its behavior.
- Sharing MUI components, Tailwind classes, React renderers, Sonner instances,
  icons, or application i18n through `shared-ts`.
- Toasting query failures, authorization views, loading states, or persistent
  page-state failures.
- Replacing inline field errors, confirmation dialogs, or dirty-form guards.
- Treating cache invalidation or navigation failures as failed API mutations.

## Product Rules

Feedback location follows the action the user must take:

<!-- markdownlint-disable MD013 -->

| Outcome | Presentation | Reason |
| --- | --- | --- |
| Successful user mutation | Success toast | Confirms completion without shifting layout or leaving stale state |
| General mutation failure | Error toast | Reports a transient command-level outcome with no corrective field |
| Server field validation | Inline field/form error only | Keeps the correction next to the affected input and avoids duplication |
| Bulk or compound result | One aggregate toast or retained compound form state | Prevents per-request noise and preserves retryable partial state |
| HTTP 401 | Existing session invalidation/logout | Navigation is the actionable response; a toast would be redundant |
| Aborted request | Silent | Cancellation or navigation is not a user-visible failure |
| Query failure | Persistent page/table error state | The page cannot render and generally needs Retry |
| Precondition with no mutation | Existing inline warning or warning toast | Explains why no command ran; it is not mutation feedback |

<!-- markdownlint-enable MD013 -->

HTTP 403 remains an error outcome and must not trigger logout. Clipboard copy
feedback is emitted only after clipboard completion, not merely after a link
API succeeds.

## Architecture

### Shared policy

`packages/shared-ts` owns dependency-light mutation-feedback contracts and pure
classification. It may depend on the existing `ApiFailure` union, but it must
not import React, TanStack Query at runtime, Sonner, MUI, Base UI, Tailwind, or
an application i18n instance.

The shared contract models three concerns:

1. The success source is explicit: a translation key, an API response
   `translationKey`/`message`, or an intentional silent policy for a
   non-user-facing internal mutation.
2. Validation may be declared locally handled.
3. A complex workflow may declare that it owns aggregate error feedback.

The policy receives normalized failure data and mutation metadata, then returns
a notification intent or a silent disposition. It does not display or translate
anything. This keeps the behavior reusable by future applications without
moving app-bound adapters into the shared package.

### Front-2 adapter and host

`apps/front-2` owns:

- a single Sonner host mounted inside the locale-aware root shell;
- a browser-safe imperative adapter for success, error, warning, and info;
- translation of shared notification intents with the active i18n instance;
- Tailwind/design-token styling, Tabler icons, responsive width, and z-index;
- integration with the existing QueryClient `MutationCache`.

The host reuses the old frontend's interaction defaults: top-right placement,
a close button, a 16-pixel desktop offset, no more than four visible toasts,
and persistence across route navigation. Mobile width and offsets must remain
within the viewport. The host is mounted exactly once.

### Central defaults and local ownership

Ordinary mutations use the central handler:

- success metadata resolves to one success toast;
- abort resolves to silence;
- 401 runs the existing session-invalidated path and resolves to silence;
- locally handled validation resolves to silence;
- other failures resolve to one error toast.

Bulk, partial-success, clipboard, and multi-mutation form workflows opt out of
the relevant automatic handler and own exactly one final notification. Their
local handler must still use the shared classification/message path rather than
inventing another error parser.

The existing `QueryErrorHandlers.onToast` seam is not wired for this feature.
That seam is shared by generated queries and mutations and is fixed when query
modules are constructed; using it would also toast query errors and would create
duplicate ownership with `MutationCache`.

## Typed Mutation Metadata

The mutation configuration type must require an explicit success policy for
front-2 mutation factories. A discriminated union should make the valid choices
clear:

```ts
type MutationSuccessFeedback =
  | { successMessage: string; showSuccessToast?: never; silentSuccess?: never }
  | { showSuccessToast: true; successMessage?: never; silentSuccess?: never }
  | { silentSuccess: true; successMessage?: never; showSuccessToast?: never };

type MutationFeedbackMeta = MutationSuccessFeedback & {
  validationHandledByForm?: boolean;
  skipGlobalErrorHandler?: boolean;
  skipAuthedErrorBackstop?: boolean;
};
```

The names intentionally preserve the old frontend's proven metadata vocabulary.
`silentSuccess` is reserved for internal/auth/background operations with no
user-initiated command outcome; it is not an escape hatch for ordinary UI
mutations.

The front-2 TanStack Query module augmentation remains application-local. The
portable metadata types and pure policy live in `shared-ts`.

## Translation And Message Resolution

For success:

1. Prefer an explicit frontend translation key when the workflow needs specific
   or aggregate copy.
2. Otherwise use a successful API response's `translationKey`.
3. Use the API response's safe message only when no translation key exists.

For failure:

1. Normalize unknown errors with `toApiFailure`.
2. Suppress abort and 401 dispositions.
3. Resolve a known `translationKey` through the response-message namespace.
4. Fall back to safe detail/title/network text.
5. Fall back to explicit localized workflow copy.

Raw backend translation keys must never appear to users. Translation is
performed by the app adapter because the root owns a request-specific i18n
instance. Browser-only adapter registration must not leak request state during
SSR.

## Migration Classification

Every production mutation call in `apps/front-2` is audited, including tenant,
profile, staff-user, tenant-user, and invitation surfaces.

Convert to transient toasts:

- invitation resend, revoke, and copy-link outcomes;
- tenant/user/profile lifecycle actions;
- permission assignment and removal;
- create/edit/delete completion that navigates;
- export completion or failure;
- aggregate bulk completion or failure.

Keep corrective or persistent feedback:

- React Hook Form `setError` mappings for 422 field failures;
- import/file parse and type/size errors;
- drawer/dialog validation summaries that must remain visible for correction;
- compound-save partial failures that preserve dirty/retry state;
- login/signup/reset/verify/accept-invitation page alerts;
- query/table error states and authorization views;
- selection and action-precondition warnings where no mutation ran.

Existing page banners used only for mutation success or general mutation failure
are removed with their state types, tone helpers, dismiss buttons, and tests.

## Ordering And Failure Semantics

The toast describes the authoritative mutation result, not unrelated
post-processing. Implementations must separate these phases:

1. Await the API mutation or aggregate endpoint.
2. Derive and display the mutation outcome once.
3. Invalidate affected query families.
4. Navigate or close UI as appropriate.

A cache invalidation, state update, clipboard operation, or navigation exception
after a successful API write must not be caught and reported as "mutation
failed." Such failures use logging and route recovery appropriate to their own
layer. Conversely, copy-link success is not announced until the clipboard step
has completed.

## Duplicate-Toast Controls

One rejection can be observed by the MutationCache, generated factory options,
hook callbacks, per-call callbacks, and a surrounding `mutateAsync` catch. Each
workflow must have one declared owner.

- Central ownership is the default.
- Local aggregate ownership opts out centrally.
- Locally handled validation suppresses only the validation toast; unrelated
  network/problem failures still use the central error toast.
- Per-item submutations in `Promise.allSettled` never emit individual toasts.
- Existing 401 route checks may coexist with the central backstop, but neither
  path displays a toast.

## Testing

### Shared unit tests

- ordinary problem/network/unknown failures produce error intents;
- abort and 401 produce silent dispositions;
- 403 remains an error intent;
- locally handled validation is silent;
- explicit, response-derived, and intentionally silent success policies work;
- invalid metadata combinations fail TypeScript compilation.

### Front-2 infrastructure tests

- the Sonner host mounts once under the locale-aware root;
- toast variants use the expected accessible live-region behavior;
- the host has close controls, responsive bounds, and the required z-index;
- translation keys resolve through the correct namespace;
- SSR paths do not access browser globals or throw;
- MutationCache emits exactly one toast for default success/failure;
- validation, abort, 401, and local-owner opt-outs emit none;
- existing session invalidation behavior remains intact.

### Route regression tests

Representative coverage must include:

- tenant invitation revoke success and failure;
- a lifecycle mutation that navigates;
- a form with server field validation;
- a bulk or compound partial result;
- a 401 mutation;
- copy-link completion ordering.

Every migrated banner test is changed to assert one toast call and the absence
of the old persistent feedback. Focused tests are supplemented by the complete
`shared-ts` and `front-2` suites, typecheck, formatting, lint, production build,
design-system guards, and targeted Playwright verification at desktop and
mobile widths.

## Documentation

Update the canonical frontend error-handling guide and front-2 conventions to
record:

- mutation outcomes use toasts;
- field validation stays inline without duplication;
- query errors stay persistent;
- abort and 401 are silent;
- bulk/compound workflows have one feedback owner;
- app presentation stays local while pure policy belongs in `shared-ts`.

## Rollout

The change ships as one issue, branch, and PR because the toast host, policy,
and route migration must land together to avoid partially converted feedback.
The old frontend remains functionally unchanged. Any later old-front
consolidation requires a separate issue and regression plan.
