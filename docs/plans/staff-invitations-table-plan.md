# Staff Invitations Table Implementation Plan

## Overview

Implement a full-featured staff invitations table with extended columns, status filtering, cursor-based pagination, and row actions (View Details, Copy Link, Resend Email, Revoke).

---

## Current State (Verified 2026-01-15)

### Backend (Implemented)

| Component | Location | Status |
|-----------|----------|--------|
| Invitation Entity | `apps/api/Src/Modules/Invitations/Entities/Invitation.cs` | Has `AcceptedAt` (line 47-48) |
| InvitationListItem DTO | `apps/api/Src/Modules/Invitations/Services/InvitationService.cs:92-102` | **Missing `AcceptedAt`** |
| FindStaffInvitations handler | `apps/api/Src/Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs` | Returns `List<InvitationListItem>` (no pagination/filtering) |
| InvitationService | `apps/api/Src/Modules/Invitations/Services/InvitationService.cs` | `FindStaffInvitationsAsync()` returns full list |
| Endpoints | `apps/api/Src/Modules/Invitations/Endpoints/InvitationEndpointsForStaff.cs` | Has: Create, BulkCreate, Find, Revoke |
| Routes | `apps/api/Src/Modules/Invitations/Routes.Invitations.cs` | ForStaff: Root, Create, BulkCreate, Find, RevokeById |
| Permissions | `apps/api/Src/Modules/Invitations/Permissions/InvitationPermissionsForStaff.cs` | LIST_FOR_STAFF, CREATE_FOR_STAFF, REVOKE_FOR_STAFF |

### Frontend (Implemented)

| Component | Location | Status |
|-----------|----------|--------|
| Hooks | `apps/front/src/lib/react-query/features/staff/staff-invitation.hooks.ts` | useFindStaffInvitations (no pagination), useCreateStaffInvitation, useBulkCreateStaffInvitations, useRevokeInvitation |
| Table | `apps/front/src/routes/authed/staff/invitations/list/parts/staff-invitations-table.tsx` | **Stub only** (`<div>staff-invitations-page</div>`) |
| List Page | `apps/front/src/routes/authed/staff/invitations/list/staff-invitations-list-page.tsx` | Scaffolded, not wired |
| Details Page | `apps/front/src/routes/authed/staff/invitations/details/staff-invitation-details-page.tsx` | Scaffolded with mock data |
| New Form | `apps/front/src/routes/authed/staff/invitations/new/parts/new-staff-invitations-form.tsx` | **Functional** (bulk creation) |

### Reference Implementations

| Pattern | Location |
|---------|----------|
| Cursor pagination table | `apps/front/src/routes/authed/staff/profiles/list/parts/staff-profiles-table.tsx` |
| Table state hook | `apps/front/src/hooks/use-table-state.ts` |
| Profile hooks (pagination) | `apps/front/src/lib/react-query/features/staff/staff-profile.hooks.ts` |
| Cursor pagination guide | `docs/guides/CURSOR_KEYSET_PAGINATION_GUIDE.md` |

---

## Remaining Work

### Backend

- [ ] **Add `AcceptedAt` to `InvitationListItem` DTO**
  - File: `apps/api/Src/Modules/Invitations/Services/InvitationService.cs:92-102`
  - Add: `public DateTime? AcceptedAt { get; init; }`
  - Update mapping in `FindStaffInvitationsAsync()` (line ~346)

- [ ] **Add cursor pagination + status filtering to FindStaffInvitations**
  - Create: `apps/api/Src/Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs` (rewrite)
    - Add `FindStaffInvitationsQuery : CursorPaginatedQuery` with `Status` filter
    - Add `FindStaffInvitationsResult : CursorPaginatedResult<InvitationListItem>`
    - Add `FindStaffInvitationsQueryValidator`
    - Implement discriminated union result type (Success, CursorNotFound, InvalidSortId)
  - Update: `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
    - Change `FindStaffInvitationsAsync()` signature to accept pagination params
    - Implement keyset pagination with sort field handlers
    - Implement status filter logic (see Status Filter Logic section)
  - Supported sortId values (snake_case): `created_at` (default), `expires_at`, `email`, `accepted_at`
  - Return 400 for invalid sortId (not silent fallback)

- [ ] **Add GetStaffInvitationLink endpoint**
  - Create: `apps/api/Src/Modules/Invitations/Handlers/Staff/GetStaffInvitationLink.cs`
    - Returns `InvitationLinkResult { Link: string }`
    - Validate invitation is pending (not accepted/revoked/expired)
    - Build link using `AuthUtils.CreateAcceptInvitationUrl(token, email)`
  - Update routes: `apps/api/Src/Modules/Invitations/Routes.Invitations.cs`
    - Add `GetLinkById = "/{invitationId}/link"`
  - Update endpoints: `apps/api/Src/Modules/Invitations/Endpoints/InvitationEndpointsForStaff.cs`
  - Add permission: `GET_LINK_FOR_STAFF` in `InvitationPermissionsForStaff.cs`

- [ ] **Add ResendStaffInvitation endpoint**
  - Create: `apps/api/Src/Modules/Invitations/Handlers/Staff/ResendStaffInvitation.cs`
    - Validate invitation is pending (not accepted/revoked/expired)
    - Call `emailService.SendInvitationToJoinStaffEmailAsync(email, token)`
    - Return success response
  - Update routes: `apps/api/Src/Modules/Invitations/Routes.Invitations.cs`
    - Add `ResendById = "/{invitationId}/resend"`
  - Update endpoints: `apps/api/Src/Modules/Invitations/Endpoints/InvitationEndpointsForStaff.cs`
  - Add permission: `RESEND_FOR_STAFF` in `InvitationPermissionsForStaff.cs`

### Client Regeneration

- [ ] **Regenerate TypeScript client**
  - Run `make generate-client` after backend contract changes
  - Verify new types in `packages/js-client/src/models/`

### Frontend

- [ ] **Update `useFindStaffInvitations` hook**
  - File: `apps/front/src/lib/react-query/features/staff/staff-invitation.hooks.ts`
  - Add params: `cursor`, `limit`, `sort`, `status`
  - Update query to pass queryParameters

- [ ] **Add `useGetInvitationLink` hook**
  - File: `apps/front/src/lib/react-query/features/staff/staff-invitation.hooks.ts`
  - Use `createStaffMutation` (avoid caching tokenized URLs)

- [ ] **Add `useResendInvitation` hook**
  - File: `apps/front/src/lib/react-query/features/staff/staff-invitation.hooks.ts`
  - Use `createStaffMutation`

- [ ] **Implement `StaffInvitationsTable`**
  - File: `apps/front/src/routes/authed/staff/invitations/list/parts/staff-invitations-table.tsx`
  - Follow pattern from `staff-profiles-table.tsx`
  - Use `useMRTTable('minimal-cursor', ...)` preset
  - Use `useTableState({ paginationMode: 'cursor' })`
  - Columns: Email, Profile(s), Status, Invited By, Expires At, Accepted At, Created At, Actions
  - Add status filter dropdown above table
  - Implement cursor reset on status filter change (see implementation strategy below)

- [ ] **Implement row actions**
  - View Details: Navigate to details page
  - Copy Link: Call GetLink endpoint, copy to clipboard, success toast
  - Resend Email: Call Resend endpoint, success toast
  - Revoke: Confirm dialog, call existing revoke mutation

- [ ] **Wire up details page (optional)**
  - File: `apps/front/src/routes/authed/staff/invitations/details/staff-invitation-details-page.tsx`
  - Add `useGetStaffInvitation` hook (requires new backend endpoint)
  - Or: Pass data via route state from table row

---

## Decisions

### Status Filter Logic

Status is computed at query time (not persisted). The backend computes status as follows:

| Status | Condition |
|--------|-----------|
| `pending` | `!IsAccepted && !IsRevoked && ExpiresAt > DateTime.UtcNow` |
| `accepted` | `IsAccepted == true` |
| `expired` | `!IsAccepted && !IsRevoked && ExpiresAt <= DateTime.UtcNow` |
| `revoked` | `IsRevoked == true` |

**Status precedence** (for edge cases):
1. `accepted` takes priority (if `IsAccepted == true`, status is always "accepted")
2. `revoked` takes priority over `expired` (if `IsRevoked == true`, status is "revoked")
3. `expired` checked last (if not accepted/revoked and past expiry)

**Known limitation**: Invitations may change status (pending → expired) between page loads. This is acceptable; a background job to update status would be over-engineering.

### Resend Endpoint Semantics

| Question | Decision |
|----------|----------|
| Can resend expired invitations? | **No** - resend is only allowed for `pending` status |
| Does resend extend expiry? | **No** - resend only re-sends the email with same token/expiry |
| Does resend rotate the token? | **No** - same token is used |

Rationale: Keeping the token stable allows the invitee to use the original link if they find it. If expiry extension is needed, consider a separate "extend" endpoint or require a new invitation.

### Copy Link Endpoint Semantics

| Question | Decision |
|----------|----------|
| Can copy link for non-pending? | **No** - returns error for accepted/revoked/expired |
| Token exposure in response? | Token is intentionally NOT in list responses; dedicated endpoint is required |

### sortId Naming Convention

Use **snake_case** for sortId values to match existing API conventions (profiles use `created_at`, `user_account_count`).

| sortId | Column |
|--------|--------|
| `created_at` | CreatedAt (default, descending) |
| `expires_at` | ExpiresAt |
| `email` | Email |
| `accepted_at` | AcceptedAt |

### Cursor Reset on Status Filter Change

**Problem**: `useTableState` only resets cursor history on sorting/page-size changes. Status filter changes also invalidate the current cursor position.

**Implementation strategy**: The table component should reset pagination when status changes. Two options:

**Option A (Recommended)**: Effect-based reset in table component
```typescript
// In StaffInvitationsTable
const [statusFilter, setStatusFilter] = useState<string>('');
const {
  handlePaginationChange,
  handleSortingChange,
  apiVariables,
  tableState,
  setNextCursor,
  ...
} = useTableState({ paginationMode: 'cursor', ... });

// Reset cursor when status filter changes
useEffect(() => {
  // Trigger a pagination change to page 0 to reset cursor state
  handlePaginationChange((prev) => ({ ...prev, pageIndex: 0 }));
}, [statusFilter, handlePaginationChange]);
```

**Option B**: Extend `useTableState` to accept filter dependencies
- Pass `resetDependencies: [statusFilter]` to `useTableState`
- Hook resets cursor history when any dependency changes
- More reusable but requires modifying the shared hook

**Chosen**: Option A (minimal scope, localized to this table)

### Error Handling for Actions

Use centralized error handling (global handler toasts errors). Only show custom success toasts.

| Action | Success Toast | Error Handling |
|--------|--------------|----------------|
| Copy Link | "Invitation link copied to clipboard" | Global handler |
| Resend Email | "Invitation email resent successfully" | Global handler |
| Revoke | "Invitation revoked successfully" | Global handler |

Do **not** add per-action error toasts unless there's a specific reason to override global behavior.

### Permission Naming

Follow existing pattern in `InvitationPermissionsForStaff`:

| Permission Key | Description |
|----------------|-------------|
| `invitations:get_link_for_staff` | Get invitation link for staff |
| `invitations:resend_for_staff` | Resend invitation email for staff |

---

## Endpoint Shapes

### GET /staff/invitations (updated)

**Query Parameters:**
```
cursor?: string       // Pagination cursor (Guid)
limit?: number        // Page size (default from AppSettings)
sort_id?: string      // Sort field: created_at, expires_at, email, accepted_at
sort_order?: string   // Sort direction: asc, desc
status?: string       // Filter: pending, accepted, expired, revoked
```

**Response:**
```json
{
  "data": [
    {
      "id": "guid",
      "email": "string",
      "scope": "Staff",
      "profileName": "string",
      "expiresAt": "datetime",
      "isAccepted": true,
      "isRevoked": false,
      "createdAt": "datetime",
      "invitedByName": "string",
      "acceptedAt": "datetime | null"
    }
  ],
  "nextCursor": "guid | null"
}
```

### GET /staff/invitations/{invitationId}/link (new)

**Response:**
```json
{
  "link": "https://app.example.com/accept-invitation?token=xxx&id=yyy"
}
```

**Errors:**
- 400: Invitation is not pending (accepted/revoked/expired)
- 404: Invitation not found

### POST /staff/invitations/{invitationId}/resend (new)

**Response:**
```json
{
  "message": "Invitation email resent successfully",
  "key": "invitation-resent"
}
```

**Errors:**
- 400: Invitation is not pending (accepted/revoked/expired)
- 404: Invitation not found

---

## Files to Create/Modify

### Backend

| File | Action |
|------|--------|
| `Src/Modules/Invitations/Services/InvitationService.cs` | Modify: add `AcceptedAt` to DTO, update `FindStaffInvitationsAsync` with pagination |
| `Src/Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs` | Rewrite: add query params, validator, cursor pagination logic |
| `Src/Modules/Invitations/Handlers/Staff/GetStaffInvitationLink.cs` | Create: new handler |
| `Src/Modules/Invitations/Handlers/Staff/ResendStaffInvitation.cs` | Create: new handler |
| `Src/Modules/Invitations/Routes.Invitations.cs` | Modify: add GetLinkById, ResendById |
| `Src/Modules/Invitations/Endpoints/InvitationEndpointsForStaff.cs` | Modify: add GetLink, Resend routes |
| `Src/Modules/Invitations/Permissions/InvitationPermissionsForStaff.cs` | Modify: add GET_LINK_FOR_STAFF, RESEND_FOR_STAFF |

### Frontend

| File | Action |
|------|--------|
| `src/lib/react-query/features/staff/staff-invitation.hooks.ts` | Modify: update useFindStaffInvitations, add useGetInvitationLink, useResendInvitation |
| `src/routes/authed/staff/invitations/list/parts/staff-invitations-table.tsx` | Rewrite: full implementation |

---

## Implementation Order

1. Backend: Add `AcceptedAt` to `InvitationListItem` DTO + mapping
2. Backend: Add pagination + filtering to `FindStaffInvitations`
3. Backend: Create `GetStaffInvitationLink` endpoint
4. Backend: Create `ResendStaffInvitation` endpoint
5. **Run `make generate-client`**
6. Frontend: Update `useFindStaffInvitations` hook with pagination params
7. Frontend: Add `useGetInvitationLink` and `useResendInvitation` hooks
8. Frontend: Implement `StaffInvitationsTable` with filtering
9. Frontend: Implement row actions (View, Copy, Resend, Revoke)
10. Test end-to-end

---

## Out of Scope

- Details page API integration (requires new GetById endpoint)
- Invitation expiry extension endpoint
- Token rotation on resend
- Background job for status updates
