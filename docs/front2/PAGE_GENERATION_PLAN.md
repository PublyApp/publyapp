# PublyApp Page Generation Plan

This document outlines the remaining pages to be implemented in `./apps/front`, recycled from the original UI strategy.

---

## Screen Inventory

### Customer Side

#### Core App Features
- [ ] **Dashboard** (`/`) - Tenant home page *(empty placeholder)*
- [ ] **Schedule** (`/schedule`) - Calendar view with scheduled posts
- [ ] **Posts** (`/posts`) - Posts list view
- [ ] **Post Create/Edit** - Create or edit a post (modal or page?)

#### Tenant Settings (for tenant admins)
- [ ] **Tenant General Settings** (`/settings/tenant`) - Organization name, logo, etc.
- [ ] **Tenant Members** (`/settings/tenant/members`) - Invite, remove, manage member roles
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
- [ ] **Settings** (`/staff/settings`) - Platform-wide settings

---

## Build Order

### Phase 1: Reusable Components

Before building screens, ensure these shared components are ready:

- [x] Data table component (for staff lists)
- [x] Form components with React Hook Form (Field namespace)
- [x] Empty states
- [x] Loading skeletons

### Phase 2: Staff Screens

- [ ] Staff dashboard *(empty)*
- [x] Tenants CRUD *(billing tab uses mock data)*
- [x] Staff members CRUD
- [x] Profiles CRUD *(users tab is empty)*
- [x] Invitations CRUD *(details page is empty)*
- [ ] Settings

### Phase 3: Customer Screens - Core App

- [ ] Tenant dashboard
- [ ] Calendar view
- [ ] Post card component
- [ ] Post create/edit (modal or page)
- [ ] Schedule page
- [ ] Posts list page

### Phase 4: Customer Screens - Tenant Settings

- [ ] Tenant general settings
- [ ] Tenant members management
- [ ] Tenant profiles/roles management
- [ ] Tenant billing

### Phase 5: Customer Screens - User Settings

- [ ] User profile settings
- [ ] User security settings
- [ ] User notification preferences

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
