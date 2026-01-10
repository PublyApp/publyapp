# Staff Invitations Table Implementation Plan

## Overview
Implement a full-featured staff invitations table with extended columns, status filtering, cursor-based pagination, and row actions (View Details, Copy Link, Resend Email, Revoke).

## Scope Summary

| Area | Changes Required |
|------|-----------------|
| Backend | Add `AcceptedAt` to response, pagination/filtering, resend endpoint, get-link endpoint |
| Frontend | Build table component, update hooks, implement actions |

## Current State (Verified 2026-01-10)

**Existing `InvitationListItem` fields:**
- `Id`, `Email`, `Scope`, `ProfileName`, `ExpiresAt`, `IsAccepted`, `IsRevoked`, `CreatedAt`, `InvitedByName`

**What's already available:**
- `InvitedByName` - already populated in `FindStaffInvitationsAsync` (no changes needed)

**What's missing:**
- `AcceptedAt` - needs to be added to DTO and mapping

**Security note:**
- `Token` is intentionally NOT included in list responses (good practice)
- Copy Link feature requires a dedicated endpoint to fetch token on-demand

---

## Phase 1: Backend Changes

### 1.1 Add `AcceptedAt` to InvitationListItem Response

**File:** `apps/api/Src/Modules/Shared/Invitations/InvitationService.cs:91-101`

The `AcceptedAt` field already exists on the `Invitation` entity (line 47-48) but is not included in `InvitationListItem`. Add it:

```csharp
public record InvitationListItem {
    // ... existing fields
    public DateTime? AcceptedAt { get; init; }  // ADD THIS
}
```

Update the mapping in `FindStaffInvitationsAsync` to include `AcceptedAt`.

---

### 1.2 Add Cursor Pagination & Filtering to FindStaffInvitations

**Files to modify:**
- `apps/api/Src/Modules/Staff/InvitationsAsStaff/Handlers/FindStaffInvitations.cs`
- `apps/api/Src/Modules/Shared/Invitations/InvitationService.cs`

**Create Query Class:**
```csharp
public class FindStaffInvitationsQuery : CursorPaginatedQuery {
    [FromQuery] public string? Status { get; set; }  // pending, accepted, expired, revoked
}
```

**Status Filter Logic:**
- `pending`: `!IsAccepted && !IsRevoked && ExpiresAt > DateTime.UtcNow`
- `accepted`: `IsAccepted`
- `expired`: `!IsAccepted && !IsRevoked && ExpiresAt <= DateTime.UtcNow`
- `revoked`: `IsRevoked`

**Note:** Status is computed at query time (not persisted). This means invitations may change status (pending -> expired) between page loads. This is a known acceptable limitation - the alternative of a background job to update status is over-engineering for this use case.

**Response Structure:**
```csharp
public class FindStaffInvitationsResult : CursorPaginatedResult<InvitationListItem> { }
```

**No Total Count (Cursor Pagination):**
- Do not add a `Count` / total-count query for cursor pagination (see `docs/guides/CURSOR_KEYSET_PAGINATION_GUIDE.md`).
- Return `NextCursor` (null means there are no more pages).

**Sorting (Allowlist Only):**
- Implement an explicit safe mapping (like `StaffMemberService`) so `sortId` cannot become "anything".
- Implement keyset pagination per `docs/guides/CURSOR_KEYSET_PAGINATION_GUIDE.md` (stable sort + tie-breaker by `Id`).
- Suggested supported `sortId` values (pick only what you implement correctly):
  - `createdAt` (default)
  - `expiresAt`
  - `email`
  - `acceptedAt`
- If `sortId` is not supported: return a validation error (recommended, like `FindStaffProfiles`) or fall back to `createdAt desc`.

**Cursor Parsing (Handler Pattern):**
- Follow the same approach as `apps/api/Src/Modules/Staff/ProfilesAsStaff/Handlers/FindStaffProfiles.cs`:
  - `cursor` is optional (first page).
  - If cursor is provided, validate/parse it (bad cursor -> 400).
  - If the cursor record no longer exists -> 400 with a clear message.

---

### 1.3 Add Resend Invitation Email Endpoint

**File:** `apps/api/Src/Modules/Staff/InvitationsAsStaff/InvitationEndpoints.cs`

Add new endpoint:
```
POST /staff/invitations/{invitationId}/resend
```

**Handler Implementation:**
- Validate invitation exists and is still pending (not accepted, not revoked, not expired)
- Call existing `emailService.SendInvitationToJoinStaffEmailAsync(email, token)`
- Return success/error response

**File to create:** `apps/api/Src/Modules/Staff/InvitationsAsStaff/Handlers/ResendStaffInvitation.cs`

---

### 1.4 Add Get Invitation Link Endpoint

**File:** `apps/api/Src/Modules/Staff/InvitationsAsStaff/InvitationEndpoints.cs`

Add new endpoint:
```
GET /staff/invitations/{invitationId}/link
```

**Response:**
```csharp
public record InvitationLinkResult {
    public required string Link { get; init; }
}
```

**Handler Implementation:**
- Validate invitation exists and is pending (Admin only)
- Fetch the invitation's token and email from DB
- Use `AuthUtils.CreateAcceptInvitationUrl(token, email)` to build the link
  - URL format: `{FRONT_URL}/accept-invitation?token={token}&id={encryptedEmail}`
- Return the full URL

**File to create:** `apps/api/Src/Modules/Staff/InvitationsAsStaff/Handlers/GetStaffInvitationLink.cs`

---

## Phase 2: Frontend Changes

### 2.1 Update React Query Hooks

**File:** `apps/front/app/lib/react-query/features/staff/staff-invitation.hooks.ts`

Update `useFindStaffInvitations` to accept pagination and filter params:
```typescript
type FindStaffInvitationsParams = {
    cursor?: string;
    limit: number;
    sort: { id: string; order: 'asc' | 'desc' };
    status?: 'pending' | 'accepted' | 'expired' | 'revoked';
};
```

Add new hooks:
```typescript
export const useResendInvitation = createMutation({...});
export const useGetInvitationLink = createMutation({...});  // click action; avoid caching tokenized URLs
```

---

### 2.2 Implement Staff Invitations Table

**File:** `apps/front/app/routes/authed/staff/invitations/list/parts/staff-invitations-table.tsx`

**Columns (Extended Set):**
1. Email (with avatar placeholder)
2. Profile(s)
3. Status (Label with color: Pending/Accepted/Expired/Revoked)
4. Invited By
5. Expires At (relative time)
6. Accepted At (if accepted, else "-")
7. Created At
8. Actions

**Table Features:**
- Use `useMRTTable('minimal-cursor', {...})` pattern from `apps/front/app/routes/authed/staff/profiles/list/parts/staff-profiles-table.tsx`
- Use `useTableState({ paginationMode: 'cursor' })` for pagination/sorting state
- Feed `data?.nextCursor` back into `setNextCursor` to enable Next/Previous
- Status filter dropdown above table

**Cursor Reset on Filter Change:**
- When `status` changes, reset cursor pagination back to first page (cursor history + current cursor + virtual page index).
- `useTableState` already resets cursor state when sorting/page size changes; do the same for `status` changes in this table.

**Status Filter Component:**
```typescript
<Select value={statusFilter} onChange={setStatusFilter}>
    <MenuItem value="">All</MenuItem>
    <MenuItem value="pending">Pending</MenuItem>
    <MenuItem value="accepted">Accepted</MenuItem>
    <MenuItem value="expired">Expired</MenuItem>
    <MenuItem value="revoked">Revoked</MenuItem>
</Select>
```

---

### 2.3 Implement Row Actions

**Actions Cell Component:**

| Action | Icon | Behavior | Visibility |
|--------|------|----------|------------|
| View Details | `solar:eye-bold` | Navigate to details page | Always |
| Copy Invite Link | `solar:copy-bold-duotone` | Copy invitation URL to clipboard (via API) | Pending only |
| Resend Email | `custom:send-fill` | Call resend mutation, show toast | Pending only |
| Revoke | `solar:trash-bin-trash-bold` | Confirm dialog, call revoke mutation | Pending only |

**Copy Link Implementation:**
- Call `GET /staff/invitations/{id}/link` endpoint
- Copy returned URL to clipboard
- Show success toast

**Error Handling:**
All actions should show toast notifications:

| Action | Success Toast | Error Toast |
|--------|--------------|-------------|
| Copy Link | "Invitation link copied to clipboard" | "Failed to copy invitation link" |
| Resend Email | "Invitation email resent successfully" | "Failed to resend invitation email" |
| Revoke | "Invitation revoked successfully" | "Failed to revoke invitation" |

---

## Files to Create/Modify

### Backend (apps/api)
| File | Action |
|------|--------|
| `Src/Modules/Shared/Invitations/InvitationService.cs` | Modify - add AcceptedAt to DTO, add pagination params |
| `Src/Modules/Staff/InvitationsAsStaff/Handlers/FindStaffInvitations.cs` | Modify - add query params |
| `Src/Modules/Staff/InvitationsAsStaff/Handlers/ResendStaffInvitation.cs` | Create - resend email handler |
| `Src/Modules/Staff/InvitationsAsStaff/Handlers/GetStaffInvitationLink.cs` | Create - get invite link handler |
| `Src/Modules/Staff/InvitationsAsStaff/InvitationEndpoints.cs` | Modify - add resend + link routes |

### Frontend (apps/front)
| File | Action |
|------|--------|
| `app/lib/react-query/features/staff/staff-invitation.hooks.ts` | Modify - add pagination, resend hook |
| `app/routes/authed/staff/invitations/list/parts/staff-invitations-table.tsx` | Rewrite - full implementation |

### Regenerate JS Client
After backend changes, run the Kiota generator to update TypeScript types.

---

## Implementation Order

1. Backend: Add `AcceptedAt` to `InvitationListItem`
2. Backend: Add pagination + filtering to `FindStaffInvitations`
3. Backend: Create `ResendStaffInvitation` endpoint
4. Backend: Create `GetStaffInvitationLink` endpoint
5. Regenerate JS client types
6. Frontend: Update React Query hooks
7. Frontend: Build table component with filtering
8. Frontend: Implement all row actions
9. Test end-to-end

---

## Questions Resolved

| Question | Decision |
|----------|----------|
| Columns | Extended: Email, Profile, Status, Invited By, Expires At, Accepted At, Created At, Actions |
| Actions | Full: View Details, Copy Link, Resend Email, Revoke |
| Filtering | Status dropdown (All, Pending, Accepted, Expired, Revoked) |
| Pagination | Cursor-based (keyset) like staff profiles table |
| Missing fields | Add AcceptedAt to API response (already in DB) |
| Backend filtering | Implement server-side pagination + status filter |
| Resend action | Create new backend endpoint first |
| Copy Link | Create GET `/staff/invitations/{id}/link` endpoint (secure) |
