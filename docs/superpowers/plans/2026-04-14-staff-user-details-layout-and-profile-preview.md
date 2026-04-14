# Staff User Details Layout And Profile Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the existing `feat/staff-user-profiles-permissions` branch by keeping the staff user details page layout invariant under long content and adding a selected-profile preview drawer to the existing profiles autocomplete.

**Architecture:** This is a frontend-only refinement on top of the existing staff user details flow. The work stays inside the current details-page and `StaffUserProfilesSection` structure, adds explicit overflow containment rules, and reuses the branch’s existing right-drawer interaction patterns for the profile preview UX without changing the underlying profile assignment API.

**Tech Stack:** React 19, React Router v7, MUI v6, TanStack Query, existing staff hooks in `apps/front/src/lib/react-query/features/staff`

---

## File Structure

- Modify: `apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-update-form.tsx`
  - Owns the staff user details page two-column layout, left metadata rail, and right-side cards.
- Modify: `apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-profiles-section.tsx`
  - Owns the existing profiles assignment autocomplete and is the right place for chip rendering, overflow containment, and selected-profile preview behavior.
- Create: `apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-profile-preview-drawer.tsx`
  - Isolates the selected-profile preview drawer so the autocomplete section does not become too large.
- Test/verify via existing UI flows:
  - `apps/front/src/routes/authed/staff/staff-users/details/staff-user-details-page.tsx`
  - smoke-test checklist already in branch context

The plan deliberately avoids shared theme-level autocomplete overrides first. The branch issue is page-specific and should be solved locally unless local implementation proves too repetitive.

### Task 1: Lock The Staff User Details Page Layout

**Files:**
- Modify: `apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-update-form.tsx`

- [ ] **Step 1: Inspect the current layout boundaries before editing**

Read:

```text
apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-update-form.tsx
```

Focus on:

```tsx
<Box
  sx={{
    display: 'grid',
    gap: 3,
    gridTemplateColumns: '1fr',
    '@container (min-width: 837px)': {
      gridTemplateColumns: '1fr 2fr',
    },
  }}
>
```

Expected finding: the desktop layout already uses a stable `1fr 2fr` split, so the main risk is not the grid definition itself but content inside cards escaping their containers.

- [ ] **Step 2: Write the containment changes for the left and right cards**

Update the card wrappers so shrinking and overflow containment are explicit:

```tsx
<Card
  sx={{
    pt: 8,
    pb: 5,
    px: 3,
    minWidth: 0,
    overflow: 'hidden',
  }}
>
```

```tsx
<Stack spacing={3} sx={{ minWidth: 0 }}>
```

```tsx
<Card sx={{ p: 3, minWidth: 0, overflow: 'hidden' }}>
```

```tsx
<Card
  sx={{
    p: 3,
    minWidth: 0,
    overflow: 'hidden',
    border: '1px solid',
    borderColor: 'error.main',
    bgcolor: (theme) => alpha(theme.palette.error.main, 0.02),
  }}
>
```

These rules make the width invariant explicit for both the left rail and the right-side cards.

- [ ] **Step 3: Run type checking on the modified file’s package**

Run:

```powershell
pnpm --dir apps/front tsc --noEmit
```

Expected: PASS or pre-existing unrelated errors only. No new errors from `staff-user-update-form.tsx`.

### Task 2: Fix Left Metadata Rail Overflow

**Files:**
- Modify: `apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-update-form.tsx`

- [ ] **Step 1: Add tooltip support for machine-like values**

Add the import:

```tsx
import Tooltip from '@mui/material/Tooltip';
```

Replace the current `InfoRow` text rendering with explicit truncation for the value line:

```tsx
<Tooltip title={value} placement="top-start">
  <Typography
    variant="body2"
    sx={{
      fontWeight: 500,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }}
  >
    {value}
  </Typography>
</Tooltip>
```

Keep the surrounding shrink container:

```tsx
<Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
```

- [ ] **Step 2: Keep the metadata row itself containment-safe**

Ensure the row layout prevents the icon column from collapsing and the text column from pushing outward:

```tsx
<Box
  sx={{
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    minWidth: 0,
  }}
>
```

```tsx
<Iconify
  icon={icon}
  width={20}
  sx={{ color: 'text.secondary', flexShrink: 0 }}
/>
```

This keeps long emails from widening the sidebar.

- [ ] **Step 3: Run focused verification in the browser**

Run the frontend if needed:

```powershell
just dev-front
```

Then verify manually on the staff user details page:

- use a very long email
- confirm the left card width does not change
- confirm the email truncates to one line
- confirm the tooltip reveals the full value

Expected: the left rail remains aligned with the same width as other users.

### Task 3: Constrain Selected Profile Chips In The Existing Autocomplete

**Files:**
- Modify: `apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-profiles-section.tsx`

- [ ] **Step 1: Add custom tag rendering instead of relying on default MUI tags**

Add imports needed for custom chip rendering:

```tsx
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import type { AutocompleteRenderGetTagProps } from '@mui/material/Autocomplete';
```

Add a `renderTags` implementation:

```tsx
const renderTags = (
  value: StaffUserProfileOption[],
  getTagProps: AutocompleteRenderGetTagProps,
) => {
  return value.map((option, index) => {
    const { key, ...tagProps } = getTagProps({ index });

    return (
      <Tooltip key={option.id} title={option.name} placement="top">
        <Chip
          {...tagProps}
          label={option.name}
          sx={{
            maxWidth: '100%',
            height: 'auto',
            alignItems: 'flex-start',
            '& .MuiChip-label': {
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
              whiteSpace: 'normal',
              lineHeight: 1.25,
              py: 0.5,
            },
          }}
        />
      </Tooltip>
    );
  });
};
```

Wire it into the existing autocomplete:

```tsx
renderTags={renderTags}
```

- [ ] **Step 2: Cap vertical growth and keep the field from distorting adjacent cards**

Add local styling to the autocomplete root:

```tsx
sx={{
  minWidth: 0,
  '& .MuiAutocomplete-inputRoot': {
    alignItems: 'flex-start',
  },
  '& .MuiAutocomplete-tag': {
    maxWidth: '100%',
  },
  '& .MuiAutocomplete-endAdornment': {
    top: 16,
  },
}}
```

Then add constraints to the input container through `slotProps`:

```tsx
slotProps={{
  paper: {
    sx: {
      maxWidth: '100%',
    },
  },
}}
```

And on the rendered text field:

```tsx
TextField
  {...params}
  label={capitalize(t('profiles'))}
  placeholder={t('search')}
  sx={{
    minWidth: 0,
    '& .MuiInputBase-root': {
      maxHeight: 160,
      overflowY: 'auto',
      overflowX: 'hidden',
    },
  }}
```

Expected result: many long chips can grow the field to a controlled height, then the field scrolls internally instead of distorting the page.

- [ ] **Step 3: Verify the broken smoke-test scenario**

Manual verification:

- assign a profile with a very long name
- assign several long-named profiles
- confirm the right-side cards keep the same width
- confirm the field grows only to the cap and then scrolls

Expected: the Image #2 failure mode no longer happens.

### Task 4: Add The Selected Profile Preview Drawer

**Files:**
- Create: `apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-profile-preview-drawer.tsx`
- Modify: `apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-profiles-section.tsx`

- [ ] **Step 1: Create a focused drawer component**

Create the new file with a small prop surface:

```tsx
type StaffUserProfilePreviewDrawerProps = {
  open: boolean;
  onClose: () => void;
  profile: StaffUserProfileOption | null;
};
```

Use the existing route pattern for full navigation:

```tsx
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import capitalize from 'lodash/capitalize';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import DrawerAnchor from '#app/components/drawer-anchor.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
```

Render the drawer with a header, metadata, and the only navigation affordance:

```tsx
<Drawer
  open={open}
  onClose={onClose}
  anchor="right"
  slotProps={{
    paper: {
      sx: {
        width: 480,
        maxWidth: '100%',
      },
    },
  }}
>
  <DrawerAnchor onClick={onClose} aria-label={t('close')} sx={{ left: 0 }}>
    <Iconify icon="mingcute:close-line" width={18} />
  </DrawerAnchor>

  <Stack spacing={3} sx={{ p: 3, pt: 6 }}>
    <Stack spacing={0.5}>
      <Typography variant="h4">
        {profile?.name ?? t('profile')}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {profile?.description ?? t('no-description')}
      </Typography>
    </Stack>

    <Link
      href={profile?.id ? FRONT_PATH_NAMES.staff.profiles.details(profile.id) : '#'}
      underline="none"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        fontWeight: 600,
      }}
    >
      {capitalize(t('open-profile-details'))}
      <Iconify icon="solar:arrow-right-up-linear" width={18} />
    </Link>
  </Stack>
</Drawer>
```

If `FRONT_PATH_NAMES.staff.profiles.details(...)` differs, use the existing profile-details route helper already defined in the repo.

- [ ] **Step 2: Add drawer state to the profiles section**

In `staff-user-profiles-section.tsx`, add:

```tsx
import { useState } from 'react';

import StaffUserProfilePreviewDrawer from './staff-user-profile-preview-drawer';
```

Then add local state:

```tsx
const [previewedProfile, setPreviewedProfile] =
  useState<StaffUserProfileOption | null>(null);
```

Use that state inside `renderTags`:

```tsx
onClick={(event) => {
  event.stopPropagation();
  setPreviewedProfile(option);
}}
```

Only the chip body opens the drawer. Do not add keyboard handlers for drawer opening.

- [ ] **Step 3: Render the drawer below the card content**

Append:

```tsx
<StaffUserProfilePreviewDrawer
  open={previewedProfile != null}
  onClose={() => setPreviewedProfile(null)}
  profile={previewedProfile}
/>
```

Expected behavior: mouse-clicking a selected pill opens a right drawer preview, and full navigation is available only inside that drawer.

### Task 5: Verify The Full UX End-To-End

**Files:**
- Verify: `apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-update-form.tsx`
- Verify: `apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-profiles-section.tsx`
- Verify: `apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-profile-preview-drawer.tsx`

- [ ] **Step 1: Run frontend type checking**

Run:

```powershell
just tsc-front
```

Expected: PASS.

- [ ] **Step 2: Run frontend lint/format autofix**

Run:

```powershell
just check-write
```

Expected: PASS, or only existing unrelated issues outside this slice.

- [ ] **Step 3: Execute manual smoke verification**

Validate all of the following on the staff user details page:

- user with short values and user with long values have the same left/right card widths
- long email truncates with tooltip
- one long assigned profile name does not distort the layout
- several long assigned profile names do not distort the layout
- clicking a selected profile pill opens the preview drawer
- there is no direct navigation from the pill itself
- the drawer includes the explicit action to open the full profile details page

Expected: all branch follow-up UX requirements from the spec are satisfied.

## Self-Review

### Spec coverage

- Desktop width invariance: covered by Tasks 1 and 2.
- Long-content containment: covered by Tasks 2 and 3.
- Selected profile preview drawer: covered by Task 4.
- Smoke-test verification: covered by Task 5.

### Placeholder scan

- No `TODO`, `TBD`, or deferred “write tests later” placeholders remain.
- One route helper reference in Task 4 includes a fallback note because the exact helper name may differ; resolve it by using the existing staff profile details route constant already present in the repo rather than inventing a new one.

### Type consistency

- `StaffUserProfileOption` is reused as the preview drawer input type.
- Drawer state is `StaffUserProfileOption | null` throughout the plan.
- The autocomplete remains the canonical assignment UI; no conflicting alternative control is introduced.
