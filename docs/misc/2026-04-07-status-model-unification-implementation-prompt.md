# Status Model Unification Implementation Prompt

Implement the approved plan in:

`docs/superpowers/plans/2026-04-06-status-model-unification.md`

Use the design spec as supporting context:

`docs/superpowers/specs/2026-04-06-status-model-unification-design.md`

## Execution Mode

You are executing an approved implementation plan, not redesigning it.

Follow the plan task by task, in order. Do not broaden the scope unless the current code makes a plan step technically impossible. If you find a contradiction between the plan and the codebase, stop and explain the contradiction before proceeding.

## Core Goal

Unify lifecycle modeling across:

- `User`
- `Tenant`
- `UserAccount`
- `Invitation`
- `Project`

The target model is enum-first:

- `User.Status`
- `Tenant.Status`
- `UserAccount.Status`
- `Invitation.Status`
- `Project.Status`

Remove the redundant boolean lifecycle fields:

- `User.IsSuspended`
- `Tenant.IsSuspended`
- `UserAccount.IsSuspended`
- `Invitation.IsAccepted`
- `Invitation.IsRevoked`
- `Project.IsActive`

Also remove `UserStatus.Banned`.

## Important Domain Rules

- `User.Status == Suspended` is the global identity suspension state.
- `Tenant.Status == Suspended` is the tenant lifecycle suspension state.
- `UserAccount.Status == Suspended` is membership-local suspension only.
- `GloballySuspended` must stay a derived tenant-user read-model status. Do not persist it as a local `UserAccount` lifecycle state.
- `Invitation.Status` owns invitation lifecycle. Keep `AcceptedAt` and `RevokedAt` as event metadata.
- `Expired` may remain derived from `Invitation.Status == Pending && ExpiresAt <= now`.
- `Project.Status` replaces `Project.IsActive`.

## Repo Rules

Follow `AGENTS.md` and the referenced guides.

Important rules for this work:

- Use integration tests only for API behavior changes.
- Use service-owned args records for service methods with 3+ parameters.
- Use discriminated-union service results where service methods have multiple outcome states.
- Use guard clauses for discriminated-union service results.
- Do not use inline `ToLower()` / `ToLowerInvariant()` as comparison or dispatch strategy.
- Use query syntax for database LINQ queries where the repo already does.
- After API contract changes, run `make build-api`, `make generate-client`, and `make tsc-front`.
- Do not manually edit generated client files except through `make generate-client`.
- For frontend local mutation error messages, use `getFailureMessage(toApiFailure(error), ...)`; do not manually translate `response-message` keys at the call site.

## Required Workflow

1. Start by reading the plan file fully.
2. Execute tasks in order.
3. For each task:
   - write or update the failing integration test first
   - run the focused test and confirm it fails for the expected reason
   - implement the minimum correct change
   - rerun the focused test and confirm it passes
   - run the task-level build/type-check command listed in the plan
4. Do not skip migration work.
5. Do not skip API client generation if the API contract changes.
6. Do not leave compatibility shims for removed boolean fields unless explicitly required by a migration or legacy API contract.

## Final Verification

Before reporting completion, run the final regression commands from the plan:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUsersAsStaffSpec|FullyQualifiedName~UpdateTenantUserAsStaffSpec|FullyQualifiedName~SuspendTenantUserAsStaffSpec|FullyQualifiedName~ReactivateTenantUserAsStaffSpec|FullyQualifiedName~UpdateStaffUserSpec|FullyQualifiedName~GetUserTenantsForPickerSpec|FullyQualifiedName~GetTenantAuthDataSpec|FullyQualifiedName~PasswordLoginSpec"
```

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindInvitationsForTenantAsStaffSpec|FullyQualifiedName~AcceptInvitationSpec|FullyQualifiedName~RevokeInvitationSpec|FullyQualifiedName~Project"
```

```powershell
cd ../..
dotnet build apps/api/MainApi.csproj -c Test
make build-api
make generate-client
make tsc-front
```

If any React files are changed, also run:

```powershell
cd apps/front
npx -y react-doctor@latest . --verbose --diff
```

## Final Report

When done, report:

- files changed
- migrations created
- generated client status
- tests run and exact results
- any residual risks or follow-up items

Do not claim the branch is mergeable unless all required verification has passed or you explicitly identify the only remaining failures as pre-existing and unrelated.
