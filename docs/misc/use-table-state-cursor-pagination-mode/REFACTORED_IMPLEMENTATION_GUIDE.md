# Refactored Dual Pagination Mode Implementation Guide

## What Changed

### Key Improvements

1. **Fixed Race Condition in Cleanup Effect**
   - Now checks if cleanup is actually needed before updating state
   - Prevents unnecessary re-renders

2. **Consistent Mode Separation**
   - Removed incorrect `page` param setting in cursor mode
   - Each mode now strictly manages only its own params

3. **Added End-of-Data Detection**
   - New `hasMorePages` boolean in cursor mode
   - Automatically updated when `setNextCursor` is called with `null`

4. **Better Error Handling**
   - Development warnings when cursor methods called in wrong mode
   - Helps catch usage errors early

5. **Reduced Repetition**
   - Extracted magic strings to constants
   - Single definition of cursor/page/pageSize keys
   - Centralized `DEFAULT_SORTING` constant

6. **Cleaner Type Casting**
   - Removed unnecessary type assertions
   - More direct type narrowing

## Breaking Changes

### None for Existing Code

The refactored version maintains full backward compatibility. Existing page-mode implementations continue to work without changes.

### New Feature: `hasMorePages`

**Cursor mode only** - new property in return type:

```typescript
const { hasMorePages, setNextCursor } = useTableState({
  paginationMode: 'cursor',
});

// Use in your table component
<MaterialReactTable
  // ...
  manualPagination
  rowCount={hasMorePages ? tableState.pagination.pageSize * (tableState.pagination.pageIndex + 2) : data.length}
/>
```

## Usage Guide

### Page Mode (Default)

```typescript
import { useTableState } from '@/hooks/use-table-state';

function MyTable() {
  const { apiVariables, tableState, handlePaginationChange, handleSortingChange } = 
    useTableState({
      paginationMode: 'page', // or omit for default
      defaultPageSize: 20,
      defaultSorting: { id: 'name', desc: false },
    });

  const { data, isLoading } = useQuery({
    queryKey: ['items', apiVariables],
    queryFn: () => fetchItems(apiVariables),
  });

  return (
    <MaterialReactTable
      data={data?.items || []}
      rowCount={data?.totalCount || 0}
      state={tableState}
      onPaginationChange={handlePaginationChange}
      onSortingChange={handleSortingChange}
      manualPagination
      manualSorting
    />
  );
}
```

### Cursor Mode (New)

```typescript
import { useTableState } from '@/hooks/use-table-state';

function MyTable() {
  const { 
    apiVariables, 
    tableState, 
    handlePaginationChange, 
    handleSortingChange,
    setNextCursor,
    resetCursor,
    hasMorePages, // New!
  } = useTableState({
    paginationMode: 'cursor',
    defaultPageSize: 20,
    defaultSorting: { id: 'name', desc: false },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['items', apiVariables],
    queryFn: () => fetchItems(apiVariables),
  });

  // Update cursor when data changes
  useEffect(() => {
    if (data?.nextCursor !== undefined) {
      setNextCursor(data.nextCursor);
    }
  }, [data?.nextCursor, setNextCursor]);

  return (
    <MaterialReactTable
      data={data?.items || []}
      // Calculate row count based on hasMorePages
      rowCount={
        hasMorePages 
          ? tableState.pagination.pageSize * (tableState.pagination.pageIndex + 2)
          : data?.items.length || 0
      }
      state={tableState}
      onPaginationChange={handlePaginationChange}
      onSortingChange={handleSortingChange}
      manualPagination
      manualSorting
    />
  );
}
```

## API Response Contract

### Page Mode Response

```typescript
type PageModeResponse = {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
};
```

### Cursor Mode Response

```typescript
type CursorModeResponse = {
  items: T[];
  nextCursor: string | null; // null when no more pages
  pageSize: number;
};
```

**Important**: Your API must return `nextCursor: null` when there are no more pages. This is used to update `hasMorePages`.

## Backend Implementation Example

### NestJS with Prisma (Cursor Mode)

```typescript
async findMany(dto: FindManyDto) {
  const { limit, cursor, sort } = dto;
  
  const items = await this.prisma.item.findMany({
    take: limit + 1, // Fetch one extra to check if there's a next page
    ...(cursor && { 
      skip: 1, // Skip the cursor
      cursor: { id: cursor } 
    }),
    orderBy: { [sort.id]: sort.order },
  });

  const hasMore = items.length > limit;
  const resultItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? resultItems[resultItems.length - 1].id : null;

  return {
    items: resultItems,
    nextCursor,
    pageSize: limit,
  };
}
```

### ASP.NET Core (Cursor Mode)

```csharp
public async Task<CursorPagedResult<Item>> GetItems(
    int limit, 
    string cursor, 
    string sortId, 
    string sortOrder)
{
    var query = _context.Items.AsQueryable();
    
    // Apply cursor
    if (!string.IsNullOrEmpty(cursor))
    {
        query = query.Where(x => string.Compare(x.Id, cursor) > 0);
    }
    
    // Apply sorting
    query = sortOrder == "desc" 
        ? query.OrderByDescending(x => EF.Property<object>(x, sortId))
        : query.OrderBy(x => EF.Property<object>(x, sortId));
    
    // Fetch limit + 1 to check for next page
    var items = await query.Take(limit + 1).ToListAsync();
    
    var hasMore = items.Count > limit;
    var resultItems = hasMore ? items.Take(limit).ToList() : items;
    var nextCursor = hasMore ? resultItems.Last().Id : null;
    
    return new CursorPagedResult<Item>
    {
        Items = resultItems,
        NextCursor = nextCursor,
        PageSize = limit
    };
}
```

## Migration Guide

### From Page to Cursor Mode

1. **Update Hook Options**
```typescript
// Before
const tableState = useTableState({
  defaultPageSize: 20,
});

// After
const tableState = useTableState({
  paginationMode: 'cursor',
  defaultPageSize: 20,
});
```

2. **Destructure New Methods**
```typescript
// Before
const { apiVariables, tableState, ... } = useTableState(...);

// After
const { 
  apiVariables, 
  tableState, 
  setNextCursor,  // New
  resetCursor,    // New
  hasMorePages,   // New
  ...
} = useTableState({ paginationMode: 'cursor', ... });
```

3. **Update Effect to Set Cursor**
```typescript
useEffect(() => {
  if (data?.nextCursor !== undefined) {
    setNextCursor(data.nextCursor);
  }
}, [data?.nextCursor, setNextCursor]);
```

4. **Update Row Count Calculation**
```typescript
// Before (page mode)
rowCount={data?.totalCount || 0}

// After (cursor mode)
rowCount={
  hasMorePages 
    ? tableState.pagination.pageSize * (tableState.pagination.pageIndex + 2)
    : data?.items.length || 0
}
```

5. **Update Backend**
   - Change API to accept `cursor` instead of `page`
   - Implement cursor-based pagination logic
   - Return `nextCursor` in response

## Advanced: Custom Query Keys

```typescript
const tableState = useTableState({
  paginationMode: 'cursor',
  queryKeys: {
    pagination: {
      page: 'p',        // Custom page key (not used in cursor mode)
      pageSize: 'size',
      cursor: 'c',      // Custom cursor key
    },
    sorting: {
      id: 'sort',
      order: 'dir',
    },
  },
});
```

Result in URL: `?size=20&c=eyJpZCI6MTIzfQ&sort=name&dir=asc`

## Cursor Format Recommendations

### Option 1: Base64-Encoded JSON
```typescript
// Encoding
const cursor = Buffer.from(JSON.stringify({ id: 123, timestamp: Date.now() }))
  .toString('base64');

// Decoding
const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
```

**Pros**: Easy to implement, can include multiple fields
**Cons**: Visible structure, can be manually edited

### Option 2: Opaque ID
```typescript
// Just use the last item's ID
const cursor = lastItem.id.toString();
```

**Pros**: Simple, secure
**Cons**: Limited to single-field sorting

### Option 3: Encrypted Token
```typescript
// Encrypt cursor data
const cursor = encrypt(JSON.stringify({ id: 123, timestamp: Date.now() }));
```

**Pros**: Secure, tamper-proof
**Cons**: More complex, requires encryption/decryption

## Troubleshooting

### Issue: Cursor not updating

**Problem**: `nextCursor` from API is not being applied.

**Solution**: Make sure you're calling `setNextCursor` in an effect:
```typescript
useEffect(() => {
  if (data?.nextCursor !== undefined) {
    setNextCursor(data.nextCursor);
  }
}, [data?.nextCursor, setNextCursor]);
```

### Issue: Table shows wrong page count

**Problem**: MaterialReactTable shows incorrect pagination controls.

**Solution**: Use `hasMorePages` to calculate `rowCount`:
```typescript
rowCount={
  hasMorePages 
    ? tableState.pagination.pageSize * (tableState.pagination.pageIndex + 2)
    : data?.items.length || 0
}
```

### Issue: Both page and cursor in URL

**Problem**: URL shows both `?page=1&cursor=abc`.

**Solution**: This shouldn't happen with the refactored version, but if it does:
1. Clear your browser cache
2. Check that `paginationMode` is correctly set
3. Verify you're using the refactored version of the hook

### Issue: "resetCursor called in page mode" warning

**Problem**: Console shows warnings about cursor methods in page mode.

**Solution**: You're calling cursor methods when not in cursor mode. Either:
1. Change `paginationMode` to `'cursor'`
2. Remove calls to `setNextCursor`/`resetCursor`

## Performance Considerations

### When to Use Cursor Mode

✅ **Good for:**
- Large datasets (100k+ rows)
- Real-time data that changes frequently
- Infinite scroll patterns
- Mobile apps with limited memory
- APIs that don't support efficient offset pagination

❌ **Not ideal for:**
- Small datasets (<1000 rows)
- Need to jump to specific pages
- Need to show total count
- Simple admin tables

### When to Use Page Mode

✅ **Good for:**
- Datasets with stable total counts
- Need to jump to specific pages
- Traditional table UX with page numbers
- Simple CRUD interfaces
- Need to show "Page X of Y"

❌ **Not ideal for:**
- Very large datasets
- Frequently changing data
- Performance-critical applications

## Testing Examples

```typescript
import { renderHook, act } from '@testing-library/react';
import { useTableState } from './use-table-state';

describe('useTableState - cursor mode', () => {
  it('should start with hasMorePages true', () => {
    const { result } = renderHook(() => 
      useTableState({ paginationMode: 'cursor' })
    );
    
    expect(result.current.hasMorePages).toBe(true);
  });

  it('should update hasMorePages when cursor is null', () => {
    const { result } = renderHook(() => 
      useTableState({ paginationMode: 'cursor' })
    );
    
    act(() => {
      result.current.setNextCursor(null);
    });
    
    expect(result.current.hasMorePages).toBe(false);
  });

  it('should reset cursor when sorting changes', () => {
    const { result } = renderHook(() => 
      useTableState({ paginationMode: 'cursor' })
    );
    
    // Set a cursor
    act(() => {
      result.current.setNextCursor('abc123');
    });
    
    expect(result.current.apiVariables.cursor).toBe('abc123');
    
    // Change sorting
    act(() => {
      result.current.handleSortingChange([{ id: 'name', desc: false }]);
    });
    
    // Cursor should be reset
    expect(result.current.apiVariables.cursor).toBe(null);
    expect(result.current.hasMorePages).toBe(true);
  });

  it('should not include page param in URL', () => {
    const { result } = renderHook(() => 
      useTableState({ paginationMode: 'cursor' })
    );
    
    expect(result.current.paginationState).not.toHaveProperty('page');
    expect(result.current.apiVariables).not.toHaveProperty('page');
  });
});

describe('useTableState - page mode', () => {
  it('should not include cursor param in URL', () => {
    const { result } = renderHook(() => 
      useTableState({ paginationMode: 'page' })
    );
    
    expect(result.current.paginationState).not.toHaveProperty('cursor');
    expect(result.current.apiVariables).not.toHaveProperty('cursor');
  });

  it('should not have cursor methods', () => {
    const { result } = renderHook(() => 
      useTableState({ paginationMode: 'page' })
    );
    
    expect(result.current).not.toHaveProperty('setNextCursor');
    expect(result.current).not.toHaveProperty('resetCursor');
    expect(result.current).not.toHaveProperty('hasMorePages');
  });
});
```

## Summary of Improvements

| Issue | Before | After |
|-------|--------|-------|
| Race condition | Cleanup always runs | Only runs when needed |
| Mode separation | Page param set in cursor mode | Strict mode separation |
| End detection | No way to know last page | `hasMorePages` property |
| Error feedback | Silent failures | Dev warnings |
| Code repetition | Multiple hardcoded strings | Constants |
| Type casting | Unnecessary assertions | Direct narrowing |

## Next Steps

1. **Replace your current implementation** with the refactored version
2. **Update tests** to cover new `hasMorePages` property
3. **Update backend** to return proper cursor responses
4. **Migrate tables** one at a time from page to cursor mode
5. **Monitor performance** improvements in production

## Support

For questions or issues:
1. Check this documentation
2. Review the inline code comments
3. Check the TypeScript types for guidance
4. Test in development with warnings enabled
