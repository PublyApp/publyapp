# Staff Profile Creation - 2-Step Form Implementation Plan

## Overview
Implement a 2-step form for creating staff profiles with validation, permissions management, and user assignment.

## Requirements

### Single Page Form
- **Section 1: Profile Details**
  - Name (required)
  - Description (optional)

- **Section 2: Assign Users**
  - Autocomplete input for emails
  - Multiple values allowed (chips)
  - Free text entry (freeSolo)
  - Email validation per tag

- **Section 3: Permissions**
  - Grouped by module
  - Toggle switches

### Technical Constraints
- Single API call for creation + assignment
- Validation schema for all fields
- FloatingCard for submit action

---

## Implementation Plan

### Phase 1: Validation Schema & Types

#### 1.1 Create Staff Profile Validation Schema
**File**: `packages/shared/validations/staff-profile.validations.ts`

```typescript
export const getNewStaffProfileSchema = (z: InterZod) => {
  return z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    permissions: z.array(z.string()).default([]),
    emails: z.array(z.string().email()).default([]),
  });
};
```

#### 1.2 Add i18n Keys
**Files**:
- `packages/shared/lib/i18n/json/common.en.json`
- `packages/shared/lib/i18n/json/common.fr.json`

**Keys to add**:
```json
{
  "profile-name": "Profile name",
  "profile-description": "Profile description",
  "profile-permissions": "Profile permissions",
  "assign-users": "Assign users",
  "user-emails": "User emails",
  "enter-emails": "Enter email addresses...",
  "profile-details": "Profile details",
  "create-profile": "Create profile",
  "profile-created-successfully": "Profile created successfully"
}
```

---

### Phase 2: API Integration

#### 2.1 Create/Update React Query Hooks
**File**: `apps/front/app/lib/react-query/features/staff/staff-profile.hooks.ts`

**Hooks to add/verify**:

```typescript
// Query: Fetch available permissions from API
export const useFindStaffPermissions = createQuery({
  queryKey: ['client.staff.permissions.get'] as const,
  fetcher: async () => {
    const result = await clientManager.apiClient.staff.permissions.get();
    if (_.isNil(result)) {
      throw new Error('Permissions result is nil');
    }
    return result;
  },
});

// Mutation: Create staff profile
export const useCreateStaffProfile = createMutation({
  mutationKey: ['client.staff.profiles.post'] as const,
  mutationFn: async (data: CreateStaffProfilePayload) => {
    const result = await clientManager.apiClient.staff.profiles.post({
      body: data,
    });
    if (_.isNil(result)) {
      throw new Error('Create profile result is nil');
    }
    return result;
  },
});

```

**Types**:
```typescript
type CreateStaffProfilePayload = {
  name: string;
  description?: string;
  permissions: string[];
  emails?: string[];
};
```

---

### Phase 3: Form Components

#### 3.1 Form Component
**File**: `apps/front/app/routes/authed/staff/profiles/new/parts/new-staff-profile-form.tsx`

**Structure**:
```tsx
import { useFormContext } from 'react-hook-form';
import { Field } from '@/front/components/hook-form/fields';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';

const NewStaffProfileForm = () => {
  const { t } = useTranslate();
  const { data: permissions, isLoading } = useFindStaffPermissions();

  return (
    <Stack spacing={3}>
      {/* Basic Info Card */}
      <Card>
        <CardHeader title={t('profile-details')} />
        <CardContent>
          <Box sx={{ rowGap: 3, columnGap: 2, display: 'grid' }}>
            <Field.Text name="name" label={t('name')} required />
            <Field.Text
              name="description"
              label={t('description')}
              multiline
              rows={4}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Assign Users Card */}
      <Card>
        <CardHeader title={t('assign-users')} />
        <CardContent>
          <Field.Autocomplete
            name="emails"
            label={t('user-emails')}
            placeholder={t('enter-emails')}
            multiple
            freeSolo
            options={[]}
            renderTags={(value: string[], getTagProps) =>
              value.map((option: string, index: number) => (
                <Chip
                  variant="soft"
                  label={option}
                  {...getTagProps({ index })}
                />
              ))
            }
          />
        </CardContent>
      </Card>

      {/* Permissions Card */}
      <Card>
        <CardHeader title={t('permissions')} />
        <CardContent>
          {isLoading ? (
            <CircularProgress />
          ) : (
            // ... Permission list implementation
          )}
        </CardContent>
      </Card>
    </Stack>
  );
};
```

---

### Phase 4: Main Page with Stepper

#### 4.1 Update Main Page
**File**: `apps/front/app/routes/authed/staff/profiles/new/new-staff-profile-page.tsx`

**Key Changes**:

1. **Form Setup**:
```tsx
const form = useForm({
  mode: 'onSubmit',
  resolver: zodResolver(getNewStaffProfileSchema(defaultZodClient)),
  defaultValues: {
    name: '',
    description: '',
    permissions: [],
    emails: [],
  },
});
```

2. **Layout Structure**:
```tsx
return (
  <DashboardContent {...contentProps}>
    <CustomBreadcrumbs {...breadcrumbProps} />

    <Form methods={form} onSubmit={onSubmit}>
      <NewStaffProfileForm />

      <CreateStaffProfileActions
        isPending={isPending}
      />
    </Form>
  </DashboardContent>
);
```

const onSubmit = form.handleSubmit((data) => {
  createProfile({
    name: data.name,
    description: data.description,
    permissions: data.permissions,
    emails: data.emails,
  });
});
```

5. **Layout Structure**:
```tsx
return (
  <DashboardContent {...contentProps}>
    <CustomBreadcrumbs {...breadcrumbProps} />

    {/* Stepper */}
    <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
      {steps.map((step) => (
        <Step key={step.label}>
          <StepLabel>{step.label}</StepLabel>
        </Step>
      ))}
    </Stepper>

    {/* Form */}
    <Form methods={form} onSubmit={onSubmit}>
      <Stack spacing={3}>
        {/* Render current step component */}
        {activeStep === 0 && <NewStaffProfileFormStep1 />}
        {activeStep === 1 && <NewStaffProfileFormStep2 />}
      </Stack>

      {/* FloatingCard with controls */}
      <CreateStaffProfileActions
        activeStep={activeStep}
        isLastStep={activeStep === steps.length - 1}
        onNext={handleNext}
        onBack={handleBack}
        isPending={isPending}
      />
    </Form>
  </DashboardContent>
);
```

#### 4.2 Update FloatingCard Actions
**Component**: `CreateStaffProfileActions` (in same file)

```tsx
type CreateStaffProfileActionsProps = {
  isPending: boolean;
};

const CreateStaffProfileActions = ({
  isPending,
}: CreateStaffProfileActionsProps) => {
  const { t } = useTranslate();

  return (
    <FloatingCard
      placement="bottom-center"
      offset={20}
      elevation={6}
      sx={{
        position: 'absolute',
        borderRadius: 2,
        display: 'flex',
        gap: 2,
        maxWidth: 700,
        padding: 1,
      }}
    >
      <Button
        type="submit"
        variant="contained"
        disabled={isPending}
      >
        {_.capitalize(t('create-profile'))}
      </Button>
    </FloatingCard>
  );
};
```

---

### Phase 5: Error Handling & UX

#### 5.1 Validation Error Display
- Use existing `Field.*` components which handle error display automatically
- Form-level errors shown via toast notifications

#### 5.2 Loading States
- Show loading spinner when fetching permissions
- Disable buttons during submission
- Show loading state in FloatingCard

#### 5.3 Success Flow
- Create profile (with emails included in payload)
- Backend handles transaction
- Show success toast
- Redirect to profiles list
- Invalidate profiles query cache

#### 5.4 Edge Cases
- Empty permissions selection (allow)
- No emails in step 2 (allow - optional)
- API errors (show error toast with message)
- Network failures (retry logic from react-query)

---

## File Structure Summary

```
packages/shared/
  └── validations/
      └── staff-profile.validations.ts (NEW)
  └── lib/i18n/json/
      ├── common.en.json (UPDATE)
      └── common.fr.json (UPDATE)

apps/front/app/
  └── lib/react-query/features/staff/
      └── staff-profile.hooks.ts (UPDATE - add mutations/queries)
  └── routes/authed/staff/profiles/new/
      ├── new-staff-profile-page.tsx (UPDATE - major changes)
      └── parts/
          └── new-staff-profile-form.tsx (NEW)
```

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Create `staff-profile.validations.ts` with schemas
- [ ] Add i18n keys to `common.en.json`
- [ ] Add i18n keys to `common.fr.json`

### Phase 2: API Layer
- [ ] Add `useFindStaffPermissions` query hook
- [ ] Add `useCreateStaffProfile` mutation hook (with emails support)
- [ ] Verify API client endpoints exist

### Phase 3: Components
- [ ] Implement `NewStaffProfileForm`
  - [ ] Basic info section (name, description)
  - [ ] Assign Users section (Autocomplete)
  - [ ] Permissions section (API data + toggles)

### Phase 4: Main Page
- [ ] Setup react-hook-form with validation
- [ ] Update `CreateStaffProfileActions` component
- [ ] Implement form submission logic
- [ ] Add success/error handling

### Phase 5: Polish
- [ ] Test validation on each step
- [ ] Test form submission flow
- [ ] Test error scenarios
- [ ] Test with no emails (should work)
- [ ] Test with no permissions (should work)
- [ ] Add loading states
- [ ] Ensure responsive design
- [ ] Test i18n (EN/FR)

---

## Technical Notes

### Form State Management
- Single form instance
- Full validation on submission

### Autocomplete Handling
- `freeSolo` enabled for custom email entry
- `multiple` enabled for array of emails
- `options` empty (or recent emails if available)
- `renderTags` for custom chip display

---

## Future Enhancements (Optional)
- Add ability to skip step 2
- Save draft functionality
- Duplicate existing profile feature
- Bulk email import (CSV/paste)
- Permission presets/templates
