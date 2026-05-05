# PublyApp Page Generation Plan

This document outlines the remaining pages to be implemented in `./apps/front`, recycled from the original UI strategy.

> **Reference Template:** For design inspiration, refer to `C:\Users\radan\Documents\_RADAN\Dev\PublyApp\work-redesign\minimal-v7.0.0`.

---

## Screen Inventory

### Customer Side

#### Core App Features
- [x] **Dashboard** (`/client/:tenantId`) - Tenant home page with stats and activity
- [x] **Schedule** (`/client/:tenantId/schedule`) - Calendar view with scheduled posts
- [x] **Posts** (`/client/:tenantId/posts`) - Posts list view
- [x] **Post Create/Edit** (`/client/:tenantId/posts/new|:id/edit`) - Create or edit a post
- [x] **Drafts** (`/client/:tenantId/drafts`) - Saved draft posts before scheduling
- [x] **Social Accounts** (`/client/:tenantId/accounts/social`) - Connect & manage social media channels
- [x] **Media Library** (`/client/:tenantId/media`) - Upload and manage images/videos for posts
- [x] **Analytics** (`/client/:tenantId/analytics`) - Post performance, engagement stats, reports

#### Tenant Settings (for tenant admins)
- [x] **Tenant General Settings** (`/client/:tenantId/settings/general`) - Organization name, logo, etc.
- [x] **Tenant Members** (`/client/:tenantId/settings/members`) - Invite, remove, manage member roles
- [x] **Tenant Invitations** (`/client/:tenantId/settings/invitations`) - Invite new members to the tenant
- [x] **Tenant Profiles/Roles** (`/client/:tenantId/settings/profiles`) - Manage tenant-level roles
- [x] **Tenant Billing** (`/client/:tenantId/settings/billing`) - Subscription, payment methods, invoices

#### User Settings (for individual users)
- [x] **User Profile** (`/settings/profile`) - Name, avatar, email
- [x] **User Security** (`/settings/security`) - Password, 2FA
- [x] **User Notifications** (`/settings/notifications`) - Notification preferences

#### Error Pages
- [x] **404 Not Found** - Page not found with gradient number and animation
- [x] **400 Bad Request** - Bad request error page with i18n
- [x] **401 Unauthorized** - Authentication required with login button
- [x] **403 Forbidden** - Access denied with forbidden icon
- [x] **500 Server Error** - Internal server error with reload button
- [x] **Generic Error** - Fallback error page with error details display

#### Auth Pages
- [x] **Login** (`/auth/login`) - User login
- [x] **Sign Up** (`/auth/signup`) - New user registration
- [x] **Reset Password** (`/auth/reset-password`) - Password reset flow
- [x] **Verify Email** (`/auth/verify-email`) - Email verification
- [x] **Accept Invitation** (`/auth/accept-invitation`) - Accept tenant/staff invitation

#### Other
- [x] **Onboarding Flow** (`/onboarding`) - Multi-step wizard with stepper
- [x] **Maintenance Mode** (`/maintenance`) - Standalone page with animations

#### TBD
<!-- Add more pages here as requirements become clearer -->

### Staff Side

- [x] **Dashboard** (`/staff`) - Overview with stats widgets
- [x] **Tenants List** (`/staff/tenants`) - Table of all customer tenants
- [x] **New Tenant** (`/staff/tenants/new`) - Create tenant form
- [x] **Tenant Details - General** (`/staff/tenants/:id/general`) - Edit tenant general info
- [x] **Tenant Details - Billing** (`/staff/tenants/:id/billing`) - Tenant billing *(uses mock data)*
- [x] **Tenant Details - Users** (`/staff/tenants/:id/users`) - Tenant users table
- [x] **Tenant Details - Profiles** (`/staff/tenants/:id/profiles`) - Tenant profiles table
- [x] **Staff Members List** (`/staff/members`) - Table of staff users
- [x] **New Staff Member** (`/staff/members/new`) - Create staff account
- [x] **Staff Member Details** (`/staff/members/:id`) - Edit staff member
- [x] **Profiles List** (`/staff/profiles`) - Table of staff roles
- [x] **New Profile** (`/staff/profiles/new`) - Create new role
- [x] **Profile Details - Basics** (`/staff/profiles/:id/basics`) - Edit role basics & permissions
- [x] **Profile Details - Users** (`/staff/profiles/:id/users`) - Users with this role (table with empty state)
- [x] **Invitations List** (`/staff/invitations`) - Pending/sent invitations
- [x] **New Invitation** (`/staff/invitations/new`) - Invite new staff member
- [x] **Invitation Details** (`/staff/invitations/:id`) - View invitation details
- [x] **Audit Logs** (`/staff/audit-logs`) - Activity logs (empty state, ready for API)
- [x] **Settings** (`/staff/settings`) - Platform-wide settings (placeholder tabs)

---

## Build Order

### Completed: Reusable Components

- [x] Data table component (for staff lists)
- [x] Form components with React Hook Form (Field namespace)
- [x] Empty states
- [x] Loading skeletons

---

## Generation Queue (30 pages)

### Phase 1: Complete Staff Side (6 pages) ✅ COMPLETED

Complete the remaining staff section pages:

1. [x] **Staff Dashboard** (`/staff`) - Stats overview with 4 widget cards
2. [x] **Tenant Details - Billing** (`/staff/tenants/:id/billing`) - Billing tab with mock data
3. [x] **Profile Details - Users** (`/staff/profiles/:id/users`) - Users table with empty state
4. [x] **Invitation Details** (`/staff/invitations/:id`) - Details view with info cards
5. [x] **Staff Settings** (`/staff/settings`) - Tabs layout with placeholder sections
6. [x] **Audit Logs** (`/staff/audit-logs`) - Table with filters (empty state)

### Phase 2: User Settings (3 pages) ✅ COMPLETED

Personal settings for individual users:

7. [x] **User Profile** (`/settings/profile`) - Avatar upload, name, email, phone
8. [x] **User Security** (`/settings/security`) - Change password form, 2FA placeholder
9. [x] **User Notifications** (`/settings/notifications`) - Email/push/activity toggles

### Phase 3: Tenant Settings (5 pages) ✅ COMPLETED

Settings for tenant administrators:

10. [x] **Tenant General Settings** (`/client/:tenantId/settings/general`) - Org name, logo, slug, description
11. [x] **Tenant Members** (`/client/:tenantId/settings/members`) - Members table with roles/status
12. [x] **Tenant Invitations** (`/client/:tenantId/settings/invitations`) - Invitations table with actions
13. [x] **Tenant Profiles/Roles** (`/client/:tenantId/settings/profiles`) - Profiles table with user counts
14. [x] **Tenant Billing** (`/client/:tenantId/settings/billing`) - Plans, payment methods, invoice history

### Phase 4: Core App Features (8 pages) ✅ COMPLETED

Main application functionality:

15. [x] **Customer Dashboard** (`/client/:tenantId`) - Welcome, stats cards, recent activity, quick actions
16. [x] **Posts List** (`/client/:tenantId/posts`) - Status tabs, search, empty state with CTA
17. [x] **Drafts** (`/client/:tenantId/drafts`) - Card grid with sort options, empty state
18. [x] **Post Create/Edit** (`/client/:tenantId/posts/new|:id/edit`) - Two-column editor with platform selection
19. [x] **Schedule/Calendar** (`/client/:tenantId/schedule`) - Month grid calendar with post indicators
20. [x] **Social Accounts** (`/client/:tenantId/accounts/social`) - Platform cards with connect/disconnect
21. [x] **Media Library** (`/client/:tenantId/media`) - Grid with filters, upload, empty state
22. [x] **Analytics** (`/client/:tenantId/analytics`) - Stats cards, chart placeholders, top posts table

### Phase 5: Error Pages (6 pages) ✅ COMPLETED

Custom error pages with animations and icons:

23. [x] **404 Not Found** - Gradient "404" number, bounce animation, i18n
24. [x] **400 Bad Request** - Gradient "400" number, warning styling, i18n
25. [x] **401 Unauthorized** - Lock icon, login button, i18n (NEW)
26. [x] **403 Forbidden** - Forbidden icon, error styling, i18n
27. [x] **500 Server Error** - Warning icon, reload button, i18n
28. [x] **Generic Error** - Danger icon, try again/go home buttons, error details (NEW)

### Phase 6: Other (2 pages) ✅ COMPLETED

29. [x] **Onboarding Flow** (`/onboarding`) - 4-step wizard: Welcome, Create Org, Connect Socials, Complete
30. [x] **Maintenance Mode** (`/maintenance`) - Rotating gear animation, status/contact links, i18n

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
