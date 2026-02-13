# Tenant Suspension UX Flow

This document describes the complete user experience when a tenant is suspended, covering every entry point, backend decision, and frontend rendering path.

---

## Table of Contents

- [Overview](#overview)
- [Key Principles](#key-principles)
- [Backend: Suspension Detection](#backend-suspension-detection)
- [Backend: Redirect Decision (`GetRedirectCode`)](#backend-redirect-decision-getredirectcode)
- [Frontend: Flow Entry Points](#frontend-flow-entry-points)
  - [Flow A: Login](#flow-a-login)
  - [Flow B: Tenant Portal (`/app`)](#flow-b-tenant-portal-app)
  - [Flow C: Direct URL to Suspended Tenant](#flow-c-direct-url-to-suspended-tenant)
  - [Flow D: Mid-Session Suspension](#flow-d-mid-session-suspension)
- [Frontend: Notification System](#frontend-notification-system)
  - [Warning Toast (Auto-Redirect Path)](#warning-toast-auto-redirect-path)
  - [Dedicated Suspended Page (Direct Access Path)](#dedicated-suspended-page-direct-access-path)
  - [Tenant Picker Banner (Picker Path)](#tenant-picker-banner-picker-path)
- [Scenario Matrix](#scenario-matrix)
- [Organizations Page (`/app/organizations`)](#organizations-page-apporganizations)
- [Key Files Reference](#key-files-reference)
- [Translation Keys](#translation-keys)

---

## Overview

When a staff member suspends a tenant, the users who are members of that tenant need to be informed clearly. The system handles this through multiple mechanisms depending on how the user encounters the suspension:

1. **Auto-redirect + toast**: User logs in or returns via saved hint, gets redirected to their active tenant, and sees a warning toast about the suspended org.
2. **Dedicated page**: User directly navigates to a suspended tenant's URL, sees a full-page "Organization Suspended" view.
3. **Tenant picker**: User has multiple active tenants or no valid hint, sees the picker with suspended tenants grayed out and labeled.

---

## Key Principles

- **Never silently hide suspensions.** Users must always learn about suspended orgs through at least one of the notification mechanisms.
- **Preserve the auto-redirect UX.** Having a suspended org should not degrade the login experience for the user's active tenants. The last-used-tenant hint continues to work.
- **Membership-first security.** Only members see "tenant suspended" messages. Non-members get a generic 403 to prevent tenant ID probing.

---

## Backend: Suspension Detection

Two backend components enforce suspension at the API level:

### TenantAuthFilter

`apps/api/Src/Lib/Filters/TenantAuthFilter.cs`

This middleware filter runs on every tenant-scoped API request. It checks tenant status after confirming the user is a legitimate member:

1. Validates session and extracts user ID
2. Confirms user is a member of the requested tenant
3. **If the tenant is suspended**: returns `403 Forbidden` with `ResponseKeys.TenantSuspended` (`"tenant-suspended"` translation key)
4. Non-members get a generic `403 Forbidden` (no suspension detail leaked)

### GetTenantAuthData

`apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs`

This endpoint loads auth context for a specific tenant. It performs the same suspension check and returns `403` with `"tenant-suspended"` if the tenant is suspended. This is the endpoint called by `useGetTenantAuthData` in the authed layout's `AuthQueriesLoader`.

---

## Backend: Redirect Decision (`GetRedirectCode`)

`apps/api/Src/Modules/Auth/Handlers/GetRedirectCode.cs`

This handler determines where a user should land after login or when visiting `/app`. It returns two fields:

```csharp
public class GetRedirectCodeResult {
    public string RedirectCode { get; set; } = string.Empty;
    public bool HasSuspendedTenants { get; set; }
}
```

### Decision Logic

The handler loads the user's tenant list once via `AccountService.GetUserTenantsForPickerAsync()`, then follows this decision tree:

```
Is the user a staff member?
|
|-- YES -> RedirectCode = "staff"
|
`-- NO  -> Is there a valid tenant hint?
           |
           |-- YES (hint tenant is active, user is member)
           |   -> RedirectCode = <hintTenantId>
           |   -> HasSuspendedTenants = (from tenant data)
           |
           `-- NO (no hint, or hint is stale/invalid)
               |
               |-- Zero tenants total -> RedirectCode = "unauthorized"
               |
               |-- Exactly 1 active tenant
               |   -> RedirectCode = <activeTenantId>
               |   -> HasSuspendedTenants = (from tenant data)
               |
               `-- Multiple active tenants OR all suspended
                   -> RedirectCode = "tenant-picker"
                   -> HasSuspendedTenants = (from tenant data)
```

**Key behavior**: The hint path and single-active-tenant path always auto-redirect, regardless of whether suspended tenants exist. The `HasSuspendedTenants` flag tells the frontend to show a toast notification after landing.

### AccountService Methods

`apps/api/Src/Modules/Users/Services/AccountService.cs`

- **`IsUserMemberOfActiveTenantAsync(userId, tenantId)`**: Checks that the user has a non-deleted, non-suspended account for the given tenant, AND that the tenant itself is active and not suspended.
- **`GetUserTenantsForPickerAsync(userId)`**: Returns all tenants the user is a member of (excluding deleted), with counts:
  - `TotalCount`: All non-deleted tenants (including suspended)
  - `ActiveCount`: Only active, non-suspended tenants
  - `HasSuspendedTenants`: Computed as `TotalCount > ActiveCount`

---

## Frontend: Flow Entry Points

### Flow A: Login

**File**: `apps/front/src/routes/auth/login/login-page.tsx` (server action)

After successful password login:

1. Server action calls `auth/redirectCode` API with the user's tenant hint
2. Reads `redirectCode` and `hasSuspendedTenants` from the response
3. Determines the redirect path based on `redirectCode`:
   - `"staff"` -> `/staff`
   - `"unauthorized"` -> `/unauthorized`
   - `"tenant-picker"` -> `/app`
   - Tenant ID -> `/app/{tenantId}`
4. **If redirecting to a tenant AND `hasSuspendedTenants` is true**: appends `?notice=org-suspended` to the redirect URL
5. Sets session cookies and redirects

### Flow B: Tenant Portal (`/app`)

**File**: `apps/front/src/routes/authed/tenant/_portal/tenant-portal-page.tsx`

When a user navigates to `/app` (e.g., typed URL, bookmark, or internal redirect):

1. `TenantPortalPage` loads user auth data to get the user ID
2. Reads the tenant hint cookie for that user
3. Calls `useGetRedirectCode` with the hint
4. `RedirectHandler` processes the response:
   - `"tenant-picker"` -> renders `TenantPickerView` inline (no navigation)
   - `"staff"` / `"unauthorized"` -> navigates to the appropriate page
   - Tenant ID -> navigates to `/app/{tenantId}`, appending `?notice=org-suspended` if `hasSuspendedTenants` is true

### Flow C: Direct URL to Suspended Tenant

When a user navigates directly to `/app/{suspendedTenantId}/...`:

1. The authed layout's `AuthQueriesLoader` fires `useGetTenantAuthData` with the suspended tenant ID
2. `GetTenantAuthData` handler detects the tenant is suspended, returns **403** with `"tenant-suspended"` translation key
3. The global `handleTenantSuspendedError` in `query-client.tsx` intercepts the error:
   - Clears the tenant hint cookie (prevents redirect loops if the user later visits `/app`)
   - Clears the legacy tenant cookie
   - **Does NOT navigate** -- lets the error bubble to the React error boundary
4. The `ErrorBoundary` in `authed-layout.tsx` catches the error:
   - Checks `failure.status === 403 && failure.translationKey === 'tenant-suspended'`
   - Renders `ViewTenantSuspended` -- the dedicated "Organization Suspended" page

### Flow D: Mid-Session Suspension

When a user is actively using a tenant and a staff member suspends it:

1. The next API call from the user hits `TenantAuthFilter`
2. Filter detects suspension, returns **403** with `"tenant-suspended"`
3. Same as Flow C from step 3 onward:
   - Global handler clears cookies
   - Error bubbles to ErrorBoundary
   - `ViewTenantSuspended` page is shown

---

## Frontend: Notification System

### Warning Toast (Auto-Redirect Path)

Used when the user is auto-redirected to an active tenant but also has suspended tenants.

**Mechanism**: Query parameter `?notice=org-suspended`

**Producer** (two entry points):
- Login server action (`login-page.tsx`): Appends query param to redirect URL
- Tenant portal `RedirectHandler` (`tenant-portal-page.tsx`): Appends query param to navigate URL

**Consumer**: `AuthQueriesLoader` in `authed-layout.tsx`

On mount, the loader checks for the `notice` query parameter:
1. If `notice=org-suspended` is present, shows a warning toast: _"One or more of your organizations have been suspended."_
2. Removes the query parameter from the URL via `window.history.replaceState` (no page reload, no URL pollution)

**Constants** (in `packages/shared/lib/constants.ts`):
- `queryParamKey.notice` = `"notice"`
- `queryParamValue.notice.org_suspended` = `"org-suspended"`

### Dedicated Suspended Page (Direct Access Path)

**File**: `apps/front/src/components/error/tenant-suspended-view.tsx`

A full-page view rendered by the `ErrorBoundary` when a user directly accesses a suspended tenant URL. Features:

- Warning-themed icon (`solar:shield-keyhole-bold-duotone`) with orange/warning palette
- Title: "Organization Suspended"
- Description with "Contact Support" link
- CTA button: "Go to my organizations" -- links to `/app/organizations` (not `/app`, to avoid re-triggering the redirect orchestrator)
- Supports `withLayout` prop for flexible rendering

### Tenant Picker Banner (Picker Path)

**File**: `apps/front/src/routes/authed/tenant/_shared/tenant-picker-view.tsx`

When the tenant picker is shown (multiple active tenants, or all suspended), it renders:

- A warning `Alert` banner at the top: _"Some of your organizations have been suspended..."_ with a "Contact Support" link
- Suspended tenant cards are shown with a red "Suspended" `Label` and grayed out (disabled, not clickable)
- Active tenant cards remain clickable

The banner only appears when `data.hasSuspendedTenants` is true.

---

## Scenario Matrix

| Scenario | Auto-Redirect? | Notification |
|---|---|---|
| Login, valid hint, no suspended orgs | Yes (to hinted tenant) | None |
| Login, valid hint, has suspended orgs | Yes (to hinted tenant) | Warning toast |
| Login, no hint, 1 active, no suspended | Yes (to that tenant) | None |
| Login, no hint, 1 active, has suspended | Yes (to that tenant) | Warning toast |
| Login, no hint, multiple active | No (picker shown) | Picker banner if suspended |
| Login, all tenants suspended | No (picker shown) | Picker banner (all disabled) |
| Direct URL to suspended tenant (member) | No (stays on page) | Full "Suspended" page |
| Direct URL to suspended tenant (non-member) | No (stays on page) | Generic 403 page |
| Mid-session: tenant gets suspended | No (stays on page) | Full "Suspended" page |
| On active tenant, other org suspended | Unaffected | None (until next login) |

---

## Organizations Page (`/app/organizations`)

**Route**: `/app/organizations`
**File**: `apps/front/src/routes/authed/tenant/organizations/organizations-page.tsx`

A standalone page that renders the `TenantPickerView` directly, without any of the redirect logic that `/app` (the tenant portal) performs. This page exists specifically as the navigation target from the "Organization Suspended" page.

**Why not link to `/app`?** The tenant portal at `/app` calls `GetRedirectCode`, which would auto-redirect the user back to their last-used tenant (potentially the same one they just came from). The `/app/organizations` page skips all that and just shows the list.

**Route registration** (`apps/front/src/routes/_tree/tenant/tenant.routes.ts`):
The route is registered **before** the dynamic `:tenantId` route to ensure React Router matches the static `organizations` segment before falling through to the dynamic parameter.

---

## Key Files Reference

### Backend

| File | Purpose |
|------|---------|
| `apps/api/Src/Lib/Filters/TenantAuthFilter.cs` | Middleware: blocks requests to suspended tenants with 403 |
| `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs` | Auth data endpoint: returns 403 for suspended tenants |
| `apps/api/Src/Modules/Auth/Handlers/GetRedirectCode.cs` | Redirect decision: returns tenant ID + `HasSuspendedTenants` flag |
| `apps/api/Src/Modules/Users/Services/AccountService.cs` | Service: tenant membership checks, tenant list with suspension data |

### Frontend

| File | Purpose |
|------|---------|
| `apps/front/src/routes/auth/login/login-page.tsx` | Login server action: reads `hasSuspendedTenants`, appends notice query param |
| `apps/front/src/routes/authed/_layout/authed-layout.tsx` | Authed layout: ErrorBoundary catches tenant-suspended 403, toast consumer for notice param |
| `apps/front/src/routes/authed/tenant/_portal/tenant-portal-page.tsx` | Tenant portal: redirect orchestrator, appends notice param on redirect |
| `apps/front/src/routes/authed/tenant/_shared/tenant-picker-view.tsx` | Shared component: tenant list with suspension labels and warning banner |
| `apps/front/src/routes/authed/tenant/organizations/organizations-page.tsx` | Standalone orgs page: renders picker without redirect logic |
| `apps/front/src/components/error/tenant-suspended-view.tsx` | Full-page "Organization Suspended" view |
| `apps/front/src/lib/react-query/query-client.tsx` | Global error handler: clears cookies on tenant-suspended, lets error bubble |
| `apps/front/src/routes/_tree/tenant/tenant.routes.ts` | Route registration for `/app/organizations` |
| `packages/shared/lib/constants.ts` | Query param keys/values, `FRONT_PATH_NAMES.tenant().organizations` |

---

## Translation Keys

### `response-message` namespace (backend error responses)

| Key | EN Value |
|-----|----------|
| `tenant-suspended` | This tenant has been suspended |

### `common` namespace (frontend UI)

| Key | EN Value | Used In |
|-----|----------|---------|
| `tenant-suspended-title` | Organization Suspended | `ViewTenantSuspended` page title |
| `tenant-suspended-description` | This organization has been temporarily suspended and is currently unavailable. If you believe this is an error, please contact support. | `ViewTenantSuspended` description |
| `go-to-my-organizations` | Go to my organizations | `ViewTenantSuspended` CTA button |
| `suspended-tenants-notice` | One or more of your organizations have been suspended. | Warning toast after auto-redirect |
| `suspended-tenants-banner` | Some of your organizations have been suspended and are temporarily unavailable. Please contact support for assistance. | Tenant picker warning banner |
| `contact-support` | Contact Support | Support link in various components |
| `suspended` | Suspended | Red label on suspended tenant cards |
