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
- [ ] Cancel - verify nothing changes
- [ ] Click suspend again and confirm
- [ ] Verify success toast: "Tenant has been suspended successfully"
- [ ] Verify tenant status changes to "Suspended" in the list
- [ ] Verify suspend button is now hidden for this tenant
- [ ] Verify reactivate button is now visible

### 1.3 Reactivate Tenant Action
- [ ] Find a **Suspended** tenant in the list
- [ ] Click the reactivate button (green play icon)
- [ ] Verify confirmation dialog appears with tenant name
- [ ] Cancel - verify nothing changes
- [ ] Click reactivate again and confirm
- [ ] Verify success toast: "Tenant has been reactivated successfully"
- [ ] Verify tenant status changes back to "Active"
- [ ] Verify reactivate button is now hidden
- [ ] Verify suspend button is now visible

### 1.4 Edge Cases
- [ ] Try suspending a non-Active tenant (Pending/Archived) - should not show suspend button
- [ ] Refresh the page after suspend/reactivate - verify state persists

---

## 2. Tenant User Experience - Suspended Tenant

### 2.1 Access Blocked When Tenant Suspended
- [ ] Log in as a tenant user who belongs to a suspended tenant
- [ ] Try to access the tenant dashboard
- [ ] Verify you are redirected to the tenant picker page
- [ ] Verify the suspended tenant shows in the list with "Suspended" badge
- [ ] Verify the suspended tenant card is disabled (greyed out, not clickable)

### 2.2 Warning Banner
- [ ] On the tenant picker, verify warning alert banner appears
- [ ] Banner text: "Some of your organizations have been suspended..."
- [ ] Verify "Contact Support" button is present

### 2.3 Multiple Tenants Scenario
- [ ] Log in as a user who belongs to multiple tenants (one suspended, one active)
- [ ] Verify tenant picker shows both
- [ ] Verify only the active tenant is clickable
- [ ] Click the active tenant - verify access works normally

### 2.4 All Tenants Suspended
- [ ] Log in as a user where ALL their tenants are suspended
- [ ] Verify tenant picker shows with all tenants disabled
- [ ] Verify warning banner is displayed
- [ ] Verify user cannot proceed (all options disabled)

---

## 3. Redirect Logic (GetRedirectCode)

### 3.1 Single Active Tenant
- [ ] User with exactly 1 active tenant (no suspended)
- [ ] Verify auto-redirect to that tenant (no picker shown)

### 3.2 Single Tenant But Suspended
- [ ] User with exactly 1 tenant and it's suspended
- [ ] Verify tenant picker is shown (not "unauthorized")
- [ ] Verify the suspended tenant appears disabled

### 3.3 Multiple Active Tenants
- [ ] User with 2+ active tenants
- [ ] Verify tenant picker is shown
- [ ] Verify all active tenants are clickable

### 3.4 Mix of Active and Suspended
- [ ] User with 1 active + 1 suspended tenant
- [ ] Verify tenant picker is shown
- [ ] Verify only active tenant is clickable

---

## 4. Security (D9 - Membership First)

### 4.1 Non-Member Cannot Probe Tenant IDs
- [ ] As a logged-in user, try accessing a tenant you're NOT a member of
- [ ] Via direct URL: `/tenant/{random-uuid}/dashboard`
- [ ] Verify you get generic 403 "Forbidden" (not "Tenant suspended" or "Not found")
- [ ] Try with a real tenant ID you're not a member of - same 403

### 4.2 Member Sees Specific Error
- [ ] Suspend a tenant where you ARE a member
- [ ] Try to access that tenant
- [ ] Verify you see "tenant-suspended" error (specific message for members)
- [ ] Verify redirect to tenant picker

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
