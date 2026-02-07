# Issue #167: Tenant Suspend/Reactivate - Manual Testing Checklist

## Prerequisites
- [x] Database migrated (`make db-migrate`)
- [x] API running (`make dev-api`)
- [x] Frontend running (`make dev-front`)
- [x] At least one staff user with suspend/reactivate permissions
- [x] At least one tenant with a tenant user

---

## 1. Staff Admin Panel - Tenants List

### 1.1 View Suspended Status
- [x] Navigate to Staff > Tenants list
- [x] Verify `isSuspended` column/badge shows correctly for active tenants
- [x] Verify suspended tenants show "Suspended" status label (red)

### 1.2 Suspend Tenant Action
- [x] Find an **Active** tenant in the list
- [x] Click the suspend button (warning/orange icon)
- [x] Verify confirmation dialog appears with tenant name
- [x] Cancel - verify nothing changes
- [x] Click suspend again and confirm
- [x] Verify success toast: "Tenant has been suspended successfully"
- [ ] Verify tenant status changes to "Suspended" in the list
- [x] Verify suspend button is now hidden for this tenant
- [x] Verify reactivate button is now visible

### 1.3 Reactivate Tenant Action
- [x] Find a **Suspended** tenant in the list
- [x] Click the reactivate button (green play icon)
- [x] Verify confirmation dialog appears with tenant name
- [x] Cancel - verify nothing changes
- [x] Click reactivate again and confirm
- [x] Verify success toast: "Tenant has been reactivated successfully"
- [x] Verify tenant status changes back to "Active"
- [x] Verify reactivate button is now hidden
- [x] Verify suspend button is now visible

### 1.4 Edge Cases
- [x] Try suspending a non-Active tenant (Pending/Archived) - should not show suspend button
- [x] Refresh the page after suspend/reactivate - verify state persists

---

## 2. Tenant User Experience - Suspended Tenant

### 2.1 Access Blocked When Tenant Suspended
- [x] Log in as a tenant user who belongs to a suspended tenant
- [x] Try to access the tenant dashboard
- [x] Verify you are redirected to the tenant picker page
- [x] Verify the suspended tenant shows in the list with "Suspended" badge
- [x] Verify the suspended tenant card is disabled (greyed out, not clickable)

### 2.2 Warning Banner
- [x] On the tenant picker, verify warning alert banner appears
- [x] Banner text: "Some of your organizations have been suspended..."
- [x] Verify "Contact Support" button is present

### 2.3 Multiple Tenants Scenario
- [x] Log in as a user who belongs to multiple tenants (one suspended, one active)
- [-] Verify tenant picker shows both
- [x] Verify only the active tenant is clickable
- [x] Click the active tenant - verify access works normally

### 2.4 All Tenants Suspended
- [x] Log in as a user where ALL their tenants are suspended
- [x] Verify tenant picker shows with all tenants disabled
- [x] Verify warning banner is displayed
- [x] Verify user cannot proceed (all options disabled)

---

## 3. Redirect Logic (GetRedirectCode)

### 3.1 Single Active Tenant
- [x] User with exactly 1 active tenant (no suspended)
- [x] Verify auto-redirect to that tenant (no picker shown)

### 3.2 Single Tenant But Suspended
- [x] User with exactly 1 tenant and it's suspended
- [x] Verify tenant picker is shown (not "unauthorized")
- [x] Verify the suspended tenant appears disabled

### 3.3 Multiple Active Tenants
- [x] User with 2+ active tenants
- [x] Verify tenant picker is shown
- [x] Verify all active tenants are clickable

### 3.4 Mix of Active and Suspended
- [x] User with 1 active + 1 suspended tenant
- [-] Verify tenant picker is shown
- [x] Verify only active tenant is clickable

---

## 4. Security (D9 - Membership First)

### 4.1 Non-Member Cannot Probe Tenant IDs
- [x] As a logged-in user, try accessing a tenant you're NOT a member of
- [x] Via direct URL: `/tenant/{random-uuid}/dashboard`
- [x] Verify you get generic 403 "Forbidden" (not "Tenant suspended" or "Not found")
- [x] Try with a real tenant ID you're not a member of - same 403

### 4.2 Member Sees Suspension in Tenant Picker
- [ ] Suspend a tenant where you ARE a member (user has 2 tenants, 1 suspended)
- [ ] Log in or access `/app` → verify tenant picker is shown (not auto-redirect)
- [ ] Verify suspended tenant is shown with "Suspended" label and is not clickable
- [ ] Verify active tenant is clickable and navigates to its dashboard
- [ ] Suspend ALL tenants for the user → verify tenant picker shows all tenants as disabled with "Suspended" labels
- [ ] While on an active tenant, suspend it mid-session → verify 403 "tenant-suspended" error triggers redirect to `/app`

### 4.3 Deleted Tenant
- [ ] If possible, soft-delete a tenant
- [ ] As a former member, try to access it
- [ ] Verify generic 403 (not "deleted" or "not found")

---

## 5. Cookie/Session Handling

### 5.1 Tenant Hint Cleared on Suspend
- [ ] Log in as tenant user, access a tenant (sets tenant hint cookie)
- [ ] Have staff suspend that tenant
- [ ] Refresh the page as tenant user
- [ ] Verify redirect to tenant picker (not stuck in loop)
- [ ] Verify tenant hint cookie was cleared for this user

### 5.2 Legacy Cookie Handling
- [ ] If legacy tenant cookie exists, verify it's also cleared when tenant-suspended error occurs

---

## 6. API Direct Testing (Optional)

### 6.1 Suspend Endpoint
```bash
# POST /staff/tenants/{tenantId}/suspend
curl -X POST http://localhost:5000/staff/tenants/{id}/suspend \
  -H "X-Session-Token: {staff-token}" \
  -H "Content-Type: application/json"
```
- [ ] Returns 200 with tenant data on success
- [ ] Returns 404 if tenant not found
- [ ] Returns 409 if already suspended
- [ ] Returns 400 if tenant not in Active status

### 6.2 Reactivate Endpoint
```bash
# POST /staff/tenants/{tenantId}/reactivate
curl -X POST http://localhost:5000/staff/tenants/{id}/reactivate \
  -H "X-Session-Token: {staff-token}"
```
- [ ] Returns 200 with tenant data on success
- [ ] Returns 404 if tenant not found
- [ ] Returns 409 if not currently suspended

### 6.3 Tenants For Picker Endpoint
```bash
# GET /auth/tenants-for-picker
curl http://localhost:5000/auth/tenants-for-picker \
  -H "X-Session-Token: {tenant-user-token}"
```
- [ ] Returns all tenants including suspended
- [ ] Each tenant has `isActive` and `isSuspended` fields
- [ ] `activeCount` and `totalCount` are correct
- [ ] `hasSuspendedTenants` is true when applicable

---

## 7. Database Integrity

### 7.1 CHECK Constraint
- [ ] Verify constraint exists: `chk_tenant_suspended_status`
- [ ] Try to manually update only `is_suspended` without `status` - should fail
- [ ] Try to manually update only `status` to 30 without `is_suspended` - should fail

---

## Notes
- All tests should be performed in both English and French locales to verify translations
- Check browser console for any JavaScript errors during testing
- Check API logs for any unexpected errors or session token leakage
