# Staff MVP Week 1 – Phase 6 Frontend (Invitations) — Commit d730a2b Review

Context
- Plan reference: docs/roadmaps/staff-mvp/week-1-revised-implementation-plan.md (Phase 6)
- Commit: d730a2b009b1819d251a189811c63162c678dc93 (Nov 5, 2025) — "Implement Phase 6: Frontend Implementation for Staff Invitations"

## Summary of Changes (per commit)
- Routes: apps/front/app/routes.ts — added accept-invitation and staff invitations routes using FRONT_PATH_NAMES.
- Pages added:
  - apps/front/app/routes/auth/accept-invitation/accept-invitation-page.tsx
  - apps/front/app/routes/authed/staff/invitations/staff-invitations-page.tsx
- Shared constants updated: packages/shared/lib/constants.ts (added FRONT_PATH_NAMES.auth.acceptInvitation and staff.invitations paths).
- i18n: packages/shared/lib/i18n/json/common.en.json — added invitation UI keys.

## Alignment With Week‑1 Plan (Phase 6)
- 6.1 Generate TS client: Not part of this commit, but repo already contains endpoints in packages/js-client for /invitations and /staff/invitations — OK.
- 6.2 Invitation Acceptance Page: Implemented at /auth/accept-invitation/:token with SSR loader/action; integrates Kiota client and sets session cookie; UI matches plan.
- 6.3 Staff Invitations Management: Implemented at /staff/invitations; create/revoke/list flows present; copy invitation link dialog present — matches plan intent.
- 6.4 Routes: routes.ts updated using FRONT_PATH_NAMES — OK.
- 6.5 Translations: Invitation-related keys added in common.en.json — OK (project uses flat, hyphenated keys; acceptable vs plan’s nested example).

## Detailed Findings (Strengths)
- Correct use of route constants (FRONT_PATH_NAMES) and central routes.ts wiring.
- Uses existing SSR patterns (loader + getServerAction + safeRun) consistent with this codebase.
- Accept page: server action sets HttpOnly cookie and redirects to staff dashboard; uses Kiota paths /invitations/{token}/details and /accept.
- Staff page: provides full UX (create → copy link → revoke; status badges; relative time) aligned with plan.
- i18n keys added comprehensively; consistent naming across pages.

## Issues / Deviations Requiring Attention
1) Profiles API mismatch (likely compile/runtime blocker)
- Code calls apiClient.staff.profiles.get() in staff-invitations-page.tsx, but OpenAPI (apps/api/openapi/MainApi.json) only exposes /staff/profiles/tenant/{tenantId}; the generated client lacks profiles.get(). Result: TypeScript errors or runtime failure fetching profiles for staff scope.
- Recommendation: Either:
  - Add a backend endpoint GET /staff/profiles (staff scope) and regenerate the client; or
  - If intended to reuse tenant-specific profiles, change the call to apiClient.staff.profiles.tenant.byTenantId(…) and clarify UX (but invites are for Staff scope, so a dedicated staff profiles list is preferable).

2) Session cookie lifetime inconsistency on accept-invitation
- Accept action sets cookie expiry to a fixed 7 days via dayjs.add(7,'days'). The API response model InvitationAccepted provides sessionExpiresAt/sessionExpiresInMs (see packages/js-client/src/models/index.ts) similar to the login flow.
- Recommendation: Align with login: set cookie expiry using sessionExpiresAt to keep browser cookie and server session in sync.

3) Cookie options differ vs login
- Accept page sets httpOnly/secure/sameSite; login page sets only expires/maxAge. This inconsistency can cause different behaviors in dev and production (secure: true prevents cookies over http in local dev).
- Recommendation: Consolidate cookie policy (same flags across login and invitation acceptance), ideally via a shared helper.

4) Deviation from plan’s client-side state pattern
- Plan recommends TanStack Query for server state. These pages use SSR loaders/actions instead. This is acceptable within this repo’s existing pattern, but note:
  - Ensure loader revalidation occurs after actions so the invitations list reflects create/revoke immediately.
  - If client-side caching/search/sorting is needed later, consider introducing react-query for the table.

5) Minor UX/robustness details
- Error messages are generic; consider surfacing ApiResponse messages for better operator feedback.
- Ensure copy-to-clipboard handles navigator.clipboard failures (permissions) with a fallback.

## Risk Assessment
- Impact: Medium. Core flows are implemented and aligned with plan, but the profiles API mismatch will break the staff page until a proper endpoint exists or the call is adjusted. Cookie lifetime inconsistency could cause confusing auth expirations.

## Suggested Next Steps
- Backend: Add GET /staff/profiles (list staff-scope profiles) and regenerate the client (make build-api && make generate-client). Update staff-invitations-page.tsx to consume that endpoint.
- Accept page: Use result.data.sessionExpiresAt for cookie expiry; align cookie flags with login (or unify both via helper).
- Verify revalidation: Confirm React Router action→loader revalidation updates the invitations list without a manual refresh.
- Run checks: make tsc-front to catch the profiles.get() type error, then address per above.

## Verdict
- Overall: Good progress; implements the visible UI and routes for Phase 6 largely per plan. Address the profiles endpoint gap and cookie handling to reach production-ready quality.
