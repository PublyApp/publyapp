# Implementation Plan: Staff Profiles Table Component

## Overview

Complete the `staff-profiles-table.tsx` component to display a list of staff profiles with cursor-based pagination, sorting, and actions.

**File:** `apps/front/app/routes/authed/staff/profiles/list/parts/staff-profiles-table.tsx`

## Current State

The component is a placeholder with only a template link:
```tsx
const StaffProfilesTable = () => {
	return (
		<div>
			<RouterLink href={FRONT_PATH_NAMES.staff.profiles.details(uuidv7()).root}>
				Go to profile details (template)
			</RouterLink>
		</div>
	);
};
```

## Target Implementation

Build a fully functional table component that displays staff profiles with:
- **Cursor-based pagination** (following the keyset pagination pattern)
- **Multi-column sorting** (name, created_at, user_account_count)
- **Profile details** (name, description, user account count)
- **Actions** (view details, delete)
- **Loading states**
- **Error handling**

## ✅ Cursor Pagination: Already Solved!

**Good news:** Cursor pagination is **fully supported** by our `useTableState` hook!

Simply use `paginationMode: 'cursor'` and the hook provides:
- ✅ Automatic cursor management
- ✅ URL query param synchronization
- ✅ Next/previous page navigation
- ✅ Auto-reset on sort/limit changes
- ✅ `setNextCursor()` method for API response
- ✅ `hasMorePages` state tracking

**No custom cursor code needed!** See [Phase 6](#phase-6-verify-cursor-pagination-integration) for details.

**Hook Location:** `apps/front/app/hooks/use-table-state.ts`

## Reference Implementations

Use these existing components as patterns:
- **Primary Reference:** `apps/front/app/routes/authed/staff/tenants/list/parts/tenants-table.tsx`
- **Secondary Reference:** `apps/front/app/routes/authed/staff/staff-members/list/parts/staff-members-table.tsx`

## API Endpoint

**Endpoint:** `GET /api/staff/profiles`

**Query Parameters:**
- `cursor` (string, optional) - Cursor for pagination (Guid)
- `limit` (string, optional) - Number of items per page
- `sortId` (string, optional) - Field to sort by: `id`, `name`, `created_at`, `user_account_count`
- `sortOrder` (string, optional) - Sort direction: `asc`, `desc`

**Response Schema:** `FindStaffProfilesResult`
```typescript
{
  data: StaffProfileItem[];
  nextCursor: string | null;
}
```

**StaffProfileItem Schema:**
```typescript
{
  id: string;              // UUID
  name: string;
  description: string | null;
  userAccountCount: number;
}
```

## Implementation Steps

### Phase 1: Create React Query Hook

**File:** `apps/front/app/lib/react-query/features/staff/staff-profile.hooks.ts` (new file)

#### 1.1 Create Hook File Structure

```typescript
import _ from 'lodash';
import { createQuery } from 'react-query-kit';
import { clientManager } from '@/front/lib/js-client/client-manager';
import type { ApiClient } from '@/js-client/src/apiClient';
import { getQueryKey } from '../../query-utils';
```

#### 1.2 Define Query Parameters Type

```typescript
type FindStaffProfilesParams = {
	cursor?: string;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
};
```

#### 1.3 Create Query Key

```typescript
const findStaffProfilesQueryKey = getQueryKey<ApiClient>(
	(client) => client.staff.profiles.get,
);
```

#### 1.4 Implement useFindStaffProfiles Hook

```typescript
export const useFindStaffProfiles = createQuery({
	queryKey: [findStaffProfilesQueryKey] as const,
	fetcher: async (params: FindStaffProfilesParams) => {
		const result = await clientManager.apiClient.staff.profiles.get({
			queryParameters: {
				cursor: params.cursor,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
			},
		});

		if (_.isNil(result)) {
			throw new Error(`[${findStaffProfilesQueryKey}] result is nil`);
		}

		return result;
	},
});
```

**Acceptance Criteria:**
- [ ] Hook file created with proper imports
- [ ] Query parameters type defined correctly
- [ ] Query key created using the pattern
- [ ] Fetcher function handles cursor-based pagination
- [ ] Error handling for nil results

---

### Phase 2: Define Row Data Types and Mapper

**File:** `apps/front/app/routes/authed/staff/profiles/list/parts/staff-profiles-table.tsx`

#### 2.1 Import Required Dependencies

```typescript
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { useMemo } from 'react';
import { Iconify } from '@/front/components/iconify/iconify';
import { Label } from '@/front/components/label/label';
import { RouterLink } from '@/front/components/router-link';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTableState } from '@/front/hooks/use-table-state';
import { useTranslate } from '@/front/hooks/use-translate';
import { useFindStaffProfiles } from '@/front/lib/react-query/features/staff/staff-profile.hooks';
import type { StaffProfileItem } from '@/js-client/src/models';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
} from '@/shared/lib/constants';
```

#### 2.2 Define Row Data Type

```typescript
export type StaffProfileRowData = {
	id: string;
	name: string;
	description: string | null;
	userAccountCount: number;
};
```

#### 2.3 Create Row Data Mapper

```typescript
const StaffProfileRowDataMapper = (
	profile: StaffProfileItem,
): StaffProfileRowData => {
	return {
		id: profile.id || '',
		name: profile.name || '-',
		description: profile.description || null,
		userAccountCount: profile.userAccountCount || 0,
	};
};
```

#### 2.4 Create Column Helper

```typescript
const columnHelper = createMRTColumnHelper<StaffProfileRowData>();
```

#### 2.5 Define Default Sorting

```typescript
const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};
```

**Acceptance Criteria:**
- [ ] All required dependencies imported
- [ ] Row data type matches API response structure
- [ ] Mapper handles null/undefined values safely
- [ ] Column helper created with correct type
- [ ] Default sorting set to created_at descending

---

### Phase 3: Implement Table Component

#### 3.1 Create Component Structure

```typescript
const StaffProfilesTable = () => {
	const { t } = useTranslate();

	// Column definitions
	const columns = useMemo(() => {
		return [
			// Will be implemented in Phase 4
		];
	}, [t]);

	// Table state management with CURSOR MODE enabled
	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
		setNextCursor,      // ← Update cursor from API
	} = useTableState({
		defaultSorting,
		defaultPageSize: DEFAULT_PAGE_SIZE,
		paginationMode: 'cursor',  // ← Enable cursor pagination
	});

	// Data fetching with cursor from apiVariables
	const { data, isPending } = useFindStaffProfiles({
		variables: apiVariables,  // Already includes cursor!
	});

	// Update cursor when API response changes
	useEffect(() => {
		if (data?.nextCursor !== undefined) {
			setNextCursor(data.nextCursor);  // Update cursor for next page
		}
	}, [data?.nextCursor, setNextCursor]);

	// Transform data
	const dataTable = useMemo(() => {
		return _.map(data?.data, (profile) => StaffProfileRowDataMapper(profile));
	}, [data]);

	// Table configuration
	const table = useMRTTable('default', {
		columns,
		data: dataTable,
		rowCount: data?.totalCount || 0,  // Total count across all pages
		manualPagination: true,
		onPaginationChange: handlePaginationChange,  // Handles cursor logic
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			density: 'compact',
			isLoading: isPending,
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
	});

	return (
		<Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
			<MaterialReactTable table={table} />
		</Box>
	);
};
```

#### 3.2 Add Required Import

Don't forget to import `useEffect`:

```typescript
import { useMemo, useEffect } from 'react';
```

**Acceptance Criteria:**
- [ ] Component uses useTranslate hook
- [ ] Table state configured with `paginationMode: 'cursor'`
- [ ] `setNextCursor` destructured from hook
- [ ] Data fetching uses `apiVariables` (which includes cursor)
- [ ] useEffect updates cursor from API response
- [ ] Data transformation with useMemo
- [ ] Table configuration includes loading state
- [ ] Card wrapper with proper flex layout

---

### Phase 4: Define Table Columns

#### 4.1 Name Column with Avatar

```typescript
columnHelper.accessor('name', {
	header: t('name'),
	Cell: ProfileNameCell,
	size: 300,
}),
```

#### 4.2 Description Column

```typescript
columnHelper.accessor('description', {
	header: t('description'),
	Cell: (props) => {
		const description = props.cell.getValue();
		return (
			<Box sx={{ color: description ? 'text.primary' : 'text.disabled' }}>
				{description || '-'}
			</Box>
		);
	},
	size: 400,
}),
```

#### 4.3 User Account Count Column

```typescript
columnHelper.accessor('userAccountCount', {
	header: t('user-accounts'),
	Cell: (props) => {
		const count = props.cell.getValue();
		return (
			<Label variant="soft" color={count > 0 ? 'info' : 'default'}>
				{count}
			</Label>
		);
	},
	size: 120,
}),
```

#### 4.4 Actions Column

```typescript
columnHelper.display({
	header: 'Actions',
	Cell: ProfileActionsCell,
	size: 100,
}),
```

**Acceptance Criteria:**
- [ ] All columns defined with proper accessors
- [ ] Column headers use translation keys
- [ ] Custom cell renderers created
- [ ] Column sizes appropriate for content
- [ ] Actions column is display type (not data-bound)

---

### Phase 5: Implement Cell Components

#### 5.1 ProfileNameCell Component

```typescript
const ProfileNameCell: MRT_ColumnDef<StaffProfileRowData, string>['Cell'] = (props) => {
	const name = props.row.original.name;
	const href = FRONT_PATH_NAMES.staff.profiles.details(
		props.row.original.id,
	).root;

	return (
		<Box
			sx={{
				py: 1,
				gap: 2,
				width: 1,
				display: 'flex',
				alignItems: 'center',
			}}
		>
			<Avatar
				alt={name}
				variant="rounded"
				sx={{ width: 40, height: 40 }}
			>
				{name.charAt(0).toUpperCase()}
			</Avatar>

			<ListItemText
				primary={
					<Link component={RouterLink} href={href} color="inherit">
						{name}
					</Link>
				}
				secondary={props.row.original.id}
				slotProps={{
					primary: { noWrap: true },
					secondary: { sx: { color: 'text.disabled', fontSize: '0.75rem' } },
				}}
			/>
		</Box>
	);
};
```

#### 5.2 ProfileActionsCell Component

```typescript
const ProfileActionsCell: MRT_ColumnDef<StaffProfileRowData>['Cell'] = (props) => {
	const profileId = props.row.original.id;
	const { t } = useTranslate();

	const handleDelete = () => {
		// TODO: Implement delete functionality
		console.log('Delete profile:', profileId);
	};

	return (
		<Box
			sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
		>
			<Tooltip title={t('view-details')} placement="top" arrow>
				<IconButton
					color={'default'}
					LinkComponent={RouterLink}
					href={FRONT_PATH_NAMES.staff.profiles.details(profileId).root}
					size="small"
				>
					<Iconify icon="solar:eye-bold" />
				</IconButton>
			</Tooltip>

			<Tooltip title={t('delete')} placement="top" arrow>
				<IconButton
					color={'default'}
					onClick={handleDelete}
					sx={{ color: 'error.main' }}
					size="small"
				>
					<Iconify icon="solar:trash-bin-trash-bold" />
				</IconButton>
			</Tooltip>
		</Box>
	);
};
```

**Acceptance Criteria:**
- [ ] ProfileNameCell displays avatar with first letter
- [ ] Profile name is clickable link to details page
- [ ] Profile ID shown as secondary text
- [ ] ProfileActionsCell has view and delete buttons
- [ ] Tooltips display on hover
- [ ] Icons use Iconify component

---

### Phase 6: Verify Cursor Pagination Integration

**Note:** ✅ Cursor pagination is **fully handled** by the `useTableState` hook when using `paginationMode: 'cursor'`!

#### 6.1 What the Hook Already Provides

The `useTableState` hook with `paginationMode: 'cursor'` automatically handles:

1. **Cursor state management** - Manages cursor value in URL query params
2. **Next page navigation** - Advances to next page using cursor
3. **Previous page / Reset** - Resets cursor to first page when going backward
4. **Auto-reset on sort** - Clears cursor when sorting changes
5. **Page size changes** - Resets cursor when limit changes
6. **URL sync** - Keeps cursor in URL for shareable links
7. **Page index tracking** - Internal state for MaterialReactTable UI

#### 6.2 How It Works

```typescript
// 1. Hook provides cursor in apiVariables
const { apiVariables, setNextCursor } = useTableState({
	paginationMode: 'cursor',
});

// apiVariables structure:
// {
//   limit: 20,
//   cursor: "018c-uuid-here" | null,
//   sort: { id: "name", order: "asc" }
// }

// 2. API call uses cursor automatically
const { data } = useFindStaffProfiles({
	variables: apiVariables,  // cursor is included!
});

// 3. Update cursor from API response
useEffect(() => {
	if (data?.nextCursor !== undefined) {
		setNextCursor(data.nextCursor);  // Hook updates URL & state
	}
}, [data?.nextCursor, setNextCursor]);

// 4. Pagination buttons handled by MaterialReactTable
// - Next button: Increments pageIndex → hook keeps cursor
// - Previous button: Decrements pageIndex → hook resets cursor
// - Hook's handlePaginationChange handles all logic
```

#### 6.3 Testing Cursor Pagination

Manual test checklist:

1. **First Page Load**
   - [ ] URL has no cursor param
   - [ ] apiVariables.cursor is null
   - [ ] Data loads correctly

2. **Navigate to Next Page**
   - [ ] Click next page button
   - [ ] URL updates with cursor param (e.g., `?cursor=018c-uuid`)
   - [ ] API called with cursor value
   - [ ] Second page data displays

3. **Navigate Back to First Page**
   - [ ] Click previous page button
   - [ ] URL cursor param removed
   - [ ] API called without cursor
   - [ ] First page data displays again

4. **Change Sort Order**
   - [ ] Change sorting column
   - [ ] Cursor automatically resets (removed from URL)
   - [ ] API called without cursor
   - [ ] Data re-sorted from first page

5. **Change Page Size**
   - [ ] Change items per page
   - [ ] Cursor automatically resets
   - [ ] API called with new limit, no cursor

6. **Share URL with Cursor**
   - [ ] Copy URL with cursor param
   - [ ] Open in new tab
   - [ ] Correct page loads based on cursor

**Acceptance Criteria:**
- [x] ✅ No custom cursor state needed (hook provides it)
- [x] ✅ Cursor automatically included in apiVariables
- [x] ✅ setNextCursor updates cursor from API response
- [x] ✅ handlePaginationChange manages all navigation
- [x] ✅ Cursor resets on sort/limit changes
- [x] ✅ URL stays in sync with cursor state

---

### Phase 7: Add Loading and Empty States

#### 7.1 Empty State

```typescript
if (!isPending && (!data?.data || data.data.length === 0)) {
	return (
		<Card sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 3 }}>
			<Box
				sx={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					minHeight: 400,
					gap: 2,
				}}
			>
				<Iconify
					icon="solar:inbox-line-bold"
					width={64}
					sx={{ color: 'text.disabled' }}
				/>
				<Box sx={{ textAlign: 'center' }}>
					<Box sx={{ typography: 'h6', color: 'text.secondary' }}>
						{t('no-items-found', { item: t('profiles') })}
					</Box>
					<Box sx={{ typography: 'body2', color: 'text.disabled', mt: 0.5 }}>
						{t('create-first-item', { item: t('profile') })}
					</Box>
				</Box>
			</Box>
		</Card>
	);
}
```

#### 7.2 Error State

Add error boundary or error handling:

```typescript
const { data, isPending, error } = useFindStaffProfiles({
	variables: apiVariablesWithCursor,
});

if (error) {
	return (
		<Card sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 3 }}>
			<Box sx={{ color: 'error.main', textAlign: 'center' }}>
				{t('error-loading-items', { item: t('profiles') })}
			</Box>
		</Card>
	);
}
```

**Acceptance Criteria:**
- [ ] Empty state displayed when no data
- [ ] Empty state has icon and helpful message
- [ ] Error state handles query errors
- [ ] Loading state shown via table configuration

---

### Phase 8: Add Delete Functionality (Optional/Future)

#### 8.1 Create Delete Mutation Hook

In `staff-profile.hooks.ts`:

```typescript
export const useDeleteStaffProfile = createMutation({
	mutationKey: ['deleteStaffProfile'] as const,
	mutationFn: async (params: { profileId: string }) => {
		// TODO: Implement when API endpoint is ready
		throw new Error('Delete endpoint not implemented yet');
	},
});
```

#### 8.2 Add Confirmation Dialog

```typescript
import { ConfirmDialog } from '@/front/components/custom-dialog/confirm-dialog';
import { useBoolean } from 'minimal-shared/hooks';

const ProfileActionsCell: MRT_ColumnDef<StaffProfileRowData>['Cell'] = (props) => {
	const profileId = props.row.original.id;
	const profileName = props.row.original.name;
	const { t } = useTranslate();
	const confirmDialog = useBoolean();

	const handleConfirmDelete = () => {
		// TODO: Call delete mutation
		toast.warning('Delete functionality not implemented yet');
		confirmDialog.onFalse();
	};

	return (
		<>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
				{/* View button */}
				<Tooltip title={t('view-details')} placement="top" arrow>
					<IconButton
						color={'default'}
						LinkComponent={RouterLink}
						href={FRONT_PATH_NAMES.staff.profiles.details(profileId).root}
						size="small"
					>
						<Iconify icon="solar:eye-bold" />
					</IconButton>
				</Tooltip>

				{/* Delete button */}
				<Tooltip title={t('delete')} placement="top" arrow>
					<IconButton
						color={'default'}
						onClick={confirmDialog.onTrue}
						sx={{ color: 'error.main' }}
						size="small"
					>
						<Iconify icon="solar:trash-bin-trash-bold" />
					</IconButton>
				</Tooltip>
			</Box>

			{/* Confirmation Dialog */}
			<ConfirmDialog
				open={confirmDialog.value}
				onClose={confirmDialog.onFalse}
				title={t('delete-item', { item: t('profile') })}
				content={`${t('confirm-delete-dialog-text')} "${profileName}"?`}
				action={
					<Button variant="contained" color="error" onClick={handleConfirmDelete}>
						{t('delete')}
					</Button>
				}
			/>
		</>
	);
};
```

**Acceptance Criteria:**
- [ ] Delete mutation hook created (placeholder)
- [ ] Confirmation dialog shows before delete
- [ ] Dialog displays profile name
- [ ] Delete button triggers mutation (when implemented)
- [ ] Success/error toasts shown

---

## Testing Checklist

### Unit Testing
- [ ] Row data mapper handles null/undefined values
- [ ] Column definitions render correctly
- [ ] Cell components display expected content

### Integration Testing
- [ ] Hook fetches data from correct endpoint
- [ ] Pagination works with cursor
- [ ] Sorting updates API call
- [ ] Loading states display correctly
- [ ] Empty state shows when no data
- [ ] Error handling works

### Manual Testing
- [ ] Table loads and displays profiles
- [ ] Clicking profile name navigates to details
- [ ] Sorting by different columns works
- [ ] Pagination controls work
- [ ] View details button navigates correctly
- [ ] Delete button shows confirmation (if implemented)
- [ ] Responsive layout works on mobile

---

## Translation Keys Required

Add these keys to `packages/shared/lib/i18n/json/response-message.en.json`:

```json
{
	"profiles": "profiles",
	"profile": "profile",
	"staff-profiles": "staff profiles",
	"user-accounts": "user accounts",
	"no-items-found": "no {{item}} found",
	"create-first-item": "create your first {{item}}",
	"error-loading-items": "error loading {{item}}",
	"view-details": "view details",
	"delete-item": "delete {{item}}",
	"confirm-delete-dialog-text": "are you sure you want to delete this item?"
}
```

---

## Dependencies

### NPM Packages (Already Installed)
- `@mui/material` - UI components
- `material-react-table` - Table component
- `react-query-kit` - Query hook factory
- `lodash` - Utility functions
- `minimal-shared` - Shared utilities

### Internal Dependencies
- `@/front/hooks/use-table-state` - Table state management
- `@/front/hooks/use-mrt-table` - MRT table configuration
- `@/front/hooks/use-translate` - Translation hook
- `@/front/components/*` - UI components

---

## Known Issues & Considerations

### 1. ✅ Cursor Pagination (RESOLVED)
- **Status:** ✅ Fully supported by `useTableState` hook
- **Solution:** Use `paginationMode: 'cursor'` - no custom code needed
- **Features:** Auto cursor management, URL sync, reset on sort/limit changes
- **Backward Navigation:** Hook resets to first page automatically

### 2. ❌ Total Count (REMOVED)
- **Status:** ❌ `TotalCount` removed from `CursorPaginatedResult<T>` - not needed for cursor pagination
- **Reason:** Total count is expensive (COUNT query) and not needed for Previous/Next navigation
- **Impact:** Tables don't show "Showing 1-20 of 150" indicators - just Previous/Next buttons
- **Decision:** Aligns with cursor pagination best practices - better performance, simpler implementation

### 3. ❌ Deep Link Page Numbers (REMOVED)
- **Status:** ❌ `CurrentOffset` feature removed - not needed for cursor pagination with Previous/Next buttons
- **Reason:** Cursor pagination doesn't support page numbers - only Previous/Next navigation
- **Impact:** Shared URLs with cursors will start from first page (Previous button resets to beginning)
- **Decision:** Simplified UI with no page numbers aligns with cursor pagination limitations

### 4. Delete API Endpoint
- **Status:** May not be implemented yet
- **Action:** Verify endpoint exists before implementing delete functionality
- **Workaround:** Show placeholder/toast message until API is ready

---

## Phase Priority

### Must Have (MVP)
1. ✅ Phase 1: Create React Query Hook
2. ✅ Phase 2: Define Row Data Types
3. ✅ Phase 3: Implement Table Component (includes cursor setup)
4. ✅ Phase 4: Define Table Columns
5. ✅ Phase 5: Implement Cell Components
6. ✅ Phase 6: Verify Cursor Pagination (testing only - hook handles it!)
7. ✅ Phase 7: Add Loading and Empty States

### Nice to Have (Future Enhancement)
8. ⏳ Phase 8: Add Delete Functionality (pending API endpoint)

---

## Estimated Timeline

- **Phase 1:** 30 minutes - Create React Query Hook
- **Phase 2:** 15 minutes - Define Row Data Types
- **Phase 3:** 45 minutes - Implement Table Component (includes cursor setup)
- **Phase 4:** 20 minutes - Define Table Columns
- **Phase 5:** 45 minutes - Implement Cell Components
- **Phase 6:** 15 minutes - Verify Cursor Pagination (testing/validation)
- **Phase 7:** 30 minutes - Add Loading and Empty States
- **Phase 8:** 1 hour - Add Delete Functionality (if API ready)

**Total Estimated Time (MVP):** ~3 hours (Phases 1-7)
**Total with Delete:** ~4 hours (Phases 1-8)

---

## Success Criteria

The implementation is complete when:
- [ ] Table displays all staff profiles from API
- [ ] Users can sort by name, created date, and user count
- [ ] Pagination works with cursor-based navigation
- [ ] Clicking profile name navigates to details page
- [ ] Empty state shows when no profiles exist
- [ ] Loading state displays during data fetch
- [ ] Error states handled gracefully
- [ ] All TypeScript types are correct
- [ ] Component matches design system patterns
- [ ] Translation keys are properly defined
- [ ] Code follows project conventions

---

## Next Steps After Completion

1. **Performance Optimization**
   - Add React.memo if needed
   - Optimize re-renders
   - Consider virtualization for large lists

2. **Feature Enhancements**
   - Add search/filter functionality
   - Add bulk actions
   - Add export functionality
   - Add column visibility controls

3. **Accessibility**
   - Verify keyboard navigation
   - Add ARIA labels
   - Test with screen readers

4. **Analytics**
   - Track table interactions
   - Monitor performance metrics
   - Track user behavior

---

## Reference Documentation

- **Cursor Pagination Guide:** `docs/guides/CURSOR_KEYSET_PAGINATION_GUIDE.md`
- **useTableState Hook:** `apps/front/app/hooks/use-table-state.ts`
- **Material React Table:** https://www.material-react-table.com/
- **React Query Kit:** https://github.com/liaoliao666/react-query-kit
- **MUI Components:** https://mui.com/material-ui/

---

## Revision History

### v2.4 - 2025-01-16
**Removed TotalCount Support**
- ❌ Removed `TotalCount` property from `CursorPaginatedResult<T>` base class
- ❌ Removed COUNT query from `FindStaffProfilesAsync` service method
- ❌ Removed `TotalCount` mapping from FindStaffProfiles handler
- ❌ Removed `rowCount` from frontend table configuration
- ✅ Better performance - no COUNT query overhead
- ✅ Simpler implementation - cursor pagination without total count
- **Reason:** Total count is expensive and not needed for Previous/Next navigation; aligns with cursor pagination best practices

### v2.3 - 2025-01-16
**Removed CurrentOffset Support**
- ❌ Removed `CurrentOffset` property from `CursorPaginatedResult<T>` base class
- ❌ Removed offset calculation from API service (simplified STEP 3)
- ❌ Removed `setCurrentOffset()` usage from frontend component
- ✅ Updated pagination to show only Previous/Next buttons (no page numbers)
- ✅ Simplified cursor pagination - aligns with UX best practices for large datasets
- **Reason:** Cursor pagination is incompatible with page numbers; Previous/Next navigation is the correct pattern

### v2.2 - 2025-01-15 (DEPRECATED)
**Deep Link Page Numbers Support Added** (Later removed in v2.3)
- ✅ Added `CurrentOffset` property to `CursorPaginatedResult<T>` base class
- ✅ Implemented offset calculation in all 4 sort handlers (id, name, created_at, user_account_count)
- ✅ Added `setCurrentOffset()` method to `useTableState` hook in cursor mode
- ✅ Updated Phase 3 code example to use `setCurrentOffset()` for automatic page index updates
- ✅ Resolved deep link page number issue - shared URLs show correct page ("Page 3" not "Page 1")
- ✅ Performance: 50-200ms offset query overhead (acceptable for staff profiles)
- ✅ Added GetOffset method to SortFieldHandler for counting items before cursor

### v2.1 - 2025-01-15
**Total Count Support Added**
- ✅ Added `TotalCount` property to `CursorPaginatedResult<T>` base class
- ✅ Updated `FindStaffProfilesAsync` to return total count
- ✅ Updated Phase 3 code example to use `data?.totalCount` for `rowCount`
- ✅ Resolved Known Issue #2 - total count now available for all cursor endpoints
- ✅ Improved table UX - can now show "Showing 1-20 of 150" instead of "1-20"

### v2.0 - 2025-01-15
**Major Simplification: Cursor Pagination**
- ✅ Removed complex custom cursor management (Phases 6)
- ✅ Discovered `useTableState` hook has built-in cursor support
- ✅ Updated Phase 3 to include cursor mode setup
- ✅ Updated Phase 6 to focus on testing/verification
- ✅ Reduced total estimated time from 4-5 hours to 3 hours (MVP)
- ✅ Updated Known Issues section - cursor limitations resolved

### v1.0 - 2025-01-15
- Initial implementation plan created

---

**Last Updated:** 2025-01-16 (v2.4)
**Author:** AI Assistant
**Status:** ✅ Implemented (Cursor Pagination with Previous/Next Navigation - No Total Count)
