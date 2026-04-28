# Tenant Profiles Module Completion Manual Test Guide

This file is a companion to [tenant-module-smoke-test-checklist.md](/C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/docs/misc/tenant-module-smoke-test-checklist.md).

Use this guide when you want the fastest ordered pass over the current uncommitted changeset without jumping around the checklist.

## 1. Automated Verification First

Run these from the repo root:

```powershell
just build-api
just tsc-front
just test-api
```

Optional contract regeneration check:

```powershell
just generate-client
```

## 2. Staff Tenant Profiles Tab

Open:

`/staff/tenants/{tenantId}/profiles`

Verify:

- The table loads real backend data for the selected tenant.
- Search updates server-side results correctly.
- Cursor pagination does not duplicate or skip rows.
- Row selection mode enters and exits cleanly.
- The export dialog opens and supports current results vs selected rows.
- The preview drawer opens from the row action and shows real metadata plus assigned permissions.
- Compare mode only enables for 2 to 3 selected profiles.
- The compare drawer highlights permission differences correctly.

## 3. Create And Edit Flows

From the same tab, verify:

- The create action opens a real drawer.
- Creating a non-default tenant profile persists and refreshes the table.
- Editing a tenant profile updates name and description correctly.
- Permission toggles in the form drawer persist correctly.
- Duplicate profile names are rejected with the expected error.

## 4. Delete And Default Profile Protection

Verify:

- A non-default tenant profile can be deleted from the row action.
- Bulk delete works for selected non-default profiles.
- The default tenant profile cannot be deleted from the UI flow.
- The backend still blocks default-profile deletion if the UI guard is bypassed.

## 5. Staff Permission Gating On The Tenant Profiles Tab

Use staff users with narrower permissions and verify:

- Without `staff.profiles.get_for_tenant`, preview and compare actions are hidden.
- Without `staff.profiles.create_for_tenant`, the create CTA is hidden.
- Without `staff.profiles.update_for_tenant`, edit actions are hidden.
- Without `staff.profiles.delete_for_tenant`, delete actions and bulk delete are hidden.

## 6. Deferred Scope

Tenant-side UI permission gating is intentionally deferred to a dedicated follow-up task. Do not treat the tenant shell, tenant settings routes, or tenant page visibility as part of this manual pass.

## 7. Late Regression Checks

Verify these specifically because they were fixed late in the changeset:

- Tenant-profile row actions do not break or flicker after auth data loads.
- Staff-scope action visibility matches the current permission set.
- Tenant auth data reflects all assigned tenant profiles even if the profile count exceeds the configured max-per-user cap.
- Revoked, deleted, or wrong-scope permissions do not leak into the tenant auth payload.

## 8. What You Do Not Need To Re-Test Manually

These are already covered well by integration tests:

- Malformed IDs, 400s, 404s, and route-level 403s for the new tenant-profile endpoints.
- Tenant permission catalog endpoint behavior.
- Tenant auth data leakage cases involving deleted links, deleted permissions, and wrong-scope permissions.
- The over-cap tenant auth data regression.

## 9. Checklist Mapping

The assertions above mainly map to:

- `Category 7.1` Profiles table and list behaviors
- `Category 7.2` Preview and compare
- `Category 7.3` Create and edit profile
- `Category 7.4` Delete and default-profile protection

If you want to mark completion officially, check items in the main checklist file, not in this guide.
