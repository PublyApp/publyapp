Status: Historical — not normative
Original location: docs/superpowers/specs/2026-05-12-audit-logs-filters-upgrade-design.md
Archive reason: Completed design retained only for architectural decision history.
Superseded by: apps/api/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs and docs/guides/list-pages-search-filter-cursor-pagination.md.

# Staff Audit Logs — Filters Upgrade

> Historical PR #401 working artifact. Do not execute this as a current
> implementation plan without first checking the live code and AGENTS.md-linked
> guides.

**Date:** 2026-05-12
**Branch:** `feat/280-staff-audit-logs-table-upgrade`
**Status:** Design approved, ready for plan

## 1. Problem

The staff audit logs page (`/staff/audit-logs`) ships two filter widgets that don't scale:

1. **Two separate `<DatePicker>` widgets** for start/end date. Users want a single date-range control with quick presets. MUI X `<DateRangePicker>` is paid (Pro), so the page wires two pickers side by side with manual clamping.
2. **A `<Select>` for action**, populated with the full action enum (currently 30+ values, growing). The dropdown is long, ugly, and single-select only — there is no way to ask "show me all `auth.*` failures from last week."

Filter state lives in `useState`, not URL params, so filters don't survive refresh and aren't shareable.

## 2. Goals

- Replace the two date pickers with one chip-style date-range filter (presets + custom range).
- Replace the action `<Select>` with a chip-style multi-select that scales to many options.
- Both filters are built as reusable shared components, themed with our MUI tokens.
- Filter state moves to URL params (nuqs), aligning with project convention.
- Audit log API gains multi-action filtering.

## 3. Non-goals

- No "filter chip strip" pattern (Whop-style `+ Add filter` chips at the table top). Filters stay inline in the existing MRT toolbar slot.
- No advanced search syntax (no `action:auth.* user:foo` query language).
- No saved-filter / "views" persistence.
- No URL state migration for any other list page in this PR.

## 4. Component inventory

Two new shared components under `apps/front/src/components/`.

### 4.1 `components/date-range-filter/`

| File | Purpose |
| --- | --- |
| `date-range-filter.tsx` | Controlled chip-button trigger + `<Popover>` shell |
| `date-range-filter-presets.tsx` | Left rail with preset buttons |
| `date-range-filter-calendar.tsx` | Two-month range calendar built on MUI `<DateCalendar>` (MIT) with our own range-selection state |
| `date-range-filter.types.ts` | `DateRange`, `DateRangePreset`, `DateRangeFilterProps` |

**Props:**

```ts
type DateRange = { from: Dayjs | null; to: Dayjs | null };

type DateRangePreset =
  | 'today' | 'yesterday' | 'last-7-days'
  | 'last-30-days' | 'last-90-days' | 'custom';

type DateRangeFilterProps = {
  label?: string;                  // default: t('date')
  value: DateRange;
  onChange: (value: DateRange) => void;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  defaultPreset?: DateRangePreset; // default: 'last-7-days' — not auto-applied;
                                   // only highlighted when value matches
};
```

**Behavior:**

- Trigger shows `{label} · {formatted range}` when active, just `{label} ▾` when both `from`/`to` are null. Clearing happens inside the popover via "Clear" footer link.
- Selecting a preset computes the range relative to "now", calls `onChange`, closes the popover.
- "Custom" reveals the calendar with "Apply" / "Cancel" actions; only "Apply" commits.
- The highlighted preset is recomputed each render: if current `value` exactly matches a preset's computed range, that preset shows as active; otherwise "Custom" is active.
- `DateCalendar` renders two months side by side; range selection is tracked in local state with start/end click semantics (first click sets `from`, second sets `to`, third resets and starts again).

### 4.2 `components/multi-select-chip-filter/`

| File | Purpose |
| --- | --- |
| `multi-select-chip-filter.tsx` | Controlled chip-button trigger with count badge + split-pane `<Popover>` |
| `multi-select-chip-filter-list.tsx` | Left pane: search input + checkbox list with optional grouping |
| `multi-select-chip-filter-selected.tsx` | Right pane: chips of selected values, each with X to remove; "Clear all" footer |
| `multi-select-chip-filter.types.ts` | `MultiSelectChipFilterOption`, `MultiSelectChipFilterProps` |

**Props:**

```ts
type MultiSelectChipFilterOption = {
  value: string;
  label: string;
  group?: string;
};

type MultiSelectChipFilterProps = {
  label: string;
  options: MultiSelectChipFilterOption[];
  value: string[];
  onChange: (next: string[]) => void;
  loading?: boolean;          // skeleton in left pane
  searchPlaceholder?: string;
  emptyLabel?: string;        // shown when no options match the search
  groupOrder?: string[];      // explicit ordering, else alpha
};
```

**Behavior:**

- Trigger shows `{label} · {value.length}` (count badge in MUI `<Chip>` style) when `value.length > 0`, else just `{label} ▾`.
- Popover split-pane layout per the user's sketch:
  - **Left pane:** search input at top, scrollable checkbox list below. When any option has a `group`, the list renders collapsible sections (open by default), one per group; otherwise a flat list. Search filters case-insensitively against `label`.
  - **Right pane:** chips of currently selected values (independent of left-pane search filter), each with an X to remove. Footer link "Clear all" (disabled when empty).
- On narrow screens (< 600px) the split collapses: right pane stacks above the left pane.

### 4.3 Page-local files

Under `routes/authed/staff/audit-logs/list/_parts/`:

- `use-staff-audit-logs-filters.ts` — nuqs-backed hook (see Section 6).
- `staff-audit-logs-table.tsx` — existing file, edited to use the new hook + components.
- `audit-logs-export-button.tsx` — existing file, prop signature changes (`actionFilter?: string` → `actions?: string[]`), with the API query value emitted as CSV.

## 5. Backend changes

### 5.1 DTOs

`FindAuditLogsQuery` (`apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs`):

```csharp
// Was: [FromQuery(Name = "action")] public string? Action { get; set; }
[FromQuery(Name = "actions")]
public string? Actions { get; set; }

public IReadOnlyList<string>? GetActionsList() {
    return AuditLogActionsCsv.Parse(Actions);
}
```

`ExportAuditLogsQuery` (`apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs`) — same change.

The public query contract is CSV: `?actions=a,b`. Keep the `[AsParameters]` DTO property primitive (`string? Actions`) and parse it in a getter. This follows the Kiota safeguard: `List<T>?` or a custom `BindAsync` causes OpenAPI query metadata to disappear, which makes the generated TypeScript client drop query parameters.

### 5.2 Service args

`AuditLogQueryService.cs`:

```csharp
public record FindAuditLogsArgs(
    Guid Cursor,
    int? Limit,
    string? SortId,
    SortOrder? SortOrder,
    Guid? UserId,
    IReadOnlyList<string>? Actions, // was: string? Action
    Guid? TargetId,
    DateTime? StartDate,
    DateTime? EndDate
);

public record ExportAuditLogsArgs(
    Guid? UserId,
    IReadOnlyList<string>? Actions, // was: string? Action
    Guid? TargetId,
    DateTime? StartDate,
    DateTime? EndDate
);
```

### 5.3 `ApplyFilters`

```csharp
if (actions is { Count: > 0 }) {
    query = query.Where(a => actions.Contains(a.Action));
}
```

EF Core translates to SQL `IN (...)`. The validator caps `Actions.Count` so the IN list stays small.

### 5.4 Validator additions

In `FindAuditLogsQueryValidator` and `ExportAuditLogsQueryValidator`:

```csharp
RuleFor(x => x.Actions)
    .Custom((raw, context) => {
        var error = AuditLogActionsCsv.GetValidationError(raw);
        if (error is not null) {
            context.AddFailure(AuditLogActionsCsv.WireName, error);
        }
    });
```

`AuditActionsRegistry` is a new static class placed alongside `AuditActions` in `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs` (or extracted to a sibling file `AuditActionsRegistry.cs` in the same `Entities/` folder if `AuditLog.cs` grows too large). It exposes the reflection cache currently inlined as `CachedActions` in `AuditLogQueryService`. The query service is updated to consume it as well, so the cache lives in one place. Public surface: `IReadOnlyList<string> All { get; }`, `bool IsKnown(string action)`.

### 5.5 Compatibility

No backward-compat shim. The singular `Action` field is removed. Only one frontend consumer exists; the TS client is regenerated in lockstep (`just build-api && just generate-client`).

## 6. Page wiring

### 6.1 Filter state hook

`apps/front/src/routes/authed/staff/audit-logs/list/_parts/use-staff-audit-logs-filters.ts`:

```ts
const parsers = {
  actions: parseAsArrayOf(parseAsString).withDefault([]),
  from: parseAsString,   // 'YYYY-MM-DD' or null
  to:   parseAsString,
};

export const useStaffAuditLogsFilters = (onChange?: () => void) => {
  const [q, setQ] = useQueryStates(parsers);

  const setActions = (next: string[]) => {
    onChange?.();
    setQ({ actions: next });
  };

  const setDateRange = (next: DateRange) => {
    onChange?.();
    setQ({
      from: next.from?.format('YYYY-MM-DD') ?? null,
      to:   next.to?.format('YYYY-MM-DD') ?? null,
    });
  };

  return {
    actions: q.actions,
    dateRange: {
      from: q.from ? dayjs(q.from) : null,
      to:   q.to   ? dayjs(q.to)   : null,
    },
    setActions,
    setDateRange,
    resetAll: () => setQ({ actions: [], from: null, to: null }),
  };
};
```

URL date format is `YYYY-MM-DD` (date-only, no time). The page converts to start-of-day / end-of-day ISO at the API boundary, matching the current behavior.

### 6.2 Table component changes

`staff-audit-logs-table.tsx` (existing file, edits only):

```ts
const { actions, dateRange, setActions, setDateRange } =
  useStaffAuditLogsFilters(resetCursorPagination);

const startDateIso = dateRange.from?.startOf('day').toISOString();
const endDateIso   = dateRange.to?.endOf('day').toISOString();

useFindStaffAuditLogs({
  variables: {
    cursor: apiVariables.cursor || undefined,
    limit:  apiVariables.limit,
    sort:   apiVariables.sort,
    actions: actions.length > 0 ? actions.join(',') : undefined,
    startDate: startDateIso,
    endDate:   endDateIso,
  },
});

const renderToolbarFilters = () => (
  <>
    <DateRangeFilter
      label={t('date')}
      value={dateRange}
      onChange={setDateRange}
    />
    <MultiSelectChipFilter
      label={t('action')}
      options={actionOptions.map(a => ({
        value: a,
        label: a,
        group: a.split('.')[0],
      }))}
      value={actions}
      onChange={setActions}
      loading={actionsQuery.isPending}
      searchPlaceholder={t('search')}
    />
  </>
);
```

The local `useState` for `actionFilter`, `startDate`, `endDate` is removed.

### 6.3 Export button

`audit-logs-export-button.tsx`:

```ts
type AuditLogsExportButtonProps = {
  actions?: string[];       // UI selection; joined to CSV for the API
  startDate?: string;
  endDate?: string;
};

// inside handleExport:
queryParameters: {
  format,
  actions: actions && actions.length > 0 ? actions.join(',') : undefined,
  startDate: startDate || undefined,
  endDate:   endDate   || undefined,
},
```

## 7. i18n

New keys in the source locale files:

- `packages/shared-ts/lib/i18n/json/common.en.json`
- `packages/shared-ts/lib/i18n/json/common.fr.json`

Runtime locale files are generated from these sources and should not be edited directly.

- `today` → `"Today"`
- `yesterday` → `"Yesterday"`
- `last-n-days` → `"Last {{count}} days"` (used with `count: 7 | 30 | 90`)
- `custom` → `"Custom"`
- `apply` → `"Apply"`
- `cancel` → `"Cancel"`
- `clear` → `"Clear"` (date range footer)
- `clear-all` → `"Clear all"` (multi-select footer)
- `selected-count` → `"{{count}} selected"` (a11y label on the count badge)
- `no-results-found` → `"No results found"`

Existing keys reused: `date`, `action`, `all`, `search`. Legacy `start-date` / `end-date` keys are left alone (still used elsewhere).

## 8. Cursor pagination reset

Each filter setter calls the `onChange` callback passed into `useStaffAuditLogsFilters`. The page wires that to `resetCursorPagination` from `useTableState`. Same contract as today, just moved out of the component body into the hook.

## 9. Testing & verification

### 9.1 Backend

`FindAuditLogs.Spec.cs` and `ExportAuditLogs.Spec.cs` (Testcontainers, real Postgres):

- Adapt existing `Action = "..."` specs to `Actions = [single]`.
- `ItShouldFilterByMultipleActionsWhenActionsProvided` — seed three distinct actions, query with two of them, assert correct subset.
- `ItShouldReturnAllLogsWhenActionsIsEmpty` — empty action selection/no `actions` query behaves like null.
- `ItShouldReturn422WhenAnyActionIsUnknown` — `Actions = ["totally.fake"]` → 422 with validator error.
- `ItShouldReturn422WhenMoreThanFiftyActionsProvided` — `Actions.Count = 51` → 422.

### 9.2 Frontend

No new unit tests (no `apps/front` test convention exists yet). Verification is:

1. `just tsc-front` and `just check-write` clean.
2. Manual browser verification of:
   - Date range filter — each preset, custom range Apply / Cancel, in-popover Clear.
   - Multi-select filter — search, grouping, selected pane visibility under search, X to remove, "Clear all".
   - URL state — refresh preserves filters; back/forward navigates filter history; shared URL with `?actions=a,b&from=...&to=...` lands correctly.
   - Cursor reset — paginate, change filter, returned to page 1.
   - Export — CSV/JSON contain only rows for selected actions.
   - Regression — empty filters, action-only, date-only paths still work.

### 9.3 Build gates

```bash
just build-api && just generate-client && just tsc-front && just check-write
just test-api  # multi-action specs
```

## 10. Out-of-scope follow-ups

- Adopting `<DateRangeFilter>` and `<MultiSelectChipFilter>` on other list pages (staff users, invitations, tenant users).
- Migrating the rest of the page's filter state to nuqs (only the two filters in this PR move).
- Saved filter views.
- Server-side validation for date range size cap (currently unbounded — the export endpoint already enforces a row cap which gates the practical risk).
