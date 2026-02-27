# GPT Review Prompt: Phase 3 Tenant List Improvements Implementation Plan

> **For:** GPT (or any senior software engineer reviewing this plan)
>
> **From:** Aki (AI assistant working with the development team)
>
> **Context:** We're building a multi-tenant SaaS application (PublyApp) with .NET 10 backend and React 19 frontend. This plan implements Category 3 of our Tenant Module improvements.

---

## Your Output

**IMPORTANT:** Write your complete review in a new markdown file:

`docs/plans/2026-02-25-tenant-list-gpt-review.md`

Include all sections, code examples, and recommendations in that file. This will become the authoritative review document.

---

## Instructions

You are a **highly experienced senior software engineer, architect, and product-minded technologist** reviewing an implementation plan for a feature that will introduce search, filtering, bulk actions, and export functionality to an existing tenant list page.

Your job is to **ruthlessly critique** this plan from every conceivable angle. Challenge assumptions, identify gaps, suggest improvements, and ensure we produce production-grade software.

**Be extremely thorough.** Don't hold back. If something seems off, say so. If we could do better, tell us how. If we need new rules/conventions for future features, propose them.

---

## Implementation Plan to Review

The full implementation plan is saved at:

**`docs/plans/2026-02-25-tenant-list-search-filter.md`**

Please read that file first to understand the complete plan.

### Plan Summary

We're implementing 5 features on the staff tenant list page:

| # | Feature | Description |
|---|---------|-------------|
| 3.1 | Search by tenant name | Text search on name/code |
| 3.2 | Filter by status | Dropdown: Active/Pending/Suspended/Archived |
| 3.3 | Filter by suspension state | Toggle for suspended-only view |
| 3.4 | Bulk actions | Multi-select + suspend/reactivate/delete |
| 3.5 | Export tenant list | CSV/JSON download |

### Key Technical Decisions in Plan

1. **Search/Filter**: Add optional query params (`Search`, `Status`, `IsSuspended`) to existing `FindTenantsAsStaff` endpoint
2. **Pagination**: Continue using existing offset pagination (not cursor-based for search)
3. **Frontend**: Add search input + dropdown + toggle above MaterialReactTable, enable row selection
4. **Export**: Client-side export using current filtered data

### Files to Modify

- `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs`
- `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
- `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`
- `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`

---

## Review Criteria

Please evaluate this plan against ALL of the following:

### 1. Architecture & Design

- [ ] Does this plan follow existing architectural patterns in the codebase?
- [ ] Are we introducing any technical debt?
- [ ] Is the filtering/search approach scalable as data grows?
- [ ] Should we use cursor-based pagination instead of offset for search results? Why or why not?
- [ ] How should we handle search debouncing? Should it be server-side or client-side?
- [ ] Should filter state be persisted in URL (query params)? What are trade-offs?

### 2. Backend Implementation

- [ ] SQL injection concerns with `ToLower().Contains()` approach?
- [ ] Do we need database indexes for search performance? Which columns?
- [ ] Are we validating status values properly?
- [ ] How do we handle empty search results?
- [ ] Error handling - what happens when search/filter fails?
- [ ] Should we implement case-insensitive search at DB level (ILIKE) vs in-memory?

### 3. Frontend Implementation

- [ ] Search debouncing implementation - what's the right delay?
- [ ] Filter state management - local state vs URL params?
- [ ] MaterialReactTable best practices - are we using it correctly?
- [ ] TanStack Query best practices - caching, invalidation, optimistic updates?
- [ ] What happens during pending/loading states?
- [ ] Should filters reset pagination? How to handle?

### 4. Bulk Actions

- [ ] Batch API vs individual API calls - what's better?
- [ ] Optimistic updates vs waiting for server response?
- [ ] Partial failure handling - some succeed, some fail?
- [ ] Confirmation dialogs - is our approach solid?
- [ ] What UX for bulk actions with many items?
- [ ] Should we limit bulk action count?

### 5. Export Functionality

- [ ] Client-side vs server-side export - when to use which?
- [ ] Large dataset handling - what if 10,000 tenants?
- [ ] File format decisions - CSV sufficient? JSON too?
- [ ] What data to include in export?
- [ ] Progress indicator for large exports?

### 6. Testing

- [ ] What tests should we write?
- [ ] Unit tests for backend filtering logic?
- [ ] Integration tests for API endpoint?
- [ ] E2E tests for user flows?
- [ ] Edge cases to test?

### 7. Compliance with AGENTS.md

Our project has strict conventions in `AGENTS.md`. Please verify:

- [ ] Does the plan follow C# coding standards?
- [ ] Does it follow frontend coding standards?
- [ ] Are we using correct patterns for this codebase?
- [ ] API route conventions followed?
- [ ] Error handling patterns correct?
- [ ] Naming conventions correct?

### 8. New Conventions & Rules

**This is critical.** We're introducing search/filter functionality for the first time in this project. We NEED solid conventions for future features.

- [ ] Should we create a reusable search/filter hook pattern?
- [ ] Should we establish conventions for filter URL params across all list pages?
- [ ] Should we create shared filter components?
- [ ] What's the pattern for maintaining filter state?
- [ ] Should we create a convention document for search/filter?

### 9. Product & UX Considerations

- [ ] Is the UX intuitive?
- [ ] Loading states - are they handled gracefully?
- [ ] Empty states - do we show helpful messages?
- [ ] Accessibility - are we considering a11y?
- [ ] Mobile responsiveness - how do filters work on small screens?
- [ ] Should we show result count to users?

### 10. Performance

- [ ] Database query performance with filters?
- [ ] Frontend render performance with many rows?
- [ ] Memory usage for export?
- [ ] Should we implement virtual scrolling?

### 11. Security

- [ ] Authorization - can staff users only see what they should?
- [ ] Input sanitization for search queries?
- [ ] Rate limiting concerns?
- [ ] Export security - what data is exposed?

### 12. Anything Else

- [ ] What did we miss?
- [ ] What else could go wrong?
- [ ] What would you do differently?
- [ ] Other concerns or suggestions?

---

## Expected Output Format

Please provide in your review file:

### 1. Executive Summary
One paragraph on overall plan quality

### 2. Critical Issues
Must-fix before implementation (highest priority)
- For each issue: explain WHY it's critical, WHAT the problem is, and HOW to fix it

### 3. Recommended Improvements
Should fix (high priority)
- For each: explain the issue and propose solution

### 4. Suggestions
Nice to have (medium priority)

### 5. Code Examples & Alternative Implementations

**IMPORTANT:** If you challenge any key point or suggest a better implementation approach, you MUST include:

- **Code snippets** showing the suggested implementation
- **Before/after comparisons** where relevant
- **Scenario examples** demonstrating when your approach is better
- **Trade-off analysis** explaining pros/cons

For example, if you think we should use URL params instead of local state:
```typescript
// Example: How URL params would work
const [searchParams, setSearchParams] = useSearchParams();

// Filter from URL
const status = searchParams.get('status') || null;

// Update URL when filter changes
const handleStatusChange = (newStatus: string) => {
  setSearchParams(prev => {
    newStatus ? prev.set('status', newStatus) : prev.delete('status');
    return prev;
  });
};
```

Or if you suggest batch API for bulk actions:
```csharp
// Example: Batch endpoint
public async Task<BulkSuspendResult> BulkSuspendAsync(
    List<Guid> tenantIds,
    CancellationToken ct
) {
    // Process all in single transaction
    // Return detailed results per tenant
}
```

### 6. New Conventions
Proposed rules/patterns for future features

### 7. Questions
Things we need to clarify before proceeding

### 8. Alternative Approaches
If you were to redesign this, how would you do it differently?

---

## Additional Context

### Tech Stack

- Backend: .NET 10, Entity Framework Core, PostgreSQL
- Frontend: React 19, Material UI v6, TanStack Query, Material React Table
- Auth: Session-based with permission filters
- i18n: i18next with translations in JSON

### Relevant Project Files

- `AGENTS.md` - Project conventions and rules
- `docs/guides/csharp-coding-standards.md` - C# patterns
- `docs/guides/frontend-coding-standards.md` - React patterns
- `apps/api/Src/Modules/Tenants/` - Existing tenant module code
- `apps/front/src/routes/authed/staff/tenants/` - Existing frontend code

---

## Thank You

Your thorough review will help us build a solid foundation for this feature and future search/filter implementations across the application.

Write your complete review to: `docs/plans/2026-02-25-tenant-list-gpt-review.md`
