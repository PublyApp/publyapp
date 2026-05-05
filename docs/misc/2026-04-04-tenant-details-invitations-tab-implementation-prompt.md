# Tenant Details Invitations Tab Implementation Prompt

## Context

We are working in `PublyApp` and specifically in the staff tenant-details area.

Current tenant-details tabs:
- `General`
- `Users`
- `Profiles`
- `Billing`

Relevant current files:
- `apps/front/src/routes/authed/staff/tenants/details/_layout/tenant-details-layout.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/users/tenant-details-users-page.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/users/parts/invite-user-form.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`

Current product reality:
- Creating a tenant invitation does **not** create a `User`.
- The invited person should therefore **not** appear immediately in the tenant users list.
- The person should appear in the tenant users list only after accepting the invitation.

## Goal

Add a tenant-details `Invitations` tab so tenant-scoped invitations have a correct home in the UI.

## Desired UX

1. Add a new `Invitations` tab under tenant details.
2. This tab should become the source of truth for invitations created for that tenant.
3. When a staff user invites someone from the tenant `Users` tab:
   - keep the user on the `Users` tab
   - close the invite drawer on success
   - show success feedback
   - provide a clear way to navigate to the tenant's `Invitations` tab
4. Do **not** force an automatic redirect away from `Users` after a successful invite.

Recommended success UX:
- keep the existing success toast
- add a visible CTA such as `View invitations`
- clicking that CTA navigates to the tenant-details `Invitations` tab

## Design Constraints

- Follow the existing tenant-details route and tab patterns.
- Preserve the current tenant details subtitle pattern (`tenantName` via outlet context).
- Do not fake users in the tenant users table before invitation acceptance.
- Keep the implementation consistent with the newer table UX model already established on tenant users / tenants list.
- Follow repo guides and patterns from:
  - `AGENTS.md`
  - `docs/guides/frontend-coding-standards.md`
  - `docs/guides/frontend-architecture.md`
  - `docs/guides/project-conventions.md`
  - `docs/guides/frontend-error-handling.md`

## Expected Work

### 1. Tenant details navigation

Update the tenant-details layout/navigation to include a new `Invitations` tab alongside:
- `General`
- `Users`
- `Profiles`
- `Billing`

### 2. New tenant-details invitations page

Add a tenant-specific invitations page/route under the tenant-details route tree.

The new page should:
- be scoped to the current tenant
- show invitations relevant to that tenant only
- use the same page chrome conventions as the other tenant-details tabs
- show the current tenant name as subtitle like the other tabs

### 3. Invitations list behavior

Implement the invitations list/table for this tab using the app's current shared table patterns where appropriate.

At minimum, the page must make it possible to verify:
- a newly created invitation appears there after refresh or query invalidation
- invitation records are visible there before acceptance
- accepted invitations no longer need to be relied on in that tab for user discovery because the accepted person should now appear in the `Users` tab

### 4. Invite success flow from Users tab

Update the tenant invite flow so that successful invite behavior from the `Users` tab:
- closes the drawer
- shows success feedback
- offers a clear `View invitations` action
- navigates to the tenant-details `Invitations` tab when that action is used

Do not auto-redirect immediately on success.

## Checklist Alignment

This work should satisfy these checklist assertions in:
- `docs/misc/tenant-module-smoke-test-checklist.md`

Specifically:
- newly created invitation appears in tenant details `Invitations` tab
- invited person appears in tenant users only after invitation acceptance
- successful invite from `Users` provides a clear path to `Invitations` without forced redirect

## Implementation Guidance

- Reuse existing invitation APIs/hooks if they already support tenant-scoped invitation retrieval.
- If tenant-scoped invitation listing does not yet exist, add the minimal backend/frontend support needed.
- Prefer consistency with existing staff invitation list patterns over inventing a new bespoke invitation UI.
- Keep the new route and UI names precise:
  - tab label: `Invitations`
  - success CTA: likely `View invitations`
- Make all user-facing strings translated.

## Verification

Run the appropriate verification for the files you change, for example:
- frontend formatting/linting on touched files
- `make tsc-front`
- `react-doctor` because this is React UI work
- API/client regeneration only if the backend contract changes

## Deliverable

Implement the tenant-details `Invitations` tab and the invite-success navigation affordance, then update the smoke-test checklist only where the new behavior changes what should be manually verified.
