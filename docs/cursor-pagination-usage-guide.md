# Cursor Pagination Usage Guide

## Overview

This guide shows you how to implement cursor-based pagination in your tables using the `cursor-pagination` preset. Cursor pagination is ideal for real-time data, large datasets, and APIs that don't provide total counts.

## Why Use Cursor Pagination?

### Advantages over Offset Pagination

✅ **Better Performance** - No need to count total records
✅ **Real-time Consistency** - New items don't cause page shifts
✅ **Scalability** - Works efficiently with massive datasets
✅ **Simpler API** - Just `cursor` and `limit` parameters

### When to Use

- Large datasets (thousands to millions of records)
- Real-time/frequently updated data
- APIs that return `nextCursor` instead of total count
- Lists where knowing the total count isn't critical

## Quick Start

### Step 1: Update API Hook (if needed)

Your API should support cursor pagination and return a `nextCursor`:

```typescript
// Example API response structure
{
  data: [...],           // Array of items
  nextCursor: "abc123"   // Cursor for next page (null if no more pages)
}
```

### Step 2: Use `useTableState` with Cursor Mode

```typescript
const {
  handlePaginationChange,
  handleSortingChange,
  apiVariables,
  tableState,
  setNextCursor,
  hasNextPage,
  hasPreviousPage,
} = useTableState({
  paginationMode: 'cursor',  // 👈 Enable cursor mode
  defaultSorting,
  defaultPageSize: DEFAULT_PAGE_SIZE,
});
```

### Step 3: Fetch Data with Cursor

```typescript
const { data, isPending } = useYourQuery({
  variables: {
    cursor: apiVariables.cursor || undefined,  // 👈 Use cursor instead of page
    limit: apiVariables.limit,
    sort: apiVariables.sort,
  },
});
```

### Step 4: Feed `nextCursor` Back to Hook

```typescript
useEffect(() => {
  setNextCursor?.(data?.nextCursor);
}, [data?.nextCursor, setNextCursor]);
```

### Step 5: Use Cursor Pagination Preset

```typescript
const table = useMRTTable('cursor-pagination', {  // 👈 Use preset
  columns,
  data: dataTable,
  manualSorting: true,
  onSortingChange: handleSortingChange,
  state: {
    ...tableState,
    isLoading: isPending,
  },
  meta: {  // 👈 Pass cursor metadata
    handlePaginationChange,
    hasNextPage,
    hasPreviousPage,
    isPending,
  },
});
```

## Complete Example

```typescript
import { useEffect, useMemo } from 'react';
import Card from '@mui/material/Card';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTableState } from '@/front/hooks/use-table-state';
import { DEFAULT_PAGE_SIZE } from '@/shared/lib/constants';

type Item = {
  id: string;
  name: string;
  createdAt: string;
};

const MyTable = () => {
  // 1. Define columns
  const columns = useMemo<MRT_ColumnDef<Item>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Name',
    },
    {
      accessorKey: 'createdAt',
      header: 'Created At',
    },
  ], []);

  // 2. Setup table state with cursor mode
  const {
    handlePaginationChange,
    handleSortingChange,
    apiVariables,
    tableState,
    setNextCursor,
    hasNextPage,
    hasPreviousPage,
  } = useTableState({
    paginationMode: 'cursor',
    defaultSorting: { id: 'createdAt', desc: true },
    defaultPageSize: DEFAULT_PAGE_SIZE,
  });

  // 3. Fetch data with cursor
  const { data, isPending } = useYourQuery({
    variables: {
      cursor: apiVariables.cursor || undefined,
      limit: apiVariables.limit,
      sort: apiVariables.sort,
    },
  });

  // 4. Feed nextCursor back to hook
  useEffect(() => {
    setNextCursor?.(data?.nextCursor);
  }, [data?.nextCursor, setNextCursor]);

  // 5. Transform data (optional)
  const dataTable = useMemo(() => {
    return data?.data || [];
  }, [data]);

  // 6. Create table with cursor-pagination preset
  const table = useMRTTable('cursor-pagination', {
    columns,
    data: dataTable,
    manualSorting: true,
    onSortingChange: handleSortingChange,
    state: {
      ...tableState,
      isLoading: isPending,
    },
    meta: {
      handlePaginationChange,
      hasNextPage,
      hasPreviousPage,
      isPending,
    },
  });

  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
      <MaterialReactTable table={table} />
    </Box>
  );
};

export default MyTable;
```

## What You Get

The `cursor-pagination` preset automatically provides:

### 1. Page Size Selector
- Dropdown with options: 10, 20, 50, 100
- Automatically resets to page 1 when changed
- Disabled during loading

### 2. Navigation Buttons
- **Previous** - Navigates to previous page using cursor history
- **Next** - Navigates to next page using `nextCursor`
- Automatically disabled based on availability and loading state

### 3. Page Indicator
- Shows current page number (e.g., "Page 2")
- Based on cursor history length

## How Cursor Pagination Works

### Navigation Flow

```
Page 1 (cursor: null)
   ↓ Click Next
Page 2 (cursor: "abc123")   ← Current cursor saved to history
   ↓ Click Next
Page 3 (cursor: "xyz789")   ← Current cursor saved to history
   ↓ Click Previous
Page 2 (cursor: "abc123")   ← Retrieved from history
```

### Cursor History
- Maintains a stack of up to **50 previous cursors**
- Enables backward navigation through pages
- Automatically cleared when sorting or page size changes

### State Management
- **URL Params**: Page size and sorting (shareable/bookmarkable)
- **Component State**: Current cursor and history (session-only)

## Migrating from Offset Pagination

### Before (Offset Pagination)

```typescript
const { apiVariables, tableState } = useTableState({
  // paginationMode: 'offset' (default)
  defaultPageSize: 20,
});

const { data } = useQuery({
  variables: {
    page: apiVariables.page,      // Page number
    limit: apiVariables.limit,
  },
});

const table = useMRTTable('default', {
  columns,
  data: data?.data,
  rowCount: data?.count,          // Total count required
  manualPagination: true,
  onPaginationChange: handlePaginationChange,
  // ... standard pagination UI
});
```

### After (Cursor Pagination)

```typescript
const {
  apiVariables,
  tableState,
  setNextCursor,           // ✅ New
  hasNextPage,             // ✅ New
  hasPreviousPage,         // ✅ New
} = useTableState({
  paginationMode: 'cursor', // ✅ Enable cursor mode
  defaultPageSize: 20,
});

const { data } = useQuery({
  variables: {
    cursor: apiVariables.cursor,  // ✅ Cursor instead of page
    limit: apiVariables.limit,
  },
});

useEffect(() => {
  setNextCursor?.(data?.nextCursor); // ✅ Feed cursor back
}, [data?.nextCursor, setNextCursor]);

const table = useMRTTable('cursor-pagination', { // ✅ Use preset
  columns,
  data: data?.data,
  // No rowCount needed! ✅
  manualSorting: true,
  onSortingChange: handleSortingChange,
  state: { ...tableState, isLoading: isPending },
  meta: {                         // ✅ Pass cursor metadata
    handlePaginationChange,
    hasNextPage,
    hasPreviousPage,
    isPending,
  },
});
```

## API Requirements

Your backend API should:

### 1. Accept Cursor Parameter

```typescript
GET /api/items?cursor=abc123&limit=20&sortId=createdAt&sortOrder=desc
```

### 2. Return Next Cursor

```typescript
{
  "data": [...],
  "nextCursor": "xyz789"  // null or undefined if no more pages
}
```

### 3. Handle Cursor Validation

- Validate cursor format
- Return error if cursor is invalid/expired
- Handle `null`/`undefined` cursor as first page

## Common Patterns

### With Error Handling

```typescript
const { data, isPending, error } = useYourQuery({
  variables: { ... },
});

if (error) {
  return <ErrorDisplay error={error} />;
}

if (!isPending && !data?.data?.length) {
  return <EmptyState />;
}
```

### With Custom Columns

```typescript
const columns = useMemo<MRT_ColumnDef<RowData>[]>(() => [
  {
    accessorKey: 'name',
    header: 'Name',
    size: 300,
  },
  {
    accessorKey: 'description',
    header: 'Description',
    enableSorting: false,  // Disable sorting on specific columns
  },
  {
    id: 'actions',
    header: 'Actions',
    Cell: ({ row }) => <ActionsCell row={row} />,
  },
], []);
```

### With Data Transformation

```typescript
const dataTable = useMemo(() => {
  return data?.data.map((item) => ({
    id: item.id,
    name: item.name || '-',
    createdAt: formatDate(item.createdAt),
  })) || [];
}, [data]);
```

## Customization

### Override Preset Defaults

```typescript
const table = useMRTTable('cursor-pagination', {
  columns,
  data: dataTable,
  state: { ...tableState, density: 'compact' },  // Custom density
  muiTablePaperProps: {
    sx: { minHeight: 800 },  // Custom height
  },
  meta: { ... },
});
```

### Add Custom Toolbar Actions

```typescript
const table = useMRTTable('cursor-pagination', {
  // ... other config
  renderTopToolbar: ({ table }) => (
    <CustomToolbar>
      <MRT_GlobalFilterTextField table={table} />
      <Button>Export</Button>
    </CustomToolbar>
  ),
});
```

## Troubleshooting

### Issue: Pagination buttons not working

**Solution**: Ensure you're passing `meta` prop with all required fields:

```typescript
meta: {
  handlePaginationChange,  // ✅ Required
  hasNextPage,             // ✅ Required
  hasPreviousPage,         // ✅ Required
  isPending,               // ✅ Required
}
```

### Issue: Next button always disabled

**Solution**: Check that `setNextCursor` is being called with the API response:

```typescript
useEffect(() => {
  setNextCursor?.(data?.nextCursor);  // ✅ Must be called
}, [data?.nextCursor, setNextCursor]);
```

### Issue: Page resets when changing sort

**Expected behavior**: Cursor history is cleared when sorting changes (by design). This ensures data consistency.

### Issue: Console warning about missing meta

**Solution**: You forgot to pass the `meta` prop. Add it to your table config.

## Best Practices

### ✅ Do

- Use cursor pagination for large, dynamic datasets
- Feed `nextCursor` back to hook via `useEffect`
- Handle loading and error states properly
- Test backward navigation thoroughly

### ❌ Don't

- Mix cursor and offset pagination in the same hook
- Forget to pass `meta` prop to the table
- Store cursors in URLs (they're opaque tokens)
- Expect to jump to arbitrary pages (cursor pagination is sequential)

## Advanced: Type Safety

Define your meta type for better IDE support:

```typescript
import type { CursorPaginationMeta } from '@/front/lib/mrt-table/types';

const meta: CursorPaginationMeta = {
  handlePaginationChange,
  hasNextPage,
  hasPreviousPage,
  isPending,
};

const table = useMRTTable('cursor-pagination', {
  // ... config
  meta,
});
```

## Reference

### Files

- **Hook**: `apps/front/app/hooks/use-table-state.ts`
- **Preset**: `apps/front/app/lib/mrt-table/presets/cursor-pagination-preset.tsx`
- **Types**: `apps/front/app/lib/mrt-table/types.ts`
- **Example**: `apps/front/app/routes/authed/staff/profiles/list/parts/staff-profiles-table.tsx`

### Related Documentation

- [Cursor Pagination Implementation Plan](./cursor-pagination-implementation-plan.md)
- [Material React Table Docs](https://www.material-react-table.com/)
- [useTableState Hook](../apps/front/app/hooks/use-table-state.ts)

## Support

If you encounter issues:

1. Check this guide for common patterns
2. Review the example implementation in `staff-profiles-table.tsx`
3. Ensure your API returns `nextCursor` correctly
4. Verify all required `meta` fields are passed
