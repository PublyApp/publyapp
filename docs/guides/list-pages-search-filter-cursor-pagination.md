# List Pages: Search/Filter + Cursor Pagination Conventions

This guide defines the **default conventions** for list pages that support:
- Search (`q`)
- Filters (including **multi-select enum filters** like `status`)
- Cursor/keyset pagination (no total count)
- Sorting via stable `sortId` values
- Bulk actions from a list table

If an existing guide/rule already covers a topic, follow it. Only diverge from this guide when you have an explicit product/engineering decision to do so.

## 1) End-to-End Contract (URL ↔ Frontend ↔ API)

### URL query keys (frontend)
Use **nuqs** for URL state. Reuse existing defaults from `useTableState`:
- Sorting: `sort_id`, `sort_order`
- Pagination: `size` (cursor mode does not use page numbers)

For list filters, use short, stable keys:
- `q`: free-text search (string)
- `status`: comma-separated multi-select tokens (string)

### API query params (backend)
Prefer camelCase params for API query binding:
- `cursor`: Guid (string in transport; handler parses to `Guid`, `Guid.Empty` = first page)
- `limit`: page size
- `sortId`: stable sort field id (snake_case)
- `sortOrder`: `asc` or `desc`
- `q`: search string (trimmed)
- `status`: comma-separated multi-select tokens (lowercase)

### Stable rules
- **No boolean filter params** when an enum already exists for the same concept (e.g., do not add `isSuspended`; use `status=suspended`).
- **Lowercase tokens end-to-end** for enum-like query values (e.g., `active,pending,suspended,archived`).
- **All filters reset cursor pagination** (cursor history becomes invalid when the query changes).

## 2) Cursor/Keyset Pagination Rules (Backend)

See `docs/guides/cursor-keyset-pagination-guide.md` for the canonical backend pattern. Additional rules for list pages:

### Cursor shape
- Cursor remains the **entity ID** (`Guid`) even when sorting by other fields.
- For non-unique sort fields, always add `Id` as a tie-breaker **with the same direction** as the primary sort.

### Sorting contract (`sortId`)
- `sortId` values must be **snake_case**.
- Backend must validate `sortId` against an explicit allowlist and return `400` on invalid values.

### EF Core shape safety
- Do not use `dynamic` in query composition for cursor pagination.
- If the base query projects to a row shape (e.g., includes computed counts), define a strongly typed row record (e.g., `TenantWithUsersCountRow`) and keep `SortFieldHandler` delegates typed to that row.

## 3) Sorting Rules (Frontend + Material React Table)

### MRT column IDs must match backend `sortId`
Material React Table emits sort IDs based on column `id`. When backend expects snake_case IDs, you must explicitly set them:

```ts
columnHelper.accessor('createdAt', { id: 'created_at', header: t('created-at') });
columnHelper.accessor('updatedAt', { id: 'updated_at', header: t('updated-at') });
columnHelper.accessor('name', { id: 'name', header: t('name') });
```

If a column exists but is not supported by backend sorting, set `enableSorting: false`.

## 4) Search Rules

### Parameter naming + normalization
- Use `q` for free-text search.
- Trim whitespace; treat empty string as null/no filter.
- Add a max length validator (e.g., 200) to prevent expensive queries.

### Performance defaults (PostgreSQL)
For substring “contains” search:
- Use `EF.Functions.ILike(column, $"%{q}%")`.
- Add `pg_trgm` + GIN trigram indexes on the searched columns.
- Prefer partial indexes with `WHERE is_deleted = false` when the table uses soft deletes.

### Migrations for pg_trgm / concurrent indexes
EF Fluent API does not cover every Postgres feature cleanly. Raw SQL migrations are acceptable when required, especially for:
- `CREATE EXTENSION pg_trgm`
- `CREATE INDEX CONCURRENTLY ... gin_trgm_ops`

When using `CREATE INDEX CONCURRENTLY`, use `suppressTransaction: true` (it cannot run inside a transaction). Consider adding `Down()` statements for indexes with `DROP INDEX CONCURRENTLY ...`.

## 5) Multi-Select Enum Filters (`status=...`)

### Transport format
Use comma-separated lowercase tokens:
`status=active,pending,suspended,archived`

### Backend validation + parsing
- Validate the full raw string and each token in the query validator.
- Parse to a set (`IReadOnlySet<Enum>`) in the query DTO getter.
- Treat null/empty/whitespace as “no filter”.

### Frontend UI
- Use MUI `Select` with `multiple`.
- Store the URL filter as CSV string (not arrays) unless/until a different global convention is adopted.

## 6) Filter State + Cursor Reset (Frontend)

Rules:
- Filter state lives in URL via nuqs.
- Any change to `q` or `status` must call `resetCursorPagination?.()` **before** updating URL state.
- Debounce search URL updates (300ms default) using `useDebounce` from `minimal-shared/hooks`.

Example:

```ts
import { useDebounce } from 'minimal-shared/hooks';

const [filters, setFilters] = useQueryStates({
  q: parseAsString.withDefault(''),
  status: parseAsString.withDefault(''),
});

const [searchDraft, setSearchDraft] = useState(filters.q);
const debouncedQ = useDebounce(searchDraft, 300);

useEffect(() => {
  if (debouncedQ === filters.q) return;
  resetCursorPagination?.();
  setFilters({ q: debouncedQ, status: filters.status });
}, [debouncedQ, filters.q, filters.status, resetCursorPagination, setFilters]);

const handleStatusChange = (statusCsv: string) => {
  resetCursorPagination?.();
  setFilters({ q: searchDraft, status: statusCsv });
};
```

## 7) Bulk Actions (List Tables)

Default starting approach:
- Client fan-out with a concurrency cap (`p-limit(5)`).
- Confirm destructive actions.
- Handle partial failures and show a summary toast (succeeded/failed).
- Invalidate the list query on completion and clear selection.

If bulk operations become common/heavy, consider adding a batch API later (explicit product/engineering decision).

## 8) Testing Checklist (Minimum)

Backend:
- Integration test: valid `sortId` allowlist; invalid returns `400`.
- Integration test: cursor not found returns `400`.
- Integration test: status CSV parsing + validation.

Frontend:
- Sorting sends correct snake_case `sortId`.
- Filter change resets cursor pagination.
