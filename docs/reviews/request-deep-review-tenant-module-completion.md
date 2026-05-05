# Deep Code Review Prompt

You are a **Principal Software Engineer** with 15+ years of experience in full-stack development, and a **Technical Product Manager** with a strong background in SaaS architecture. You have been asked to perform a **comprehensive, deep-dive code review** of the tenant module completion work implemented in this repository.

---

## Context

The implementation covers the following features from the `docs/plans/2026-03-05-tenant-module-completion.md` plan:

### Phase 3 - List Improvements (Workstream A)
- **A2: Bulk Actions** - Backend handlers for bulk suspend/reactivate/delete tenants
- **A3: Export** - CSV/JSON export functionality

### Phase 4 - User Management (Workstream B)
- **B3: Invite User** - Backend handler + Frontend UI (drawer form)
- **B4: Remove User** - Backend endpoint + Frontend hook + wired to table
- **B5: Change User Level** - Backend endpoint + Frontend hook + menu in table
- **B6: Search/Filter Tenant Users** - Backend query params + Frontend search/filter UI

### Phase 5 - Integration Tests (Workstream C)
- **C1: Create Tenant Tests** - New test file created
- **C2: Find Tenants Tests** - Already existed, verified

---

## Your Mission

Review **every single file changed or created** as part of this implementation. Evaluate them as both an engineer and a product person. Be exhaustive, critical, and constructive.

### What to Review

1. **Architecture & Design**
   - Does the implementation follow the vertical slice, domain-first architecture?
   - Are handlers properly structured per the existing patterns?
   - Is the separation of concerns respected (handlers vs services)?

2. **API Design & REST Conventions**
   - Are routes consistent with existing patterns in the codebase?
   - Are HTTP verbs used correctly (POST, PATCH, DELETE)?
   - Is the response format consistent with RFC 7807?

3. **Backend Implementation**
   - **Handler patterns**: Do handlers follow the same structure as existing ones?
   - **Service layer**: Are business logic properly in services, not handlers?
   - **Validation**: Is FluentValidation used correctly?
   - **Error handling**: Are errors handled consistently?
   - **Audit logging**: Is audit logging properly implemented?

4. **Frontend Implementation**
   - **React patterns**: Are hooks, components, and forms following existing patterns?
   - **TanStack Query**: Is data fetching/mutation done correctly?
   - **MUI usage**: Are Material UI components used appropriately?
   - **Form handling**: Is React Hook Form + Zod used correctly?

5. **Code Quality**
   - Are there any code smells?
   - Are there inconsistencies with the rest of the codebase?
   - Is there duplicated code that could be refactored?

6. **Edge Cases**
   - What happens with empty responses?
   - What about concurrent operations?
   - Are there race conditions?
   - What about pagination edge cases?

7. **Security**
   - Are permissions properly enforced?
   - Is input validation sufficient?
   - Are there any injection risks?

8. **Testing**
   - Are tests well-structured?
   - Do they cover happy paths AND edge cases?

---

## Specific Points of Interest (User Observations)

### Observation 1: Route Path Consistency

The reviewer should examine this inconsistency:

```csharp
// @apps/api/Src/Modules/Tenants/Routes.Tenants.cs:25-27
// Current implementation uses:
public const string BulkSuspend = "/bulk/suspend";
public const string BulkReactivate = "/bulk/reactivate";
public const string BulkDelete = "/bulk/delete";
```

Compare with:
```csharp
// @apps/api/Src/Modules/Invitations/Routes.Invitations.cs:24,44,45
// Which uses:
public const string BulkCreate = "/bulk";
// And individual routes like:
public const string Accept = "/{token}/accept";
```

**Question**: Should bulk operations follow a `/delete/bulk`, `/reactivate/bulk`, `/suspend/bulk` pattern (action-first) or `/bulk/suspend` (bulk-first)? What is the convention in this repo?

### Observation 2: Query Parameter Handling

Compare these two implementations:

```csharp
// @apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs:31
// Uses:
public class FindTenantsAsStaffQuery : CursorPaginatedQuery { }

// vs

// @apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs:28
// Uses:
public class FindTenantUsersAsStaffQuery : CursorPaginatedQuery {
    public string? Q { get; set; }
    public string? Status { get; set; }
}
```

**Question**: The tenant query doesn't have Q/Status filters while the user query does. Is this intentional? Should both follow the same pattern?

---

## Files to Review

### Backend (API)

**Routes:**
- `apps/api/Src/Modules/Tenants/Routes.Tenants.cs` - Bulk action routes

**Services:**
- `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs` - Bulk operation methods
- `apps/api/Src/Modules/Users/Services/UserService.cs` - User management methods

**Handlers:**
- `apps/api/Src/Modules/Tenants/Handlers/Staff/BulkSuspendTenantsAsStaff.cs`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/BulkReactivateTenantsAsStaff.cs`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/BulkDeleteTenantsAsStaff.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.cs` - Both remove and update level
- `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs` - Search/filter query
- `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForTenantAsStaff.cs` - Endpoint mapping

**Entities:**
- `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs` - Audit actions

**Tests:**
- `apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.Spec.cs` - New test file
- `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.Spec.cs` - Existing tests

### Frontend

**Hooks:**
- `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts` - All tenant/user hooks

**Components:**
- `apps/front/src/routes/authed/staff/tenants/details/users/parts/invite-user-form.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`

**Configuration:**
- `apps/front/src/components/settings/section-page-with-drawer.tsx`

---

## Output Format

Write your review in a Markdown file at: `docs/reviews/tenant-module-completion-deep-review.md`

Structure it as follows:

```markdown
# Deep Review: Tenant Module Completion

## Executive Summary
[High-level overview of the implementation quality]

## Observations & Issues

### Critical Issues
[Must fix before merge - security, data integrity, breaking bugs]

### Major Issues
[Should fix - architectural problems, significant code smells]

### Minor Issues
[Nice to fix - inconsistencies, improvements]

### Questions & Clarifications
[Points where more context is needed]

## Positive Aspects
[What's good and should be preserved]

## Specific Observations

### 1. Route Path Consistency
[Analysis of Observation 1]

### 2. Query Parameter Handling
[Analysis of Observation 2]

## Detailed File Reviews
[Per-file analysis]

## Recommendations

### Immediate Actions
[What must be done before merge]

### Future Improvements
[What could be done in follow-up PRs]

## Code Examples
[Specific code suggestions with before/after examples]
```

---

## Important Guidelines

1. **Be Specific**: Don't just say "this is wrong" - explain WHY and show HOW to fix it
2. **Provide Examples**: Include code snippets showing better alternatives
3. **Reference Conventions**: Cite existing patterns in the codebase to support your arguments
4. **Consider Context**: Remember this is a multi-tenant SaaS app with specific security requirements
5. **Think Product**: Consider not just technical correctness but also UX, maintainability, and future extensibility

---

## Final Note

This is a **deep** review. Don't hold back. If something can be improved, say so. If there's a better way, show it. If you're uncertain, highlight it. The goal is to ensure this code is production-ready and maintainable.
