# old-front routes

Generated from `apps/old-front/src/routes.ts` and `apps/old-front/src/routes/_tree/**/*.ts` (not hand-typed). Counts verified against file discovery.

- Route targets declared in tree files: **77** (unique `routes/*.tsx` strings found in _tree + routes.ts)
- Route TSX files under `apps/old-front/src/routes`: **182** (includes _parts, _layout, _components not all routed)
- Layout wrappers not counted as navigable routes: marketing-layout, auth-layout, authed-layout, staff-layout, page-layout, tenant-layout, tenant-user-details-layout, staff-profile-details-layout, tenant-details-layout, account-layout, settings-layout
- Source tag for full source: `old-front-final` (at merge commit parent)

| # | Path | File | Loader / API calls | i18n namespaces / keys (sample) |
|---|---|---|---|---|
| 1 | `/` | `routes/marketing/home/home-page.tsx` | none / — | — |
| 2 | `/pricing` | `routes/marketing/pricing/pricing-page.tsx` | none / — | — |
| 3 | `/terms` | `routes/marketing/terms/terms-page.tsx` | none / — | — |
| 4 | `/privacy` | `routes/marketing/privacy/privacy-page.tsx` | none / — | — |
| 5 | `/cookies` | `routes/marketing/cookies/cookies-page.tsx` | none / — | — |
| 6 | `/about (flag marketing.about)` | `routes/marketing/about/about-page.tsx` | none / — | — |
| 7 | `/contact (flag marketing.contact)` | `routes/marketing/contact/contact-page.tsx` | none / — | — |
| 8 | `/security (flag marketing.security)` | `routes/marketing/security/security-page.tsx` | none / — | — |
| 9 | `/blog (flag marketing.blog)` | `routes/marketing/blog/blog-index-page.tsx` | meta / useQuery, useQueryState( useQuery, useQueryState( | — |
| 10 | `/blog/:slug (flag marketing.blog)` | `routes/marketing/blog/blog-article-route.tsx` | meta / useQuery, useQueryState( | — |
| 11 | `/changelog (redirect, flag marketing.changelog)` | `routes/marketing/changelog/changelog-redirect-route.tsx` | loader, meta / — | — |
| 12 | `/changelog/:year (flag marketing.changelog)` | `routes/marketing/changelog/changelog-page.tsx` | meta / — | — |
| 13 | `/* catch-all marketing 404` | `routes/marketing/_errors/marketing-not-found-page.tsx` | none / — | — |
| 14 | `/login` | `routes/auth/login/login-page.tsx` | loader, meta / client-ts | login, session-expired, password-reset-success |
| 15 | `/sign-up` | `routes/auth/signup/sign-up-page.tsx` | clientLoader / — | — |
| 16 | `/verify-email` | `routes/auth/verify-email/verify-email-page.tsx` | loader / client-ts | verify-email, verify-email-description-1, verify-email-description-2, verify-ema… |
| 17 | `/reset-password` | `routes/auth/reset-password/reset-password-page.tsx` | loader / client-ts | email-verification-success, reset-password, password, n+ characters, confirm-pas… |
| 18 | `/accept-invitation` | `routes/auth/accept-invitation/accept-invitation-page.tsx` | loader, meta / client-ts | accept-invitation, auth-invitation-invalid, auth-invitation-invalid-description,… |
| 19 | `/auth/clear-session (POST only, action)` | `routes/auth/clear-session.tsx` | none / — | — |
| 20 | `/staff` | `routes/authed/staff/dashboard/staff-home-page.tsx` | none / — | welcome-back |
| 21 | `/staff/tenants` | `routes/authed/staff/tenants/list/tenants-list-page.tsx` | loader, meta / — | list-of-items, tenants, list, new-item, tenant |
| 22 | `/staff/tenants/new` | `routes/authed/staff/tenants/new/new-tenant-page.tsx` | loader, clientLoader, meta / — | new-item, tenant, tenants, new, create-the-tenant |
| 23 | `/staff/tenants/details/:tenantId` | `routes/authed/staff/tenants/details/general/tenant-details-general-page.tsx` | none / useQuery, useGetTenant, useGetTenant(, useQueryClient( useQuery, useGetTenant, useGetTenant( | tenant-details, tenants, details, uploads-not-supported-yet, max-size, users-cou… |
| 24 | `/staff/tenants/details/:tenantId/users` | `routes/authed/staff/tenants/details/users/tenant-details-users-page.tsx` | none / — | tenant-details, tenants, details, invite-user |
| 25 | `/staff/tenants/details/:tenantId/invitations` | `routes/authed/staff/tenants/details/invitations/tenant-details-invitations-page.tsx` | none / — | tenant-details, tenants, details, invite-user |
| 26 | `/staff/tenants/details/:tenantId/activity (flag staff.tenants.details.activity OFF)` | `routes/authed/staff/tenants/details/activity/tenant-details-activity-page.tsx` | none / — | — |
| 27 | `/staff/tenants/details/:tenantId/usage (flag OFF)` | `routes/authed/staff/tenants/details/usage/tenant-details-usage-page.tsx` | none / — | — |
| 28 | `/staff/tenants/details/:tenantId/billing (flag OFF)` | `routes/authed/staff/tenants/details/billing/tenant-details-billing-page.tsx` | none / — | tenant-details, tenants, details, billing-coming-soon |
| 29 | `/staff/tenants/details/:tenantId/profiles` | `routes/authed/staff/tenants/details/profiles/tenant-details-profiles-page.tsx` | none / — | tenant-details, tenants, details |
| 30 | `/staff/tenant-users/details/:userId/general` | `routes/authed/staff/tenant-users/details/general/tenant-user-details-general-page.tsx` | none / — | — |
| 31 | `/staff/tenant-users/details/:userId/organizations` | `routes/authed/staff/tenant-users/details/organizations/tenant-user-details-organizations-page.tsx` | none / — | link-to-company |
| 32 | `/staff/staff-users` | `routes/authed/staff/staff-users/list/staff-users-list-page.tsx` | loader, meta / — | users, staff, invite-users |
| 33 | `/staff/staff-users/details/:userId` | `routes/authed/staff/staff-users/details/staff-user-details-page.tsx` | loader, clientLoader, meta / useGetStaffUserById, useGetStaffUserById( useGetStaffUserById, useGetStaffUserById( | edit-item, staff-user, un-named, staff-users, details, staff-user-not-found-titl… |
| 34 | `/staff/invitations` | `routes/authed/staff/invitations/list/staff-invitations-list-page.tsx` | loader, meta / — | staff-invitations, list |
| 35 | `/staff/invitations/new` | `routes/authed/staff/invitations/new/new-staff-invitations-page.tsx` | loader, meta / — | invite-users, staff-invitations |
| 36 | `/staff/invitations/details/:invitationId` | `routes/authed/staff/invitations/details/staff-invitation-details-page.tsx` | loader, meta / useQuery, useGetStaffInvitation, useGetStaffInvitation(, useQueryClient( useQuery, useGetStaffInvitation, useGetStaffInvitation( | invitation-details, staff-invitations, details, no-items-found, invitation, invi… |
| 37 | `/staff/profiles` | `routes/authed/staff/profiles/list/staff-profiles-list-page.tsx` | loader, meta / — | staff-profiles, list, new-item, profile |
| 38 | `/staff/profiles/new` | `routes/authed/staff/profiles/new/new-staff-profile-page.tsx` | loader, meta / — | new-item, staff-profile, staff-profiles |
| 39 | `/staff/profiles/details/:profileId (basics)` | `routes/authed/staff/profiles/details/basics/staff-profile-details-basics-tab-page.tsx` | none / — | basic-infos, permissions, profiles, basics-and-permissions |
| 40 | `/staff/profiles/details/:profileId/users` | `routes/authed/staff/profiles/details/users/staff-profile-details-users-tab-page.tsx` | none / — | profiles, users |
| 41 | `/staff/audit-logs` | `routes/authed/staff/audit-logs/list/staff-audit-logs-list-page.tsx` | loader, meta / — | audit-logs, list |
| 42 | `/staff/audit-logs/details/:logId` | `routes/authed/staff/audit-logs/details/staff-audit-log-details-page.tsx` | loader, meta / useGetStaffAuditLog, useGetStaffAuditLog( useGetStaffAuditLog, useGetStaffAuditLog( | audit-log-details, bad-request, log-id-required, audit-logs, details, audit-log-… |
| 43 | `/app (tenant picker portal)` | `routes/authed/tenant/_portal/tenant-portal-page.tsx` | none / useGetRedirectCode, useGetUserAuthData, useGetUserAuthData(, useGetRedirectCode( useGetRedirectCode, useGetUserAuthData, useGetUserAuthData( | — |
| 44 | `/app/organizations` | `routes/authed/tenant/organizations/organizations-page.tsx` | none / — | — |
| 45 | `/app/:tenantId (calendar, default)` | `routes/authed/tenant/posts/posts-calendar-page.tsx` | loader, meta / — | calendar |
| 46 | `/app/:tenantId/posts (queue)` | `routes/authed/tenant/posts/posts-queue-page.tsx` | loader, meta / — | queue |
| 47 | `/app/:tenantId/posts/drafts` | `routes/authed/tenant/posts/posts-drafts-page.tsx` | loader, meta / — | drafts |
| 48 | `/app/:tenantId/posts/history` | `routes/authed/tenant/posts/posts-history-page.tsx` | loader, meta / — | history |
| 49 | `/app/:tenantId/settings (general)` | `routes/authed/tenant/settings/general/settings-general-page.tsx` | none / — | organization-settings, general, organization-details, logo, logo-description, ch… |
| 50 | `/app/:tenantId/settings/members (flag tenant.settings.members OFF)` | `routes/authed/tenant/settings/members/settings-members-page.tsx` | none / — | organization-settings, members, team-members, invite-member, role, status |
| 51 | `/app/:tenantId/settings/roles (flag OFF)` | `routes/authed/tenant/settings/roles/settings-roles-page.tsx` | none / — | organization-settings, roles-and-permissions, roles, description, members, actio… |
| 52 | `/app/:tenantId/settings/workspaces (flag OFF)` | `routes/authed/tenant/settings/workspaces/settings-workspaces-page.tsx` | none / — | organization-settings, workspaces, all-workspaces, default-workspace |
| 53 | `/app/:tenantId/settings/integrations (flag OFF)` | `routes/authed/tenant/settings/integrations/settings-integrations-page.tsx` | none / — | organization-settings, integrations, connected, disconnect, available-integratio… |
| 54 | `/app/:tenantId/settings/billing (flag OFF)` | `routes/authed/tenant/settings/billing/settings-billing-page.tsx` | none / — | organization-settings, billing, current-plan, payment-method, billing-history, u… |
| 55 | `/app/:tenantId/settings/security (flag OFF)` | `routes/authed/tenant/settings/security/settings-security-page.tsx` | none / — | organization-settings, security, authentication, two-factor-authentication, save… |
| 56 | `/app/:tenantId/account (profile)` | `routes/authed/tenant/account/profile/account-profile-page.tsx` | none / — | account-settings, profile, personal-information, firstname, lastname, email |
| 57 | `/app/:tenantId/account/security` | `routes/authed/tenant/account/security/account-security-page.tsx` | none / — | account-settings, security, change-password, current-password, new-password, con… |
| 58 | `/app/:tenantId/account/notifications` | `routes/authed/tenant/account/notifications/account-notifications-page.tsx` | none / — | account-settings, notifications, email-notifications, manage-your-email-notifica… |

## Layouts and error routes (not in table count)

- Marketing layout: `routes/marketing/_layout/marketing-layout.tsx`
- Auth layout: `routes/auth/_layout/auth-layout.tsx`
- Authed layout: `routes/authed/_layout/authed-layout.tsx` (session + tenant hint gate)
- Staff layouts: `routes/authed/staff/_layout/staff-layout.tsx`, `page-layout.tsx`
- Tenant layout: `routes/authed/tenant/_layout/tenant-layout.tsx` (access gate)
- Detail layouts: tenant-user-details-layout, staff-profile-details-layout, tenant-details-layout, account-layout, settings-layout
- Redirects: `tenant-user-details-index-redirect-page.tsx` (index -> general), `changelog-redirect-route.tsx`
- Fallbacks: staff-not-found, tenant-not-found, marketing-not-found, tenant-user-details-fallback-tab, staff-profile-details-fallback, settings-fallback, account-fallback, tenant-details-fallback
- Action-only: `routes/auth/clear-session.tsx` (POST + Origin/Fetch-metadata validation)

## Generation notes

- Generated by `/tmp/build-archive.mjs` reading tree files and scanning each route file for loader/clientLoader/meta, TanStack Query hooks, @org/client-ts imports, and t('…') keys.
- Route path source: `packages/shared-ts/lib/constants.ts` (FRONT_PATH_NAMES + makePath) + route tree getLastPath wiring. Flag-guarded routes annotated.
