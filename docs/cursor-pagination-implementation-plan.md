# Cursor-Based Pagination Implementation Plan

## Current State Analysis

- ✅ API already supports cursor pagination (`cursor` param, `nextCursor` in response)
- ❌ `useTableState` hook only supports **page-based pagination** (page number + pageSize)
- ❌ No cursor history tracking for backward navigation
- ❌ No pagination mode switching capability

## Implementation Plan

### Phase 1: Core Hook Modifications

#### 1.1 Add Pagination Mode Configuration
- Add `paginationMode?: 'offset' | 'cursor'` to `UseTableStateOptions`
- Default to `'offset'` for backward compatibility
- Store mode in hook options

#### 1.2 Extend Query State for Cursor Mode

**Current state in URL:**
```
?page=1&size=20&sort_id=createdAt&sort_order=desc
```

**New cursor mode state:**
```
?cursor=abc123&size=20&sort_id=createdAt&sort_order=desc
```

**Changes needed:**
- Add conditional query state based on mode
- For cursor mode: use `cursor` param instead of `page`
- Remove page tracking entirely in cursor mode

#### 1.3 Cursor History Management

**Problem:** Cursor pagination is unidirectional - you get `nextCursor` but no `previousCursor`

**Solution:** Implement cursor history stack
```typescript
// Store cursor history in React state (not URL)
const [cursorHistory, setCursorHistory] = useState<string[]>([]);
```

**Navigation logic:**
- **Next:** Push current cursor to history, navigate to `nextCursor`
- **Previous:** Pop from history, navigate to last cursor
- **First page:** Clear history, remove cursor param

#### 1.4 Update API Variables Return Type

```typescript
// Current (offset mode)
apiVariables: {
  limit: number;
  page: number;  // ❌ Not compatible with cursor APIs
  sort: {...}
}

// New (conditional based on mode)
apiVariables: {
  limit: number;
  cursor?: string;  // ✅ For cursor mode
  page?: number;    // ✅ For offset mode
  sort: {...}
}
```

#### 1.5 Update Table State for MRT

**Challenge:** MaterialReactTable expects `pageIndex` for pagination state

**Solutions:**
- **Cursor mode:** Set `pageIndex` based on cursor history length
- Track "virtual page index" = `cursorHistory.length`
- This allows MRT's UI to show some page indication

### Phase 2: Pagination Handler Updates

#### 2.1 Modify `handlePaginationChange`

Current behavior: Updates page number
```typescript
// Current: page-based logic
const newPageIndex = prev.pageIndex + 1; // Next page
```

New behavior: Handle both modes
```typescript
if (paginationMode === 'cursor') {
  // Detect direction based on pageIndex change
  if (newPageIndex > currentIndex) {
    // Going forward - use nextCursor from API response
    pushCursorToHistory();
    setCurrentCursor(nextCursor);
  } else {
    // Going backward - pop from history
    const previousCursor = popCursorFromHistory();
    setCurrentCursor(previousCursor);
  }
} else {
  // Existing offset logic
}
```

#### 2.2 Cursor Data Flow

**Problem:** Hook needs `nextCursor` from API response, but hook doesn't fetch data

**Solution:** External cursor management (Recommended)
```typescript
// Consumer passes nextCursor back to hook
const { apiVariables, setNextCursor } = useTableState({...});
const { data } = useFindStaffProfiles({ variables: apiVariables });

// After data loads, inform hook of nextCursor
useEffect(() => {
  setNextCursor(data?.nextCursor);
}, [data?.nextCursor]);
```

### Phase 3: Integration Changes

#### 3.1 Update `useTableState` Return Type

```typescript
export type UseTableStateReturn = {
  // ... existing fields ...

  // New cursor-specific fields
  setNextCursor?: (cursor: string | null) => void;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
  currentCursor?: string | null;

  // Mode indicator
  paginationMode: 'offset' | 'cursor';
};
```

#### 3.2 Update Consumer Components

Example: `staff-profiles-table.tsx`

**Changes needed:**
```typescript
// Enable cursor mode
const { apiVariables, setNextCursor, hasNextPage, hasPreviousPage } = useTableState({
  paginationMode: 'cursor',  // NEW
  defaultPageSize: 20,
  defaultSorting,
});

// Fetch data with cursor
const { data } = useFindStaffProfiles({
  variables: apiVariables,  // Now includes cursor instead of page
});

// Feed nextCursor back to hook
useEffect(() => {
  setNextCursor?.(data?.nextCursor ?? null);
}, [data?.nextCursor, setNextCursor]);

// Configure MRT for cursor pagination
const table = useMRTTable({
  manualPagination: true,
  // Disable page count in cursor mode
  rowCount: -1,  // or undefined

  // Custom pagination UI
  muiPaginationProps: {
    count: -1,  // Hide page numbers
    // Can disable next/prev based on cursor availability
  },
});
```

### Phase 4: MRT Table Configuration

#### 4.1 Custom Pagination Component

```typescript
// MaterialReactTable config for cursor mode
{
  enablePagination: false,  // Disable MRT's built-in pagination
  manualSorting: true,

  // Custom pagination using MRT's toolbar API
  renderBottomToolbarCustomActions: () => (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', width: '100%' }}>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={handlePrevious}
          disabled={!hasPreviousPage || isPending}
          startIcon={<Iconify icon="eva:arrow-ios-back-fill" />}
        >
          Previous
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={handleNext}
          disabled={!hasNextPage || isPending}
          endIcon={<Iconify icon="eva:arrow-ios-forward-fill" />}
        >
          Next
        </Button>
      </Box>

      <Box sx={{ ml: 'auto', typography: 'body2', color: 'text.secondary' }}>
        Page {pageIndex + 1}
      </Box>
    </Box>
  ),
}
```

### Phase 5: Edge Cases & Refinements

#### 5.1 Sorting Changes in Cursor Mode

**Problem:** When sort changes, cursor history becomes invalid

**Solution:**
```typescript
// Reset cursor history when sorting changes
useEffect(() => {
  if (paginationMode === 'cursor') {
    clearCursorHistory();
    setCurrentCursor(null);
  }
}, [sortingState]);
```

#### 5.2 Page Size Changes

**Problem:** Similar to sorting - cursor is tied to page size

**Solution:**
```typescript
// Reset cursor history when page size changes
useEffect(() => {
  if (paginationMode === 'cursor') {
    clearCursorHistory();
    setCurrentCursor(null);
  }
}, [paginationState.pageSize]);
```

#### 5.3 URL State Management

**Consideration:** Should cursor be in URL query params?

**Pros:**
- Shareable URLs
- Browser back/forward navigation

**Cons:**
- Cursors are often opaque tokens (not user-friendly)
- Can be very long
- History stack might not work correctly with URL-based cursors

**Recommendation:**
- Keep cursor in component state (not URL)
- Keep only page size and sorting in URL
- This matches how most cursor-pagination UIs work

## Implementation Checklist

### Hook Changes (`use-table-state.ts`)
- [ ] Add `paginationMode` option
- [ ] Add cursor history state management
- [ ] Conditional query state (cursor vs page)
- [ ] Update `handlePaginationChange` for cursor logic
- [ ] Add `setNextCursor`, `hasNextPage`, `hasPreviousPage` to return type
- [ ] Reset cursor on sort/size changes
- [ ] Update TypeScript types

### Table Component Changes (`staff-profiles-table.tsx`)
- [ ] Enable `paginationMode: 'cursor'`
- [ ] Add `useEffect` to feed `nextCursor` back to hook
- [ ] Update MRT config for cursor pagination UI
- [ ] Test navigation (next/previous)

### Testing
- [ ] Test forward pagination
- [ ] Test backward pagination
- [ ] Test sorting changes (cursor reset)
- [ ] Test page size changes (cursor reset)
- [ ] Test empty states
- [ ] Test single page of results

## Alternative Approach: Simpler Version

If you want a **minimal implementation** without full history tracking:

**Simplified cursor mode:**
- Only support **Next/Previous** buttons (no page numbers)
- Store only: `currentCursor`, `previousCursor`, `nextCursor`
- Track current "page index" as integer (for MRT)
- Previous = go back one cursor, Next = go forward one cursor

This is simpler but limits navigation to sequential pages only.

## Recommendation

**Option A** with cursor history tracking because:
1. ✅ Better UX - users can navigate backward multiple pages
2. ✅ More flexible - can jump between pages if needed later
3. ✅ Aligns with how modern cursor pagination works (e.g., GitHub API)
4. ⚠️ Slightly more complex, but manageable with clear state management

## Files to Modify

1. `apps/front/app/hooks/use-table-state.ts` - Core hook implementation
2. `apps/front/app/routes/authed/staff/profiles/list/parts/staff-profiles-table.tsx` - First consumer
3. Any other components using `useTableState` that need cursor pagination

---

## Using the Cursor Pagination Preset (Updated Approach)

### Overview

A reusable cursor pagination preset has been created to eliminate boilerplate code. Instead of manually implementing pagination UI in every table, you can now use the `'cursor-pagination'` preset which handles everything automatically.

### Quick Start

**1. Use the preset in your table:**

```typescript
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
```

**2. That's it!** The preset automatically renders:
- Page size selector (10, 20, 50, 100)
- Previous/Next navigation buttons
- Current page indicator
- All with proper disabled states

### Complete Example

```typescript
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTableState } from '@/front/hooks/use-table-state';

const MyTable = () => {
  // 1. Setup table state with cursor mode
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

  // 2. Fetch data with cursor
  const { data, isPending } = useYourQuery({
    variables: {
      cursor: apiVariables.cursor || undefined,
      limit: apiVariables.limit,
      sort: apiVariables.sort,
    },
  });

  // 3. Feed nextCursor back to hook
  useEffect(() => {
    setNextCursor?.(data?.nextCursor);
  }, [data?.nextCursor, setNextCursor]);

  // 4. Use cursor-pagination preset
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
    <Card>
      <MaterialReactTable table={table} />
    </Card>
  );
};
```

### How It Works

1. **Meta Prop**: Pass cursor-specific data via the `meta` prop
2. **Preset Access**: The preset's `renderBottomToolbarCustomActions` accesses `table.options.meta`
3. **Automatic UI**: Pagination UI is rendered automatically with all proper states

### Benefits

✅ **Zero Boilerplate** - No pagination JSX in table components
✅ **Consistency** - All cursor tables have identical UI
✅ **Type Safety** - TypeScript ensures correct meta shape
✅ **Maintainability** - Change pagination UI in one place
✅ **Clean Code** - ~100 lines reduced to ~10 lines per table

### Files Created

1. `apps/front/app/lib/mrt-table/types.ts` - Type definitions for cursor pagination meta
2. `apps/front/app/lib/mrt-table/presets/cursor-pagination-preset.tsx` - Preset implementation
3. `apps/front/app/lib/mrt-table/table-presets.ts` - Updated to include cursor pagination preset
