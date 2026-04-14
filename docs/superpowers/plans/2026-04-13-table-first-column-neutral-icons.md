# Table First-Column Neutral Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bright first-column table avatar fallbacks with neutral sidebar-like icon treatments while preserving real row images.

**Architecture:** Keep the existing base-template pattern of using MUI `Avatar` directly inside table cells. Do not change the global `MuiAvatar` fallback theme and do not add a new shared avatar component. Instead, update affected first-column table cells to render explicit entity-specific `Iconify` children with neutral `sx` only when the row has no image.

**Tech Stack:** React 19, TypeScript, MUI v6, Material React Table, existing `Iconify` wrapper, Biome, `just`

---

## File Map

**Modify**
- `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-table.tsx`
  First-column staff user cell currently relies on `Avatar src={avatarUrl}` and bright global fallback when `avatarUrl` is missing.
- `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`
  First-column tenant user cell has the same implicit bright user fallback.
- `apps/front/src/routes/authed/staff/profiles/details/users/staff-profile-details-users-tab-page.tsx`
  First-column profile users table has the same implicit bright user fallback.
- `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`
  Tenant row currently uses a rounded `Avatar` with no explicit icon or image, so it falls back to bright name-derived color behavior.
- `apps/front/src/routes/authed/staff/profiles/list/parts/staff-profiles-table.tsx`
  Profile row already uses an explicit icon but still needs the fallback shell checked against the neutral visual rules.
- `apps/front/src/routes/authed/tenant/settings/members/settings-members-page.tsx`
  Plain MUI table currently uses initials in the first-column avatar.
- `apps/front/src/routes/authed/tenant/settings/roles/settings-roles-page.tsx`
  Plain MUI table currently uses a colored icon avatar with semantic tint in the first column.
- `apps/front/src/routes/authed/tenant/settings/workspaces/settings-workspaces-page.tsx`
  Plain list/table-like row uses a bright initial-based avatar tint and should move to explicit neutral icon treatment.

**Reference Only**
- `apps/front/src/layouts/components/sidebar-user-menu.tsx`
  Source of the desired muted ambiance for fallback avatars.
- `apps/front/src/lib/mui/theme/core/components/avatar.tsx`
  Global avatar fallback remains unchanged; this file is reference-only so the change stays table-scoped.

## Task 1: Update User-Type First-Column Cells

**Files:**
- Modify: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-table.tsx`
- Modify: `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`
- Modify: `apps/front/src/routes/authed/staff/profiles/details/users/staff-profile-details-users-tab-page.tsx`

- [ ] **Step 1: Inspect the three user table cells and keep the current image path unchanged**

Confirm each file still uses the same shape and spacing pattern shown below:

```tsx
<Box sx={{ gap: 2, display: 'flex', alignItems: 'center' }}>
  <Avatar alt={fullName} src={avatarUrl} />
  <Stack sx={{ typography: 'body2', flex: '1 1 auto', alignItems: 'flex-start' }}>
    ...
  </Stack>
</Box>
```

- [ ] **Step 2: Add explicit neutral user-icon fallback in `staff-users-table.tsx`**

Replace the implicit fallback avatar with an explicit child icon that only renders when `avatarUrl` is missing:

```tsx
<Avatar
  alt={fullName}
  src={avatarUrl || undefined}
  sx={{
    ...(avatarUrl
      ? {}
      : {
          bgcolor: 'background.neutral',
          color: 'text.disabled',
        }),
  }}
>
  {!avatarUrl ? <Iconify icon="solar:user-rounded-bold" width={20} /> : null}
</Avatar>
```

Keep the surrounding stack, link, and `me` badge unchanged.

- [ ] **Step 3: Run type check on the first user table file**

Run: `just tsc-front`
Expected: PASS with no new TypeScript errors from `staff-users-table.tsx`

- [ ] **Step 4: Apply the same explicit user fallback pattern in `tenant-users-table.tsx`**

Use the same `Avatar` structure and icon:

```tsx
<Avatar
  alt={fullName}
  src={avatarUrl || undefined}
  sx={{
    ...(avatarUrl
      ? {}
      : {
          bgcolor: 'background.neutral',
          color: 'text.disabled',
        }),
  }}
>
  {!avatarUrl ? <Iconify icon="solar:user-rounded-bold" width={20} /> : null}
</Avatar>
```

Keep the existing row spacing and user details link unchanged.

- [ ] **Step 5: Apply the same explicit user fallback pattern in `staff-profile-details-users-tab-page.tsx`**

Use the same `Avatar` structure and icon:

```tsx
<Avatar
  alt={fullName}
  src={avatarUrl || undefined}
  sx={{
    ...(avatarUrl
      ? {}
      : {
          bgcolor: 'background.neutral',
          color: 'text.disabled',
        }),
  }}
>
  {!avatarUrl ? <Iconify icon="solar:user-rounded-bold" width={20} /> : null}
</Avatar>
```

Keep the rest of the cell layout unchanged.

- [ ] **Step 6: Re-run type check after all three user-table updates**

Run: `just tsc-front`
Expected: PASS with no new TypeScript errors from the user table files

## Task 2: Update Non-User MRT First-Column Cells

**Files:**
- Modify: `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`
- Modify: `apps/front/src/routes/authed/staff/profiles/list/parts/staff-profiles-table.tsx`

- [ ] **Step 1: Add explicit neutral tenant icon fallback in `tenants-table.tsx`**

Replace the current empty rounded avatar:

```tsx
<Avatar alt={name} variant="rounded" sx={{ width: 46, height: 46 }} />
```

with an explicit neutral tenant/workspace glyph:

```tsx
<Avatar
  alt={name}
  variant="rounded"
  sx={{
    width: 46,
    height: 46,
    bgcolor: 'background.neutral',
    color: 'text.disabled',
  }}
>
  <Iconify icon="solar:buildings-2-bold" width={24} />
</Avatar>
```

Keep the `ListItemText`, tenant link, and secondary ID unchanged.

- [ ] **Step 2: Normalize the existing profile icon avatar in `staff-profiles-table.tsx`**

Keep the existing profile-specific icon but ensure the avatar shell is explicitly neutral:

```tsx
<Avatar
  alt={name}
  variant="rounded"
  sx={{
    width: 40,
    height: 40,
    bgcolor: 'background.neutral',
    color: 'text.disabled',
  }}
>
  <Iconify icon="solar:user-id-bold" width={24} />
</Avatar>
```

Keep the cell spacing and text styles unchanged.

- [ ] **Step 3: Re-run type check after MRT non-user updates**

Run: `just tsc-front`
Expected: PASS with no new TypeScript errors from the tenant/profile MRT files

## Task 3: Update Plain MUI First-Column Rows In Tenant Settings

**Files:**
- Modify: `apps/front/src/routes/authed/tenant/settings/members/settings-members-page.tsx`
- Modify: `apps/front/src/routes/authed/tenant/settings/roles/settings-roles-page.tsx`
- Modify: `apps/front/src/routes/authed/tenant/settings/workspaces/settings-workspaces-page.tsx`

- [ ] **Step 1: Replace initials fallback in `settings-members-page.tsx` with a neutral user icon**

Replace:

```tsx
<Avatar sx={{ width: 36, height: 36 }}>
  {member.name.charAt(0)}
</Avatar>
```

with:

```tsx
<Avatar
  sx={{
    width: 36,
    height: 36,
    bgcolor: 'background.neutral',
    color: 'text.disabled',
  }}
>
  <Iconify icon="solar:user-rounded-bold" width={20} />
</Avatar>
```

- [ ] **Step 2: Remove semantic color tinting from the role icon avatar in `settings-roles-page.tsx`**

Replace the current `alpha(...role.color...)` based `sx` with a neutral shell:

```tsx
<Avatar
  sx={{
    width: 36,
    height: 36,
    bgcolor: 'background.neutral',
    color: 'text.disabled',
  }}
>
  <Iconify icon="solar:shield-check-bold" width={20} />
</Avatar>
```

Keep the role name, description, and member chip unchanged.

- [ ] **Step 3: Replace bright workspace initials treatment in `settings-workspaces-page.tsx`**

Replace:

```tsx
<Avatar
  sx={{
    width: 48,
    height: 48,
    bgcolor: alpha(workspace.color, 0.12),
    color: workspace.color,
    fontWeight: 600,
  }}
>
  {workspace.name.charAt(0)}
</Avatar>
```

with an explicit neutral workspace glyph:

```tsx
<Avatar
  sx={{
    width: 48,
    height: 48,
    bgcolor: 'background.neutral',
    color: 'text.disabled',
  }}
>
  <Iconify icon="solar:widget-5-bold" width={24} />
</Avatar>
```

Keep the workspace title, description, chips, and action button unchanged.

- [ ] **Step 4: Re-run type check after tenant settings updates**

Run: `just tsc-front`
Expected: PASS with no new TypeScript errors from the tenant settings pages

## Task 4: Verify Scope And Visual Consistency

**Files:**
- Review: `apps/front/src/layouts/components/sidebar-user-menu.tsx`
- Review: all files modified in Tasks 1-3

- [ ] **Step 1: Confirm no non-table avatar behavior changed**

Run:

```bash
rg -n "background.neutral|solar:user-rounded-bold|solar:buildings-2-bold|solar:user-id-bold|solar:shield-check-bold|solar:widget-5-bold" apps/front/src/routes/authed
```

Expected: matches appear only in the intended table and table-like row files, not in unrelated layout or account avatar files.

- [ ] **Step 2: Run final type check**

Run: `just tsc-front`
Expected: PASS

- [ ] **Step 3: Manually verify first-column visuals in the browser**

Open the affected screens and verify:

```text
Staff > Users list
Staff > Tenants list
Staff > Tenant details > Users
Staff > Profiles list
Staff > Profile details > Users
Tenant > Settings > Members
Tenant > Settings > Roles
Tenant > Settings > Workspaces
```

Expected:
- Rows with real images still render those images
- Rows without images render muted neutral icons
- Rounded rows stay rounded and circular rows stay circular
- No bright semantic first-column avatar fills remain on these screens

## Self-Review

- Spec coverage: the plan covers image-preserving user rows, non-user entity rows, plain MUI settings tables, and final scope verification
- Placeholder scan: no `TODO`, `TBD`, or undefined implementation tasks remain
- Type consistency: all fallback updates use existing `Avatar` + `Iconify` patterns and do not introduce a new shared component or global avatar theme change
