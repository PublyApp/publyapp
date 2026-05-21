# Common Workflows

> Extracted from `AGENTS.md` — step-by-step checklists for common development tasks.

## Adding a New Feature

**Backend:**
1. Create module directory: `apps/api/Modules/<Domain>/`
2. Create service: `[Feature]Service.cs`
3. Create handlers in `Handlers/` directory
4. Create validators using FluentValidation
5. Register endpoints in `[Feature]Endpoints.cs`
6. Add route constants to `apps/api/Lib/RoutePath.cs`
7. Add translation keys to `packages/shared/lib/i18n/json/en/response-message.json`
8. If database changes: `make db-add NAME=MigrationName` then `make db-migrate`
9. Generate client: `make generate-client`

**Frontend:**
1. Create route file in `app/routes/[section]/[page]/`
2. Add route to `app/routes.ts`
3. Create query/mutation hooks using `react-query-kit`
4. Use auto-generated API client from `packages/js-client`
5. Add translations to `packages/shared/lib/i18n/json/en/common.json`

## Updating API Contract

**After changing request/response types or endpoints:**

```bash
# 1. Build API to generate updated OpenAPI spec
make build-api

# 2. Generate updated TypeScript client
make generate-client

# 3. Update frontend code to use new types
```

The TypeScript client is auto-generated - never modify files in `packages/js-client/` manually.

## Adding Database Entities

1. Create entity class in `apps/api/Modules/<Domain>/Entities/[Entity].cs`
2. Implement appropriate tenant interface: `ITenantEntity`, `IOptionalTenantEntity`, or `INoTenantEntity`
3. Inherit from `BaseAttributes` for automatic audit tracking
4. Add `DbSet<[Entity]>` to `MainApiDbContext`
5. Configure entity in `OnModelCreating` if needed
6. Create migration: `make db-add NAME=Add[Entity]Table`
7. Review and apply: `make db-migrate`

## Adding a Bulk Action Endpoint

For UX rules, mutation hook patterns, and i18n key conventions, see
[`bulk-action-ux-conventions.md`](bulk-action-ux-conventions.md). Quick
backend + frontend checklist:

1. **Handler** under `Handlers/<Scope>/` accepting an array body; validate
   it with FluentValidation using `maxCount: 100` (mirrors the frontend
   `BULK_ACTION_MAX_COUNT` constant).
2. **Service method** that batches: a single SELECT for the targeted
   rows, a single tracker mutation pass, and one `SaveChangesAsync` —
   not a loop calling the per-item method.
3. **Audit log** via `LogManyAsync` so each affected entity gets one
   audit row in the same transaction.
4. **Endpoint** registered with the appropriate `.WithPermission()`.
5. **Frontend selection-actions** wired through the shared MRT toolbar
   slot; respect `BULK_ACTION_MAX_COUNT` client-side.
6. **Mutation hook** with split try/catch so partial failures surface
   the right toast and don't swallow audit/refresh side effects.
7. **i18n keys** added to both `en` and `fr` `response-message.json`
   plus the relevant `common.json` namespaces.

## Handling Permissions

**Adding a new permission:**
1. Add permission to database seed in `apps/api/Data/Seeder.cs`
2. Use `PermissionFilter` on endpoints that require it
3. Check permissions in handlers via `AuthContext`

**Example:**
```csharp
public static async Task<Results<
    Ok<Response>,
    AppForbiddenHttpResult
>> Handle(
    [FromServices] IAuthContext auth,
    // ... other params
)
{
    if (!auth.HasPermission("staff_member.update"))
    {
        return TypedProblems.Forbidden(
            "Forbidden",
            ResponseKeys.Forbidden
        );
    }

    // ... handler logic
}
```
