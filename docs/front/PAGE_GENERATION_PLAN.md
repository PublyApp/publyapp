# PublyApp Page Generation Plan

This document outlines the remaining pages to be implemented in `./apps/front`, recycled from the original UI strategy.

> **Reference Template:** For design inspiration, refer to `C:\Users\radan\Documents\_RADAN\Dev\PublyApp\work-redesign\minimal-v7.0.0`.

---

## Screen Inventory

### Customer Side

#### Core App Features
- [ ] **Dashboard** (`/`) - Tenant home page *(empty placeholder)*
- [ ] **Schedule** (`/schedule`) - Calendar view with scheduled posts
- [ ] **Posts** (`/posts`) - Posts list view
- [ ] **Post Create/Edit** - Create or edit a post (modal or page?)
- [ ] **Drafts** (`/drafts`) - Saved draft posts before scheduling
- [ ] **Social Accounts** (`/accounts`) - Connect & manage social media channels (Facebook, Twitter, Instagram, LinkedIn, etc.)
- [ ] **Media Library** (`/media`) - Upload and manage images/videos for posts
- [ ] **Analytics** (`/analytics`) - Post performance, engagement stats, reports

#### Tenant Settings (for tenant admins)
- [ ] **Tenant General Settings** (`/settings/tenant`) - Organization name, logo, etc.
- [ ] **Tenant Members** (`/settings/tenant/members`) - Invite, remove, manage member roles
- [ ] **Tenant Invitations** (`/settings/tenant/invitations`) - Invite new members to the tenant
- [ ] **Tenant Profiles/Roles** (`/settings/tenant/profiles`) - Manage tenant-level roles
- [ ] **Tenant Billing** (`/settings/tenant/billing`) - Subscription, payment methods, invoices

#### User Settings (for individual users)
- [ ] **User Profile** (`/settings/profile`) - Name, avatar, email
- [ ] **User Security** (`/settings/security`) - Password, 2FA
- [ ] **User Notifications** (`/settings/notifications`) - Notification preferences

#### Error Pages
- [ ] **404 Not Found** - Page not found with custom illustration
- [ ] **400 Bad Request** - Bad request error page
- [ ] **401 Unauthorized** - Authentication required page
- [ ] **403 Forbidden** - Access denied page
- [ ] **500 Server Error** - Internal server error page
- [ ] **Generic Error** - Fallback error page

#### Auth Pages
- [x] **Login** (`/auth/login`) - User login
- [x] **Sign Up** (`/auth/signup`) - New user registration
- [x] **Reset Password** (`/auth/reset-password`) - Password reset flow
- [x] **Verify Email** (`/auth/verify-email`) - Email verification
- [x] **Accept Invitation** (`/auth/accept-invitation`) - Accept tenant/staff invitation

#### Other
- [ ] **Onboarding Flow** - First-time user/tenant setup wizard
- [ ] **Maintenance Mode** - Page shown when app is under maintenance

#### TBD
<!-- Add more pages here as requirements become clearer -->

### Staff Side

- [ ] **Dashboard** (`/staff`) - Overview, quick stats *(empty - shows EmptyContent)*
- [x] **Tenants List** (`/staff/tenants`) - Table of all customer tenants
- [x] **New Tenant** (`/staff/tenants/new`) - Create tenant form
- [x] **Tenant Details - General** (`/staff/tenants/:id/general`) - Edit tenant general info
- [ ] **Tenant Details - Billing** (`/staff/tenants/:id/billing`) - Tenant billing *(uses mock data)*
- [x] **Tenant Details - Users** (`/staff/tenants/:id/users`) - Tenant users table
- [x] **Tenant Details - Profiles** (`/staff/tenants/:id/profiles`) - Tenant profiles table
- [x] **Staff Members List** (`/staff/members`) - Table of staff users
- [x] **New Staff Member** (`/staff/members/new`) - Create staff account
- [x] **Staff Member Details** (`/staff/members/:id`) - Edit staff member
- [x] **Profiles List** (`/staff/profiles`) - Table of staff roles
- [x] **New Profile** (`/staff/profiles/new`) - Create new role
- [x] **Profile Details - Basics** (`/staff/profiles/:id/basics`) - Edit role basics & permissions
- [ ] **Profile Details - Users** (`/staff/profiles/:id/users`) - Users with this role *(empty placeholder)*
- [x] **Invitations List** (`/staff/invitations`) - Pending/sent invitations
- [x] **New Invitation** (`/staff/invitations/new`) - Invite new staff member
- [ ] **Invitation Details** (`/staff/invitations/:id`) - View invitation details *(empty placeholder)*
- [ ] **Audit Logs** (`/staff/audit-logs`) - Activity logs (who did what, when)
- [ ] **Settings** (`/staff/settings`) - Platform-wide settings

---

## Build Order

### Completed: Reusable Components

- [x] Data table component (for staff lists)
- [x] Form components with React Hook Form (Field namespace)
- [x] Empty states
- [x] Loading skeletons

---

## Generation Queue (30 pages)

### Phase 1: Complete Staff Side (6 pages)

Complete the remaining staff section pages:

1. [ ] **Staff Dashboard** (`/staff`) - Empty placeholder with stats overview
2. [ ] **Tenant Details - Billing** (`/staff/tenants/:id/billing`) - Billing tab with mock data
3. [ ] **Profile Details - Users** (`/staff/profiles/:id/users`) - Users assigned to this role
4. [ ] **Invitation Details** (`/staff/invitations/:id`) - View invitation details
5. [ ] **Staff Settings** (`/staff/settings`) - Platform-wide settings
6. [ ] **Audit Logs** (`/staff/audit-logs`) - Activity logs (who did what, when)

### Phase 2: User Settings (3 pages)

Personal settings for individual users:

7. [ ] **User Profile** (`/settings/profile`) - Name, avatar, email
8. [ ] **User Security** (`/settings/security`) - Password, 2FA
9. [ ] **User Notifications** (`/settings/notifications`) - Notification preferences

### Phase 3: Tenant Settings (5 pages)

Settings for tenant administrators:

10. [ ] **Tenant General Settings** (`/settings/tenant`) - Organization name, logo, etc.
11. [ ] **Tenant Members** (`/settings/tenant/members`) - Invite, remove, manage member roles
12. [ ] **Tenant Invitations** (`/settings/tenant/invitations`) - Invite new members to the tenant
13. [ ] **Tenant Profiles/Roles** (`/settings/tenant/profiles`) - Manage tenant-level roles
14. [ ] **Tenant Billing** (`/settings/tenant/billing`) - Subscription, payment methods, invoices

### Phase 4: Core App Features (8 pages)

Main application functionality:

15. [ ] **Customer Dashboard** (`/`) - Tenant home page with overview
16. [ ] **Posts List** (`/posts`) - Posts list view
17. [ ] **Drafts** (`/drafts`) - Saved draft posts before scheduling
18. [ ] **Post Create/Edit** - Create or edit a post (modal or page - TBD)
19. [ ] **Schedule/Calendar** (`/schedule`) - Calendar view with scheduled posts
20. [ ] **Social Accounts** (`/accounts`) - Connect & manage social media channels
21. [ ] **Media Library** (`/media`) - Upload and manage images/videos for posts
22. [ ] **Analytics** (`/analytics`) - Post performance, engagement stats, reports

### Phase 5: Error Pages (6 pages)

Custom error pages with illustrations:

23. [ ] **404 Not Found** - Page not found
24. [ ] **400 Bad Request** - Bad request error
25. [ ] **401 Unauthorized** - Authentication required
26. [ ] **403 Forbidden** - Access denied
27. [ ] **500 Server Error** - Internal server error
28. [ ] **Generic Error** - Fallback error page

### Phase 6: Other (2 pages)

29. [ ] **Onboarding Flow** - First-time user/tenant setup wizard
30. [ ] **Maintenance Mode** - Page shown when app is under maintenance

---

## Design Assets

### Illustrations
- [ ] **Replace Minimal template illustrations** - Current illustrations are from the Minimal template and need to be replaced with custom PublyApp illustrations
- [ ] **Error page illustrations** - Custom illustrations for 400, 401, 403, 404, 500 error pages
- [ ] **Empty state illustrations** - Custom illustrations for empty states (no data, no results, etc.)
- [ ] **Onboarding/Welcome illustrations** - If needed for onboarding flows

---

## Implementation Notes

- Since the theme is already set up, pages should use MUI components directly without custom styling
- Follow the existing patterns established in the redesigned `./apps/front`
- For CRUD pages, follow consistent patterns: list view with data table, create/edit forms, detail views with tabs where applicable
