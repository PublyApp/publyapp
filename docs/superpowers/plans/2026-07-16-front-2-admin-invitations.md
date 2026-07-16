# Show account-level Admin tenant invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit account-level semantics for staff tenant invitations so account-level Admin and profile-less User invitations render correctly without inferring semantics from blank profile fields.

**Architecture:** Keep shared staff/tenant invitation API contracts untouched unless needed; if a shared DTO would broaden unrelated semantics, introduce a tenant-scoped response/row model that preserves existing behavior while adding explicit account-level metadata only for tenant staff listing. The backend contract will map persisted `Invitation.AccountLevel` directly, and the front-2 list mapper will render access truthfully from that contract.

**Tech Stack:** ASP.NET 10 minimal API + EF query service, C# records in Invitations module, Kiota-generated TypeScript client, React Router v7, TanStack Query mappings in front-2, automated tests with dotnet + Vitest/TypeScript tests.

---

### Task 1: Add explicit tenant invitation DTO contract for account-level semantics

**Files:**
- Modify: `apps/api/Modules/Invitations/Services/InvitationService.cs`
- Modify: `docs/project/notes` (none required unless generated contract behavior needs documented rationale)

- [ ] **Step 1: Add tenant-specific list item/result DTO with explicit account-level fields**

```csharp
public sealed class FindTenantInvitationsResult : CursorPaginatedResult<StaffTenantInvitationListItem>
{
}

public sealed record StaffTenantInvitationListItem(
    Guid Id,
    Guid Email,
    string Status,
    string Scope,
    string? ProfileName,
    string? AccountLevel,
    string AccountLevelDescription,
    string InvitedByName,
    DateTimeOffset? AcceptedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ExpiresAt);
```

- [ ] **Step 2: Update `FindTenantInvitationsForStaffResult` usages to use `FindTenantInvitationsResult` of tenant-specific item**

```csharp
public sealed class FindInvitationsForTenantAsStaffResult : FindTenantInvitationsResult
{
}
```

- [ ] **Step 3: Map account-level fields directly from persisted invitation entity in the query shape**

```csharp
Invitation.AccountLevel,
AccountLevelDescription = UserAccount.GetLevelDescription(Invitation.AccountLevel),
ProfileName = profileName
```

- [ ] **Step 4: Run build of API project to detect contract propagation compile impact**

Run: `cd apps/api && dotnet build`
Expected: build passes with explicit field additions only used where mapped.

### Task 2: Add API-level failing tests for tenant invitation contract semantics (RED)

**Files:**
- Modify: `apps/api/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.Spec.cs`
- Modify: `apps/api/Modules/Invitations/Services/InvitationQueryService.cs` (if necessary for test setup helpers)

- [ ] **Step 1: Add test fixture for account-level Admin with no profile on tenant invitation**

```csharp
[Fact]
public async Task ItShouldReturnAccountLevelOnTenantInvitation()
{
    // Arrange an invitation with AccountLevel.Admin and no profile
    // Act endpoint result
    // Assert returned row has AccountLevel == "admin" and ProfileName == null/empty and Access text can be mapped deterministically
}
```

- [ ] **Step 2: Add test ensuring profile-less User invitation remains distinct from admin without pretending admin**

```csharp
[Fact]
public async Task ItShouldDistinguishProfileLessUserFromAdmin()
{
    // Arrange one invitation with AccountLevel.User and no profile
    // Act
    // Assert row has AccountLevel == "user" and ProfileName == null/empty
}
```

- [ ] **Step 3: Add test ensuring profile-based invitation unchanged with no account-level regression**

```csharp
[Fact]
public async Task ItShouldReturnProfileNameForProfileBasedInvite()
{
    // Arrange
    // Act
    // Assert AccountLevelDescription matches User and ProfileName populated from joined profile
}
```

- [ ] **Step 4: Run only these API specs to confirm expected failures (RED)**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~FindInvitationsForTenantAsStaffSpec"`
Expected: new tests fail because contract/mapping not yet implemented.

### Task 3: Implement backend account-level propagation in tenant query service (GREEN)

**Files:**
- Modify: `apps/api/Modules/Invitations/Services/InvitationQueryService.cs`

- [ ] **Step 1: Extend tenant invitation projection to include `AccountLevel` and `AccountLevelDescription` from `Invitation`**

```csharp
query.Select(inv => new StaffTenantInvitationListItem
{
    ...,
    AccountLevel = Invitation.AccountLevel.ToString(),
    AccountLevelDescription = UserAccount.GetLevelDescription(Invitation.AccountLevel),
});
```

- [ ] **Step 2: Ensure mapping never mutates missing profiles into fake values**

```csharp
ProfileName = profileName,
```

- [ ] **Step 3: Re-run focused spec file to verify pass (GREEN)**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~FindInvitationsForTenantAsStaffSpec"`
Expected: all targeted tests pass.

### Task 4: Regenerate API contract and sync generated TypeScript client

**Files:**
- Run project commands only, expect generated file deltas

- [ ] **Step 1: Generate updated OpenAPI/kiota artifacts**

Run: `cd /home/radan/Projects/PublyApp/publyapp/.worktrees/front-2-admin-invitations && just build-api && just generate-client`
Expected: `packages/client-ts` updates include tenant invitation DTO/account-level fields.

- [ ] **Step 2: Re-scan generated front type usage to identify required model updates**

No command output required beyond changed DTO list.

### Task 5: Update front-2 row mapper/tests for explicit semantics and avoid profile-based filtering (RED)

**Files:**
- Modify: `apps/front-2/src/lib/query/staff-tenant-invitations.ts`
- Modify: `apps/front-2/src/lib/query/staff-tenant-invitations.test.ts`

- [ ] **Step 1: Extend row type with account-level metadata**

```ts
export type StaffTenantInvitationRow = {
  profileName: string | null;
  accountLevel: 'admin' | 'user' | string | null;
  accountLevelDescription: string | null;
  ...
};
```

- [ ] **Step 2: Render access text from explicit account-level semantics instead of blank-profile heuristics**

```ts
const accountLevel = item.accountLevel;
const access =
  accountLevel === 'admin'
    ? 'Admin'
    : profileName
      ? profileName
      : (accountLevelDescription ?? 'User');
```

- [ ] **Step 3: Remove row-dropping guard that blocks missing profiles**

```ts
if (!id || !email || !invitedByName) return; // keep account-level fallback path
```

- [ ] **Step 4: Add/adjust unit tests for: admin no-profile row kept, profile-less user keeps truthful fallback, existing profile row unchanged**

```ts
it('keeps admin tenant invite with missing profile', () => {
  // map and assert row exists and access resolves as Admin
});
```

- [ ] **Step 5: Run focused front unit tests and assert expected fail first (RED)**

Run: `cd apps/front-2 && pnpm test src/lib/query/staff-tenant-invitations.test.ts`
Expected: failing before mapper update.

### Task 6: Update tenant invitations table rendering to show account-level access

**Files:**
- Modify: `apps/front-2/src/routes/authed/staff/tenants/$tenantId/invitations.tsx`

- [ ] **Step 1: Keep existing compact/responsive table structure and render explicit access text column**

```tsx
<TableCell>
  <Typography>{row.profileDisplay}</Typography>
</TableCell>
```

- [ ] **Step 2: Ensure no fake/blank rendering for admin invites**

```tsx
{row.accountLevel === 'admin' ? t('admin') : row.profileDisplay}
```

- [ ] **Step 3: Verify route rendering with existing component tests/manual flow (no separate broad render suite required)**

- [ ] **Step 4: Re-run focused front tests for route-level usage if available**

### Task 7: Verify and validate end-to-end consistency

**Files:**
- Run checks against changed surfaces

- [ ] **Step 1: Run targeted API + front unit test commands**

Run: 
- `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~FindInvitationsForTenantAsStaffSpec"`
- `cd apps/front-2 && pnpm test src/lib/query/staff-tenant-invitations.test.ts`

- [ ] **Step 2: Run TypeScript generation consistency and typecheck/format checks**

Run:
- `cd apps/front-2 && pnpm tsc`
- `cd apps/front-2 && pnpm lint`
- `cd apps/api && dotnet format`

- [ ] **Step 3: Capture diff summary and confirm zero unintended changes outside scope**

Run: `git status --short`

- [ ] **Step 4: Commit coherent changes**

```bash
git add apps/api/Modules/Invitations/Services/InvitationService.cs \
  apps/api/Modules/Invitations/Services/InvitationQueryService.cs \
  apps/api/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs \
  apps/api/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.Spec.cs \
  apps/front-2/src/lib/query/staff-tenant-invitations.ts \
  apps/front-2/src/lib/query/staff-tenant-invitations.test.ts \
  apps/front-2/src/routes/authed/staff/tenants/$tenantId/invitations.tsx \
  docs/superpowers/plans/2026-07-16-front-2-admin-invitations.md \
  packages/client-ts/*

git commit -m "fix: surface tenant invitation account-level access"
```

### Task 8: Self-review the plan

- [ ] **Step 1: Re-check spec coverage against tasks**
- [ ] **Step 2: Remove placeholder patterns from plan text or commands**
- [ ] **Step 3: Verify all signatures/field names align across backend and front tasks**

**Self-review checklist:**
- Spec coverage: each required behavior (account-level explicitness, no fake profile fallback, mapper retention, rendering, tests, generation, checks) maps to a task.
- Placeholder scan: no `TODO` or conceptual-only steps remain.
- Type consistency: tenant list item field names match all mapping and front mapping updates.

Plan complete and saved to `docs/superpowers/plans/2026-07-16-front-2-admin-invitations.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

