# API Folder Structure Refactoring Plan

## Executive Summary

This document outlines the plan to reorganize `apps/api/Src/Features/` to align with **Vertical Slice Architecture** principles, separating entity definitions, shared services, and context-based features.

## Current Problems

1. **Mixed Concerns**: Entities, services, seeders, and features are all in `Features/Common/`
2. **Ambiguous "Common"**: Unclear whether it means "shared utilities" or "common entities"
3. **Namespace Inconsistency**: Entities use `Features.Common.{Entity}` namespace
4. **DbContext Imports**: MainApiDbContext imports from `Features/Common/*`, violating layering

## Target Structure

```
apps/api/Src/
├── Data/
│   ├── Entities/                        # ✨ NEW - All entity definitions
│   │   ├── User.cs
│   │   ├── UserAccount.cs
│   │   ├── UserAccountProfile.cs
│   │   ├── Profile.cs
│   │   ├── ProfilePermission.cs
│   │   ├── Tenant.cs
│   │   ├── Project.cs
│   │   ├── Session.cs
│   │   ├── Permission.cs
│   │   └── Product.cs
│   │
│   ├── Seeders/                         # ✨ NEW - All seeder classes
│   │   ├── UserSeeder.cs
│   │   ├── UserAccountSeeder.cs
│   │   ├── TenantSeeder.cs
│   │   └── PermissionSeeder.cs
│   │
│   ├── DbContext/
│   │   ├── MainApiDbContext.cs
│   │   └── TenantExtension.cs
│   │
│   ├── BaseAttributes.cs
│   ├── IEntity.cs
│   ├── IEntitySeeder.cs
│   └── DbSetExtensions.cs
│
├── Services/                            # ✨ NEW - Shared/reusable services
│   ├── EmailService.cs                  # Cross-cutting email service
│   ├── PasswordService.cs               # Shared password hashing/validation
│   └── IEmailService.cs                 # Interface for EmailService
│
└── Features/
    ├── Auth/                            # ✨ MOVED from Common/Auth
    │   ├── Handlers/
    │   │   ├── PasswordLogin.cs
    │   │   ├── PasswordRegister.cs
    │   │   ├── ResetPassword.cs
    │   │   ├── VerifyEmailRequest.cs
    │   │   ├── GetRedirectCode.cs
    │   │   ├── GetUserAuthData.cs
    │   │   ├── GetTenantAuthData.cs
    │   │   ├── CheckEmailVerificationToken.cs
    │   │   ├── CheckResetPasswordToken.cs
    │   │   └── GetVerificationLink.cs
    │   ├── AuthService.cs               # Auth-specific business logic
    │   ├── AuthEndpoint.cs
    │   └── AuthUtils.cs
    │
    ├── Staff/                           # Staff business context (unchanged)
    │   ├── ProfileAsStaff/
    │   ├── StaffMember/
    │   └── TenantAsStaff/
    │
    └── Tenant/                          # Tenant business context (unchanged)
        └── Product/
```

## Key Changes

### 1. Create `Data/Entities/` for All Entity Definitions

**Rationale**: Entities are data layer concerns, not features

**Files to Move**:
- `Features/Common/User/User.cs` → `Data/Entities/User.cs`
- `Features/Common/User/UserService.cs` → ❌ DELETE (unused)
- `Features/Common/Account/UserAccount.cs` → `Data/Entities/UserAccount.cs`
- `Features/Common/Account/UserAccountProfile.cs` → `Data/Entities/UserAccountProfile.cs`
- `Features/Common/Account/AccountService.cs` → ❌ DELETE (unused)
- `Features/Common/Profile/Profile.cs` → `Data/Entities/Profile.cs`
- `Features/Common/Profile/ProfilePermission.cs` → `Data/Entities/ProfilePermission.cs`
- `Features/Common/Profile/ProfileService.cs` → ❌ DELETE (unused)
- `Features/Common/Tenant/Tenant.cs` → `Data/Entities/Tenant.cs`
- `Features/Common/Tenant/TenantService.cs` → ❌ DELETE (unused)
- `Features/Common/Project/Project.cs` → `Data/Entities/Project.cs`
- `Features/Common/Project/ProjectService.cs` → ❌ DELETE (unused)
- `Features/Common/Session/Session.cs` → `Data/Entities/Session.cs`
- `Features/Common/Session/SessionService.cs` → ❌ DELETE (unused)
- `Features/Common/Permission/Permission.cs` → `Data/Entities/Permission.cs`
- `Features/Common/Permission/PermissionService.cs` → ❌ DELETE (unused)
- `Features/Tenant/Product/Product.cs` → `Data/Entities/Product.cs` (if entity-only)

**Namespace Changes**:
```csharp
// OLD
namespace MainApi.Src.Features.Common.User;

// NEW
namespace MainApi.Src.Data.Entities;
```

### 2. Create `Data/Seeders/` for All Seeder Classes

**Rationale**: Seeders are database initialization logic, not feature logic

**Files to Move**:
- `Features/Common/User/UserSeeder.cs` → `Data/Seeders/UserSeeder.cs`
- `Features/Common/Account/UserAccountSeeder.cs` → `Data/Seeders/UserAccountSeeder.cs`
- `Features/Common/Tenant/TenantSeeder.cs` → `Data/Seeders/TenantSeeder.cs`
- `Features/Common/Permission/PermissionSeeder.cs` → `Data/Seeders/PermissionSeeder.cs`

**Namespace Changes**:
```csharp
// OLD
namespace MainApi.Src.Features.Common.User;

// NEW
namespace MainApi.Src.Data.Seeders;
```

### 3. Create `Services/` for Shared Cross-Cutting Services

**Rationale**: Services used across multiple features should be shared utilities

**Files to Move**:
- `Features/Common/Email/EmailService.cs` → `Services/EmailService.cs`
- `Features/Common/Auth/PasswordService.cs` → `Services/PasswordService.cs`

**Namespace Changes**:
```csharp
// OLD
namespace MainApi.Src.Features.Common.Email;

// NEW
namespace MainApi.Src.Services;
```

**Interfaces to Create**:
```csharp
// Services/IEmailService.cs
namespace MainApi.Src.Services;

public interface IEmailService {
    Task SendEmailAsync(string to, string subject, string body, CancellationToken cancellationToken = default);
    Task SendVerificationEmailAsync(string to, string verificationLink, CancellationToken cancellationToken = default);
    Task SendPasswordResetEmailAsync(string to, string resetLink, CancellationToken cancellationToken = default);
}
```

### 4. Move `Auth/` Feature Out of `Common/`

**Rationale**: Auth is a feature with endpoints and handlers, not a "common" entity

**Files to Move**:
- `Features/Common/Auth/` → `Features/Auth/`

**Namespace Changes**:
```csharp
// OLD
namespace MainApi.Src.Features.Common.Auth;

// NEW
namespace MainApi.Src.Features.Auth;
```

**Keep these files**:
- All handlers in `Auth/Handlers/`
- `AuthService.cs` (contains business logic)
- `AuthEndpoint.cs`
- `AuthUtils.cs`

### 5. Delete `Features/Common/` Entirely

After moving all files, the `Features/Common/` directory should be empty and deleted.

## Implementation Steps

### Phase 1: Setup New Directories (5 minutes)

```bash
# Create new directories
mkdir -p apps/api/Src/Data/Entities
mkdir -p apps/api/Src/Data/Seeders
mkdir -p apps/api/Src/Services
```

### Phase 2: Move Entity Files (30 minutes)

**Order matters** - move in dependency order (least dependencies first):

1. **Move enums and simple entities**:
   ```bash
   # User entity (UserStatus enum included)
   git mv apps/api/Src/Features/Common/User/User.cs apps/api/Src/Data/Entities/User.cs

   # Session entity
   git mv apps/api/Src/Features/Common/Session/Session.cs apps/api/Src/Data/Entities/Session.cs

   # Permission entity
   git mv apps/api/Src/Features/Common/Permission/Permission.cs apps/api/Src/Data/Entities/Permission.cs

   # Tenant entity
   git mv apps/api/Src/Features/Common/Tenant/Tenant.cs apps/api/Src/Data/Entities/Tenant.cs

   # Project entity
   git mv apps/api/Src/Features/Common/Project/Project.cs apps/api/Src/Data/Entities/Project.cs
   ```

2. **Move entities with dependencies**:
   ```bash
   # UserAccount (depends on User, Tenant, Project)
   git mv apps/api/Src/Features/Common/Account/UserAccount.cs apps/api/Src/Data/Entities/UserAccount.cs

   # Profile (depends on Tenant, Project)
   git mv apps/api/Src/Features/Common/Profile/Profile.cs apps/api/Src/Data/Entities/Profile.cs

   # ProfilePermission (depends on Profile, Permission)
   git mv apps/api/Src/Features/Common/Profile/ProfilePermission.cs apps/api/Src/Data/Entities/ProfilePermission.cs

   # UserAccountProfile (depends on UserAccount, Profile)
   git mv apps/api/Src/Features/Common/Account/UserAccountProfile.cs apps/api/Src/Data/Entities/UserAccountProfile.cs
   ```

3. **Move Product entity (if it's entity-only)**:
   ```bash
   # Check if Product.cs has only entity definition
   # If yes: move it
   # If no: keep in Features/Tenant/Product/
   ```

4. **Update namespaces in all moved entity files**:
   - Find and replace `namespace MainApi.Src.Features.Common.{Entity};` → `namespace MainApi.Src.Data.Entities;`
   - Update imports: `using MainApi.Src.Features.Common.{Entity};` → `using MainApi.Src.Data.Entities;`

### Phase 3: Move Seeder Files (15 minutes)

```bash
# Move seeders
git mv apps/api/Src/Features/Common/User/UserSeeder.cs apps/api/Src/Data/Seeders/UserSeeder.cs
git mv apps/api/Src/Features/Common/Account/UserAccountSeeder.cs apps/api/Src/Data/Seeders/UserAccountSeeder.cs
git mv apps/api/Src/Features/Common/Tenant/TenantSeeder.cs apps/api/Src/Data/Seeders/TenantSeeder.cs
git mv apps/api/Src/Features/Common/Permission/PermissionSeeder.cs apps/api/Src/Data/Seeders/PermissionSeeder.cs
```

**Update namespaces**:
- Find and replace `namespace MainApi.Src.Features.Common.{Entity};` → `namespace MainApi.Src.Data.Seeders;`
- Update entity imports to `using MainApi.Src.Data.Entities;`

### Phase 4: Move Shared Services (15 minutes)

```bash
# Move services
git mv apps/api/Src/Features/Common/Email/EmailService.cs apps/api/Src/Services/EmailService.cs
git mv apps/api/Src/Features/Common/Auth/PasswordService.cs apps/api/Src/Services/PasswordService.cs
```

**Update namespaces**:
- Change to `namespace MainApi.Src.Services;`
- Update entity imports to `using MainApi.Src.Data.Entities;`

**Create interfaces**:
- Create `Services/IEmailService.cs`
- Extract interface from `EmailService`
- Register in DI container with interface

### Phase 5: Move Auth Feature (10 minutes)

```bash
# Move entire Auth directory
git mv apps/api/Src/Features/Common/Auth apps/api/Src/Features/Auth
```

**Update namespaces**:
- Find and replace `namespace MainApi.Src.Features.Common.Auth` → `namespace MainApi.Src.Features.Auth`
- Update imports in handlers
- Update `AuthService` imports to use `Data.Entities` and `Services`

### Phase 6: Delete Unused Service Files (5 minutes)

**Verify these services are unused, then delete**:
```bash
# These should be empty or contain minimal logic already in feature services
rm apps/api/Src/Features/Common/User/UserService.cs
rm apps/api/Src/Features/Common/Account/AccountService.cs
rm apps/api/Src/Features/Common/Profile/ProfileService.cs
rm apps/api/Src/Features/Common/Tenant/TenantService.cs
rm apps/api/Src/Features/Common/Project/ProjectService.cs
rm apps/api/Src/Features/Common/Session/SessionService.cs
rm apps/api/Src/Features/Common/Permission/PermissionService.cs
```

**If any contain logic**:
- Extract the logic into appropriate feature services (e.g., `StaffMemberService`, `AuthService`)
- Then delete the file

### Phase 7: Delete Empty Directories (2 minutes)

```bash
# Remove all Common subdirectories
rm -rf apps/api/Src/Features/Common/User
rm -rf apps/api/Src/Features/Common/Account
rm -rf apps/api/Src/Features/Common/Profile
rm -rf apps/api/Src/Features/Common/Tenant
rm -rf apps/api/Src/Features/Common/Project
rm -rf apps/api/Src/Features/Common/Session
rm -rf apps/api/Src/Features/Common/Permission
rm -rf apps/api/Src/Features/Common/Email

# Delete Common directory itself
rm -rf apps/api/Src/Features/Common
```

### Phase 8: Update All Imports Across Codebase (20 minutes)

**Run global find-and-replace**:

```bash
# Update entity imports
find apps/api/Src -type f -name "*.cs" -exec sed -i 's/using MainApi.Src.Features.Common.User;/using MainApi.Src.Data.Entities;/g' {} +
find apps/api/Src -type f -name "*.cs" -exec sed -i 's/using MainApi.Src.Features.Common.Account;/using MainApi.Src.Data.Entities;/g' {} +
find apps/api/Src -type f -name "*.cs" -exec sed -i 's/using MainApi.Src.Features.Common.Profile;/using MainApi.Src.Data.Entities;/g' {} +
find apps/api/Src -type f -name "*.cs" -exec sed -i 's/using MainApi.Src.Features.Common.Tenant;/using MainApi.Src.Data.Entities;/g' {} +
find apps/api/Src -type f -name "*.cs" -exec sed -i 's/using MainApi.Src.Features.Common.Project;/using MainApi.Src.Data.Entities;/g' {} +
find apps/api/Src -type f -name "*.cs" -exec sed -i 's/using MainApi.Src.Features.Common.Session;/using MainApi.Src.Data.Entities;/g' {} +
find apps/api/Src -type f -name "*.cs" -exec sed -i 's/using MainApi.Src.Features.Common.Permission;/using MainApi.Src.Data.Entities;/g' {} +

# Update Auth imports
find apps/api/Src -type f -name "*.cs" -exec sed -i 's/using MainApi.Src.Features.Common.Auth;/using MainApi.Src.Features.Auth;/g' {} +

# Update service imports
find apps/api/Src -type f -name "*.cs" -exec sed -i 's/using MainApi.Src.Features.Common.Email;/using MainApi.Src.Services;/g' {} +
```

**Manual verification required for**:
- `MainApiDbContext.cs` - update entity imports
- Feature services (`StaffMemberService`, `TenantAsStaffService`, etc.) - update entity imports
- Middleware files - update entity imports if used
- `Program.cs` - update DI registrations if needed

### Phase 9: Update DI Registrations (10 minutes)

**In `Program.cs` or service registration files**:

```csharp
// Update service registrations
builder.Services.AddScoped<IEmailService, EmailService>();  // Add interface
builder.Services.AddScoped<PasswordService>();              // Keep as concrete

// Remove any old service registrations for deleted services
// (UserService, AccountService, ProfileService, etc.)
```

### Phase 10: Build and Test (15 minutes)

```bash
# Clean build
make clean-api

# Rebuild API
make build-api

# Run migrations (should work if entities are found correctly)
make db-migrate

# Test development server
make dev-api
```

**Verify**:
- ✅ No compilation errors
- ✅ Entity relationships work correctly
- ✅ Seeders execute successfully
- ✅ API endpoints respond correctly
- ✅ Authentication flows work
- ✅ Tenant isolation works

### Phase 11: Update Documentation (10 minutes)

Update references in:
- `CLAUDE.md` - Update entity location references
- `docs/vertical-slice-design-principles.md` - Update example paths
- Any API documentation - Update architecture diagrams

## Testing Checklist

After each phase, verify:

### Phase 2 Completion (Entity Move)
- [ ] All entities compile without errors
- [ ] Entity relationships preserved
- [ ] No circular dependencies
- [ ] MainApiDbContext finds all entities

### Phase 3 Completion (Seeder Move)
- [ ] All seeders compile
- [ ] `DiscoverSeedersInternal()` finds all seeders
- [ ] Seeders execute in correct order
- [ ] Database seeds successfully

### Phase 5 Completion (Auth Move)
- [ ] Auth endpoints register correctly
- [ ] Login/Register works
- [ ] Email verification works
- [ ] Password reset works

### Phase 10 Completion (Final Build)
- [ ] Full API builds without warnings
- [ ] All endpoints accessible via `/scalar/v1`
- [ ] OpenAPI spec generates correctly
- [ ] Frontend TypeScript client generation works (`make generate-client`)
- [ ] All existing features work correctly

## Rollback Plan

If issues occur during refactoring:

1. **Git is your friend**: Use `git checkout` to revert specific files
2. **Commit after each phase**: Makes rollback easier
3. **Branch strategy**:
   ```bash
   # Create refactoring branch
   git checkout -b refactor/api-structure

   # Commit after each phase
   git add -A && git commit -m "Phase 2: Move entity files"
   git add -A && git commit -m "Phase 3: Move seeder files"
   # etc.
   ```

4. **If you need to abort mid-refactor**:
   ```bash
   git reset --hard HEAD  # Discard all uncommitted changes
   git checkout main       # Return to main branch
   ```

## Benefits After Refactoring

1. **Clear Separation of Concerns**:
   - Entities are data layer
   - Services are reusable logic
   - Features are business capabilities

2. **Better Dependency Flow**:
   - `Data` (entities) → `Services` → `Features`
   - No circular dependencies
   - Clear layering

3. **Improved Discoverability**:
   - Need an entity? Check `Data/Entities/`
   - Need auth logic? Check `Features/Auth/`
   - Need email sending? Check `Services/`

4. **Vertical Slice Integrity**:
   - Staff context clearly separated
   - Tenant context clearly separated
   - Auth is its own feature slice

5. **Easier Testing**:
   - Mock interfaces from `Services/`
   - Test features independently
   - Entities are POCOs (easy to instantiate)

6. **Scalability**:
   - Easy to add new contexts (e.g., `Features/Project/`)
   - Easy to add new shared services
   - Easy to extract microservices later

## Timeline Estimate

- **Phase 1-7** (Move files): 1.5 hours
- **Phase 8-9** (Update imports/DI): 30 minutes
- **Phase 10** (Build/Test): 15 minutes
- **Phase 11** (Documentation): 10 minutes

**Total: ~2.5 hours** (for careful, methodical execution)

## Post-Refactor File Count

**Deleted**:
- 8 folders (`Features/Common/*`)
- ~7 unused service files
- Total: ~15 deleted items

**Created**:
- 2 new folders (`Data/Entities/`, `Data/Seeders/`, `Services/`)
- 1 interface file (`IEmailService.cs`)
- Total: 3 new directories

**Moved**:
- ~10 entity files
- ~4 seeder files
- ~2 service files
- 1 feature directory (`Auth/`)
- Total: ~17 moved items

**Net Result**: Cleaner, more organized structure with better separation of concerns.

---

## Questions Before Starting?

1. **Are there any other services in `Common/` we missed?**
2. **Should we keep `Product.cs` in `Features/Tenant/Product/` or move to `Entities/`?**
   - If Product has business logic (like price calculations): Keep in `Features/`
   - If Product is just a data entity: Move to `Entities/`
3. **Do we need to update any CI/CD pipelines that reference file paths?**
4. **Should we create a migration for any database schema changes?** (Likely not needed - this is code organization only)

---

**Ready to execute?** Let me know and I'll help you implement this step-by-step!
