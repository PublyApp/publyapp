# Architecture Details

> Extracted from `AGENTS.md` — detailed architecture information for the PublyApp platform including business rules, database layer, authentication, and internationalization.

## Staff/Tenant Account Mutual Exclusivity

**Business Rule:** A `User` can only have `UserAccount` records of ONE scope type:
- Either **Staff** (platform administrator)
- Or **Tenant/Project** (customer)
- Never both

**Rationale:**
- Conflict of interest: Platform admins shouldn't also be customers with the same identity
- Session model simplicity: User-scoped sessions would be ambiguous with mixed scopes
- Audit clarity: Actions are clearly "as staff" or "as customer"

**Enforcement Points:**
- `AccountService.CreateStaffAccountAsync()` - Rejects if user has tenant/project accounts
- `AccountService.CreateTenantAccountAsync()` - Rejects if user has staff account
- `AcceptInvitation` handler - Validates scope conflicts before accepting staff/tenant invitations
- `CreateStaffInvitation` / `BulkCreateStaffInvitations` handlers - Proactively reject invitations to users with conflicting accounts

**Suspension Behavior:**
- **Suspended accounts still count** toward mutual exclusivity
- Rationale: Suspension is temporary; the identity conflict remains
- Implementation: `Has*Account*` methods check `!IsDeleted` but NOT `IsSuspended`
- This prevents using suspension as a loophole to bypass the business rule

**Dogfooding Approach:**
- Use the **impersonation feature** (staff can impersonate tenant users for support/testing)
- Or use a **separate user account** (different email) for real customer experience

## Database Layer (EF Core)

**Key Patterns:**
- PostgreSQL 18 with UUID v7 primary keys (database-generated)
- Soft deletes: `IsDeleted` flag set automatically on Delete()
- Hard deletes: Use `ForceHardDelete()` method explicitly
- Audit tracking: `CreatedAt`, `UpdatedAt`, `DeletedAt` set automatically
- Base entity: All entities inherit from `BaseAttributes`

**Important entities:**
```csharp
DbSet<User>               // Users (email, password, status)
DbSet<UserAccount>        // Accounts (scope: Staff/Tenant/Project)
DbSet<Tenant>             // Tenants (multi-tenant organizations)
DbSet<Session>            // User sessions (authentication tokens)
DbSet<Profile>            // User profiles/roles
DbSet<ProfilePermission>  // Profile-permission mappings
DbSet<Permission>         // Available permissions
DbSet<Project>            // Projects (future use)
```

**Migration workflow:**
1. Make entity changes in `apps/api/Src/Data/`
2. Run `make db-add NAME=DescriptiveName`
3. Review generated migration in `apps/api/Migrations/`
4. Run `make db-migrate` to apply

## Authentication & Authorization

**Authentication:**
- Session-based with token in `X-Session-Token` header
- `AuthContext`: Scoped service providing current user info
- Middlewares: `SessionAuthMiddleware`, `StaffAuthMiddleware`, `TenantAuthMiddleware`

**Authorization:**
- Permission-based using `PermissionFilter`
- Permissions defined in `Permission` entity
- Profile-permission mappings in `ProfilePermission`

**Middleware order (critical):**
1. Security headers
2. Exception handling
3. CORS
4. Tenant header check
5. Session header check
6. Session authentication
7. Staff authorization (for `/staff/*` routes)

## Multi-Tenant Architecture

**Three tenant scopes:**
- `ITenantEntity`: Tenant-scoped entities (filtered by TenantId)
- `IOptionalTenantEntity`: Entities that may or may not belong to a tenant
- `INoTenantEntity`: Global entities (Staff, permissions)

**Automatic tenant isolation:**
- EF Core global query filters applied in DbContext
- `TenantContext` provides current tenant info (scoped service)
- Tenant ID from `X-Tenant-Id` header (injected via middleware)

## Internationalization (i18n)

**Translation workflow:**
1. Add translations to `packages/shared/lib/i18n/json/*.json`
2. Auto-generated C# constants in `apps/api/Src/Generated/ResponseKeys.g.cs`
3. Auto-generated Zod i18n map on `pnpm install`

**Translation namespaces:**
- `common`: General UI translations
- `zod`: Validation error messages
- `response-message`: API response messages

**Usage:**
```typescript
// Frontend
const { t } = useTranslation('common');
t('key.path');

// Backend
using static PublyApp.Api.Generated.ResponseKeys;
return TypedProblems.BadRequest("Validation failed", ValidationError);
```
