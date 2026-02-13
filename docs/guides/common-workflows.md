# Common Workflows

> Extracted from `AGENTS.md` — step-by-step checklists for common development tasks.

## Adding a New Feature

**Backend:**
1. Create module directory: `apps/api/Src/Modules/<Domain>/`
2. Create service: `[Feature]Service.cs`
3. Create handlers in `Handlers/` directory
4. Create validators using FluentValidation
5. Register endpoints in `[Feature]Endpoints.cs`
6. Add route constants to `apps/api/Src/Lib/RoutePath.cs`
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

1. Create entity class in `apps/api/Src/Modules/<Domain>/Entities/[Entity].cs`
2. Implement appropriate tenant interface: `ITenantEntity`, `IOptionalTenantEntity`, or `INoTenantEntity`
3. Inherit from `BaseAttributes` for automatic audit tracking
4. Add `DbSet<[Entity]>` to `MainApiDbContext`
5. Configure entity in `OnModelCreating` if needed
6. Create migration: `make db-add NAME=Add[Entity]Table`
7. Review and apply: `make db-migrate`

## Handling Permissions

**Adding a new permission:**
1. Add permission to database seed in `apps/api/Src/Data/Seeder.cs`
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
