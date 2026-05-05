# GPT Review Prompt: Phase 3 Tenant List Improvements - Round 3 Review

> **For:** GPT (or any senior software engineer reviewing this plan)
>
> **From:** Aki (AI assistant working with the development team)
>
> **Context:** This is Round 3 review. We addressed your Round 1 and Round 2 feedback. Please review the updated plan.

---

## Your Output

**IMPORTANT:** Write your complete review in a new markdown file:

`docs/plans/2026-02-25-tenant-list-gpt-review-v2.md`

---

## Instructions

You are a **highly experienced senior software engineer, architect, and product-minded technologist** reviewing an updated implementation plan for the tenant list page with search, filters, and bulk actions.

This is Round 3 - we incorporated your previous feedback including:
- Converting to cursor pagination
- Fixing param naming (`q`, `sortId`)
- Fixing debounce (lodash)
- Fixing status UI (MUI Select multiple)
- Making pg_trgm migration executable

**Please do a final go/no-go readiness check.** Focus on remaining blockers and implementation correctness. Challenge assumptions, identify gaps, and ensure we produce production-grade software.

---

## Implementation Plan to Review

The full revised implementation plan is saved at:

**`docs/plans/2026-02-25-tenant-list-search-filter.md`**

Please read that file first to understand the complete plan.

### Plan Summary (Revised v2)

We're implementing 4 features with **cursor pagination**:

| # | Feature | Implementation |
|---|---------|----------------|
| 3.1 | Search by tenant name | `q` param + ILike + pg_trgm |
| 3.2 | Filter by status (multi-select) | `status=Active,Pending` via MUI Select multiple |
| 3.3 | Filter by suspension state | Maps to Status=Suspended |
| 3.4 | Bulk actions | Client fan-out with p-limit(5) |

### Key Technical Decisions in Revised Plan

1. **Cursor Pagination**: Converted from offset to cursor-based
2. **Query Binding**: `[FromQuery(Name = "q")] string? Search`
3. **Search**: `EF.Functions.ILike` + pg_trgm with `suppressTransaction: true`
4. **Filter State**: URL via nuqs, reset via `resetCursorPagination()`
5. **Debounce**: lodash `_.debounce` (300ms)
6. **Status UI**: MUI Select with `multiple` prop
7. **Sort Fields**: Limited to `created_at`, `name`, `updated_at`
8. **Invalid sortId**: Returns 400 BadRequest

### Reference Patterns Used

- Backend: `apps/api/Src/Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs`
- Frontend: `apps/front/src/routes/authed/staff/invitations/list/parts/staff-invitations-table.tsx`

---

## Review Criteria

### 1. Go/No-Go Readiness

- [ ] Any remaining blockers that would cause immediate breakage?
- [ ] Is the cursor pagination implementation correct?
- [ ] Are there any contract mismatches (API vs frontend)?

### 2. Cursor Pagination Specific

- [ ] Is the keyset pagination logic correct?
- [ ] Are the sort field restrictions appropriate?
- [ ] Does the cursor error handling work as expected?
- [ ] Are the database indexes sufficient for cursor pagination?

### 3. Search Performance

- [ ] Is ILike usage correct for case-insensitive search?
- [ ] Are pg_trgm indexes properly configured?
- [ ] Is the migration executable (suppressTransaction)?

### 4. Frontend Integration

- [ ] Does the nuqs + useTableState integration work?
- [ ] Is debounce properly implemented with cleanup?
- [ ] Are filter changes correctly resetting cursor pagination?
- [ ] Are stable row IDs implemented?

### 5. Bulk Actions

- [ ] Is p-limit concurrency control appropriate?
- [ ] Is the partial failure UX clear?
- [ ] Is selection properly cleared after action?

### 6. Compliance with Project Conventions

- [ ] Does it follow AGENTS.md patterns?
- [ ] Are C# coding standards met?
- [ ] Are React/TypeScript conventions followed?
- [ ] Are i18n paths correct?

### 7. Edge Cases

- [ ] Empty search/filter handling?
- [ ] Invalid cursor handling?
- [ ] Large result set handling?
- [ ] Concurrent filter + sort changes?

---

## Expected Output Format

### 1. Verdict
Go / No-Go with reasoning

### 2. Critical Issues (Must-Fix)
- What the issue is
- Why it's critical
- How to fix it
- Code example if applicable

### 3. Recommended Improvements (Should-Fix)
- What could be better
- Suggested solution
- Code example if applicable

### 4. Questions
- Things we need to clarify

### 5. Final Notes
- Any other observations

---

## Additional Context

### Tech Stack

- Backend: .NET 10, Entity Framework Core, PostgreSQL
- Frontend: React 19, Material UI v6, TanStack Query, Material React Table, nuqs
- Pagination: Cursor-based (converted from offset)
- i18n: i18next with translations in JSON

### Relevant Project Files

- `AGENTS.md` - Project conventions
- `apps/api/Src/Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs` - Cursor pattern
- `apps/front/src/routes/authed/staff/invitations/list/parts/staff-invitations-table.tsx` - Cursor table pattern

---

## Thank You

Your review will help us proceed confidently with implementation.

Write your complete review to: `docs/plans/2026-02-25-tenant-list-gpt-review-v2.md`
