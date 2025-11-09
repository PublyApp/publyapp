# Summary: Dual Pagination Mode Support in `use-table-state.ts` Hook

## Problem Statement

The `useTableState` hook needed to support both **page-based** and **cursor-based** pagination, with the following requirements:

- TypeScript should guarantee that cursor methods (`setNextCursor`, `resetCursor`) are only available in cursor mode
- URL query parameters should only include the relevant parameter (`page` in page mode, `cursor` in cursor mode)
- Maintain backward compatibility with existing page-based pagination

## Solution Overview

Implemented a dual-mode pagination hook using TypeScript function overloads and conditional query parameter management.

## Key Changes Made

### 1. Type System Enhancements

- Created separate return types:
  - `UseTableStateReturnPage`: For page mode (includes `page` in `apiVariables`, no cursor methods)
  - `UseTableStateReturnCursor`: For cursor mode (includes `cursor` in `apiVariables`, requires `setNextCursor` and `resetCursor`)
  - `UseTableStateReturnBase`: Shared base type for common properties

- Added function overloads:
  ```typescript
  export function useTableState(
    options: UseTableStateOptions & { paginationMode: 'cursor' }
  ): UseTableStateReturnCursor;

  export function useTableState(
    options: UseTableStateOptions & { paginationMode: 'page' }
  ): UseTableStateReturnPage;

  export function useTableState(
    options?: UseTableStateOptions
  ): UseTableStateReturnPage; // Defaults to page mode
  ```

### 2. Conditional Query Parameter Management

- URL query parameters are conditionally included based on mode:
  - **Page mode**: Only `page` and `pageSize` in URL
  - **Cursor mode**: Only `cursor` and `pageSize` in URL

- Implemented `updatePaginationState` helper that automatically removes unused params when updating state

- Added `useEffect` hook to clean up unused params on mount and mode changes

### 3. Cursor Mode Implementation

- **Cursor tracking**: Uses `previousPageIndexRef` to track page index internally (not in URL) for MaterialReactTable UI

- **Cursor reset logic**:
  - Resets when sorting changes
  - Resets when page size changes
  - Resets when navigating backward or jumping pages
  - Only keeps cursor when navigating forward sequentially

- **Cursor management functions**:
  - `setNextCursor`: Updates cursor from API response
  - `resetCursor`: Clears cursor and resets to page 1

### 4. Page Mode Compatibility

- Maintains backward compatibility (defaults to page mode)
- Existing code using page-based pagination continues to work without changes
- Page index tracked in URL query params as before

## Technical Details

### Type Safety

- TypeScript overloads ensure:
  - In cursor mode: `setNextCursor` and `resetCursor` are guaranteed to exist (not optional)
  - In page mode: Cursor methods don't exist on the return type
  - `apiVariables` type is narrowed based on mode (`page` vs `cursor`)

### State Management

- `paginationState` type changed to `Record<string, string | null>` to accommodate optional cursor
- Internal page tracking in cursor mode uses `useRef` since page isn't in URL
- All state updates go through `updatePaginationState` helper to ensure unused params are removed

### API Variables Structure

- **Page mode**: `{ limit: number, page: number, sort: {...} }`
- **Cursor mode**: `{ limit: number, cursor: string | null, sort: {...} }`

## Usage Examples

### Cursor Mode

```typescript
const { setNextCursor, resetCursor, apiVariables } = useTableState({
  paginationMode: 'cursor',
  defaultPageSize: 20,
});
// TypeScript guarantees setNextCursor and resetCursor exist
// apiVariables has 'cursor', not 'page'
```

### Page Mode

```typescript
const { apiVariables } = useTableState({
  paginationMode: 'page',
  defaultPageSize: 20,
});
// apiVariables has 'page', not 'cursor'
// No cursor methods available
```

## Files Modified

- `apps/front/app/hooks/use-table-state.ts`: Complete refactor with dual-mode support
- `apps/front/app/routes/authed/staff/tenants/list/parts/tenants-table.tsx`: Updated to use the hook (can switch between modes)
- `apps/front/app/lib/react-query/features/staff/staff-tenant.hooks.ts`: Updated to support both `page` and `cursor` query parameters

## Benefits

1. **Type Safety**: TypeScript enforces correct usage based on pagination mode
2. **Clean URLs**: Only relevant query params appear in URL based on mode
3. **Backward Compatible**: Existing page-based code continues to work
4. **Flexible**: Easy to switch between modes per table
5. **Maintainable**: Clear separation of concerns between modes

## Testing Considerations

- Verify URL only contains relevant params for each mode
- Test cursor reset behavior (sorting, page size changes, backward navigation)
- Verify TypeScript type narrowing works correctly
- Test backward compatibility with existing page-based implementations
- Verify MaterialReactTable UI works correctly in both modes

## Implementation Notes

### Key Implementation Details

1. **Conditional Query States**: The `useQueryStates` hook conditionally includes params:
   ```typescript
   const [paginationState, setPaginationState] = useQueryStates({
     [queryKeys.pagination.pageSize]: parseAsString.withDefault(...),
     ...(paginationMode === 'page' && {
       [queryKeys.pagination.page]: parseAsString.withDefault('1'),
     }),
     ...(paginationMode === 'cursor' && {
       [queryKeys.pagination.cursor || 'cursor']: parseAsString,
     }),
   });
   ```

2. **Cleanup Effect**: Ensures unused params are removed:
   ```typescript
   useEffect(() => {
     setPaginationState((prev) => {
       const newState = { ...prev };
       if (paginationMode === 'cursor') {
         delete newState[queryKeys.pagination.page];
       } else {
         delete newState[queryKeys.pagination.cursor || 'cursor'];
       }
       return newState;
     });
   }, [paginationMode, ...]);
   ```

3. **Type-Safe Return**: The function returns different types based on mode:
   ```typescript
   if (paginationMode === 'cursor') {
     return {
       ...baseReturn,
       setNextCursor,
       resetCursor,
       apiVariables: apiVariables as UseTableStateReturnCursor['apiVariables'],
     } as UseTableStateReturnCursor;
   }
   return {
     ...baseReturn,
     apiVariables: apiVariables as UseTableStateReturnPage['apiVariables'],
   } as UseTableStateReturnPage;
   ```

## Conclusion

This implementation provides a type-safe, flexible solution for supporting both pagination strategies while maintaining clean URLs and backward compatibility. The use of TypeScript function overloads ensures developers get proper type checking and IntelliSense based on the pagination mode they choose.

