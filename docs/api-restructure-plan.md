# API Folder Structure Refactoring Plan

## Executive Summary

This document outlines the plan to reorganize `apps/api/Src/Features/` to align with **Vertical Slice Architecture** principles, organizing code by scope (Staff/Tenant/Shared) and domain modules.

## Current Problems

1. **Confusing "Features" naming**: Not clear that this is about modules/domains
2. **Ambiguous "Common"**: Unclear that it means "shared cross-scope modules"
3. **Otherwise the structure is correct**: We already follow vertical slice principles

## The Real Issue

The current structure is **already correct for vertical slices**. The only problem is **naming confusion**:
- "Features" sounds like user-facing capabilities, not domain modules
- "Common" doesn't clearly communicate "shared cross-scope functionality"

## Target Structure

```
apps/api/Src/
├── Modules/                             # ✨ RENAMED from "Features"
│   ├── Shared/                          # ✨ RENAMED from "Common"
│   │   ├── Users/                       # Vertical slice: User module
│   │   │   ├── User.cs                  # Entity
│   │   │   ├── UserAccount.cs           # Entity
│   │   │   ├── UserAccountProfile.cs    # Junction entity
│   │   │   ├── UserSeeder.cs            # Seeder
│   │   │   ├── UserAccountSeeder.cs     # Seeder
│   │   │   └── Handlers/                # User-related operations (if any)
│   │   │
│   │   ├── Profiles/                    # Vertical slice: Profile module
│   │   │   ├── Profile.cs               # Entity
│   │   │   ├── ProfilePermission.cs     # Junction entity
│   │   │   ├── ProfileSeeder.cs         # Seeder
│   │   │   ├── StaffProfileSeeder.cs    # Seeder
│   │   │   └── Handlers/                # Profile operations (if any)
│   │   │
│   │   ├── Auth/                        # Vertical slice: Auth module
│   │   │   ├── Session.cs               # Entity
│   │   │   ├── PasswordService.cs       # Auth business logic
│   │   │   ├── AuthService.cs           # Auth business logic
│   │   │   ├── AuthUtils.cs             # Auth utilities
│   │   │   ├── AuthEndpoint.cs          # Endpoints
│   │   │   └── Handlers/                # Auth handlers
│   │   │       ├── PasswordLogin.cs
│   │   │       ├── PasswordRegister.cs
│   │   │       ├── ResetPassword.cs
│   │   │       ├── VerifyEmailRequest.cs
│   │   │       ├── GetRedirectCode.cs
│   │   │       ├── GetUserAuthData.cs
│   │   │       ├── GetTenantAuthData.cs
│   │   │       ├── CheckEmailVerificationToken.cs
│   │   │       ├── CheckResetPasswordToken.cs
│   │   │       ├── CheckInvitationToken.cs
│   │   │       └── GetVerificationLink.cs
│   │   │
│   │   ├── Invitations/                 # Vertical slice: Invitation module
│   │   │   ├── Invitation.cs            # Entity
│   │   │   ├── InvitationProfile.cs     # Junction entity
│   │   │   ├── InvitationSeeder.cs      # Seeder (if exists)
│   │   │   ├── InvitationService.cs     # Service (if exists)
│   │   │   └── Handlers/                # Invitation operations
│   │   │
│   │   ├── Permissions/                 # Vertical slice: Permission module
│   │   │   ├── Permission.cs            # Entity
│   │   │   ├── PermissionSeeder.cs      # Seeder
│   │   │   └── Handlers/                # Permission operations (if any)
│   │   │
│   │   ├── Tenants/                     # Vertical slice: Tenant module
│   │   │   ├── Tenant.cs                # Entity
│   │   │   ├── TenantSeeder.cs          # Seeder
│   │   │   └── Handlers/                # Tenant operations (if any)
│   │   │
│   │   ├── Projects/                    # Vertical slice: Project module
│   │   │   ├── Project.cs               # Entity
│   │   │   └── Handlers/                # Project operations (if any)
│   │   │
│   │   └── Infrastructure/              # Architectural/infrastructure services
│   │       ├── Messaging/               # Communication services
│   │       │   ├── Email/
│   │       │   │   ├── IEmailService.cs
│   │       │   │   └── EmailService.cs
│   │       │   └── Sms/                 # (Future) SMS services
│   │       ├── Storage/                 # (Future) File storage services
│   │       ├── Caching/                 # (Future) Cache services
│   │       └── Audit/                   # (Future) Cross-scope audit if needed
│   │
│   ├── Staff/                           # Staff scope (unchanged)
│   │   ├── ProfileAsStaff/
│   │   ├── StaffMember/
│   │   ├── TenantAsStaff/
│   │   ├── PermissionAsStaff/
│   │   └── InvitationAsStaff/
│   │
│   └── Tenant/                          # Tenant scope (unchanged)
│       └── Products/
│           ├── Product.cs
│           └── Handlers/
│
└── Data/
    ├── DbContext/
    │   ├── MainApiDbContext.cs
    │   └── TenantExtension.cs
    ├── BaseAttributes.cs
    ├── IEntity.cs
    ├── IEntitySeeder.cs
    └── DbSetExtensions.cs
```

## Key Changes

### 1. Rename `Features/` → `Modules/`

**Rationale**: "Modules" better conveys domain-based organization

**Action**:
```bash
git mv apps/api/Src/Features apps/api/Src/Modules
```

**Namespace Change**:
```csharp
// OLD
namespace MainApi.Src.Features.Common.User;

// NEW
namespace MainApi.Src.Modules.Shared.Users;
```

### 2. Rename `Common/` → `Shared/`

**Rationale**: "Shared" clearly means "shared cross-scope functionality"

**Action**:
```bash
git mv apps/api/Src/Modules/Common apps/api/Src/Modules/Shared
```

### 3. Junction Entity Placement Rule

**IMPORTANT**: Junction entities (many-to-many relationship tables) should live with their **primary entity**.

**Junction Entities in This Project**:
- **`UserAccountProfile`** (joins UserAccount ↔ Profile)
  - Primary: `UserAccount`
  - **Location**: `Modules/Shared/Users/UserAccountProfile.cs`

- **`ProfilePermission`** (joins Profile ↔ Permission)
  - Primary: `Profile`
  - **Location**: `Modules/Shared/Profiles/ProfilePermission.cs`

- **`InvitationProfile`** (joins Invitation ↔ Profile)
  - Primary: `Invitation`
  - **Location**: `Modules/Shared/Invitations/InvitationProfile.cs`

**Why this matters**: When working on a module, you have ALL related entities (including junctions) in one place. For example, when working on the Users module, you see both `UserAccount` and `UserAccountProfile` together.

### 4. Infrastructure Services (No Entity) Placement Rules

**Problem**: Some services don't have entities (e.g., EmailService, SmsService, FileStorageService). Where should they live in a vertical slice architecture?

**Solution**: Create `Modules/Shared/Infrastructure/` immediately for all architectural/infrastructure concerns.

#### Infrastructure Module Structure

Create this structure from the start to maintain clear separation between domain modules and infrastructure services:

```
Modules/Shared/Infrastructure/
├── Messaging/
│   ├── Email/
│   │   ├── IEmailService.cs         # Interface
│   │   └── EmailService.cs          # Implementation (Resend adapter)
│   └── Sms/                          # (Future) SMS services
│       ├── ISmsService.cs
│       └── TwilioSmsService.cs
├── Storage/                          # (Future) File storage
│   ├── IFileStorageService.cs
│   └── S3FileStorageService.cs
├── Caching/                          # (Future) Cache services
│   ├── ICacheService.cs
│   └── RedisCacheService.cs
└── Audit/                            # (Future) If used cross-scope
    ├── IAuditLogService.cs
    └── AuditLogService.cs
```

#### Placement Rules

| Service Type | Location | Example |
|--------------|----------|---------|
| **Infrastructure/architectural concerns** | `Infrastructure/` | EmailService, SmsService, FileStorageService, CacheService |
| **Domain business logic** | Domain module folder | UserService, InvitationService, ProductService |
| **Pure utilities (stateless)** | `Lib/` | StringHelpers, DateTimeExtensions |

#### Why Infrastructure Folder from the Start?

1. **Clear separation of concerns**: Domain modules contain business logic, Infrastructure contains technical services
2. **Better discoverability**: All infrastructure services in one place
3. **Easier testing**: Mock all infrastructure at once
4. **Scalability**: Easy to add new infrastructure services without cluttering domain modules
5. **Architecture clarity**: Makes it obvious what's domain vs infrastructure

#### Current Services to Move

**✅ Move to Infrastructure**:
- **EmailService** → `Modules/Shared/Infrastructure/Messaging/Email/`
  - Sends transactional emails (welcome, verification, password reset, invitations)
  - Technical concern, not domain logic

**✅ Keep in Domain Modules** (business logic):
- **PasswordService** → `Modules/Shared/Auth/` (password hashing/validation logic)
- **AuthService** → `Modules/Shared/Auth/` (authentication business logic)
- **UserService** → `Modules/Shared/Users/` (user business logic)
- **InvitationService** → `Modules/Shared/Invitations/` (invitation business logic)

**✅ Keep in Scope Modules** (scope-specific logic):
- **ImpersonationService** → `Modules/Staff/Impersonation/` (staff-only feature)
- **AuditLogService** → `Modules/Staff/Audit/` (currently staff-only; move to Infrastructure if used by Tenant scope later)

#### Key Principle

**Infrastructure folder = Technical/architectural services that provide capabilities TO domain modules**

Examples:
- ✅ EmailService (sends emails FOR auth, invitations, etc.)
- ✅ SmsService (sends SMS FOR 2FA, notifications, etc.)
- ✅ FileStorageService (stores files FOR users, products, etc.)
- ✅ CacheService (caches data FOR any module)
- ❌ UserService (user business logic, not infrastructure)
- ❌ InvitationService (invitation business logic, not infrastructure)

### 5. Organize `Shared/` into Domain Modules

**Rationale**: Each domain module is a vertical slice containing everything related

**Reorganization**:

#### Create Modules/Shared/Users/
```bash
mkdir apps/api/Src/Modules/Shared/Users

# Core entities
git mv apps/api/Src/Modules/Shared/User/User.cs apps/api/Src/Modules/Shared/Users/
git mv apps/api/Src/Modules/Shared/Account/UserAccount.cs apps/api/Src/Modules/Shared/Users/

# Junction entity (UserAccount is primary)
git mv apps/api/Src/Modules/Shared/Account/UserAccountProfile.cs apps/api/Src/Modules/Shared/Users/

# Seeders
git mv apps/api/Src/Modules/Shared/User/UserSeeder.cs apps/api/Src/Modules/Shared/Users/
git mv apps/api/Src/Modules/Shared/Account/UserAccountSeeder.cs apps/api/Src/Modules/Shared/Users/
```

#### Create Modules/Shared/Profiles/
```bash
mkdir apps/api/Src/Modules/Shared/Profiles

# Core entity
git mv apps/api/Src/Modules/Shared/Profile/Profile.cs apps/api/Src/Modules/Shared/Profiles/

# Junction entity (Profile is primary)
git mv apps/api/Src/Modules/Shared/Profile/ProfilePermission.cs apps/api/Src/Modules/Shared/Profiles/

# Seeders
git mv apps/api/Src/Modules/Shared/Profile/ProfileSeeder.cs apps/api/Src/Modules/Shared/Profiles/
git mv apps/api/Src/Modules/Shared/Profile/StaffProfileSeeder.cs apps/api/Src/Modules/Shared/Profiles/
```

#### Create Modules/Shared/Permissions/
```bash
mkdir apps/api/Src/Modules/Shared/Permissions
git mv apps/api/Src/Modules/Shared/Permission/Permission.cs apps/api/Src/Modules/Shared/Permissions/
git mv apps/api/Src/Modules/Shared/Permission/PermissionSeeder.cs apps/api/Src/Modules/Shared/Permissions/
```

#### Create Modules/Shared/Tenants/
```bash
mkdir apps/api/Src/Modules/Shared/Tenants
git mv apps/api/Src/Modules/Shared/Tenant/Tenant.cs apps/api/Src/Modules/Shared/Tenants/
git mv apps/api/Src/Modules/Shared/Tenant/TenantSeeder.cs apps/api/Src/Modules/Shared/Tenants/
```

#### Create Modules/Shared/Projects/
```bash
mkdir apps/api/Src/Modules/Shared/Projects
git mv apps/api/Src/Modules/Shared/Project/Project.cs apps/api/Src/Modules/Shared/Projects/
```

#### Organize Modules/Shared/Auth/
```bash
# Auth already exists, just move services into it
git mv apps/api/Src/Modules/Shared/Email/EmailService.cs apps/api/Src/Modules/Shared/Auth/
git mv apps/api/Src/Modules/Shared/Session/Session.cs apps/api/Src/Modules/Shared/Auth/
# PasswordService should already be in Auth
```

#### Organize Modules/Shared/Invitations/
```bash
mkdir apps/api/Src/Modules/Shared/Invitations

# Move all invitation-related files (includes Invitation entity and InvitationProfile junction)
git mv apps/api/Src/Modules/Shared/Invitation/* apps/api/Src/Modules/Shared/Invitations/

# Note: InvitationProfile (junction entity) lives here because Invitation is the primary entity
```

### 6. Update AGENTS.md to Enforce New Structure

**Rationale**: AGENTS.md guides AI assistants through the codebase. Updating it enforces the new structure and ensures consistency.

**Critical Updates Required**:

1. **Update Folder Structure Documentation**:
   - Change all references from `Features/` to `Modules/`
   - Change all references from `Common/` to `Shared/`
   - Document the new module organization (Users, Profiles, Auth, etc.)

2. **Update Entity Location Guidelines**:
   - Specify that entities live in their module folders
   - Document junction entity placement rules
   - Update example paths (e.g., `Modules/Shared/Users/User.cs`)

3. **Add Vertical Slice Enforcement Rules**:
   ```markdown
   ## API Module Structure Rules

   - Each module in `Modules/Shared/` is a vertical slice containing:
     - Entities (*.cs files defining database models)
     - Junction entities (many-to-many relationships live with primary entity)
     - Seeders (*Seeder.cs files)
     - Services (business logic)
     - Handlers (request/response handlers)

   - Scopes:
     - `Modules/Shared/` - Cross-scope modules (Users, Auth, Profiles, etc.)
     - `Modules/Staff/` - Staff-scoped operations
     - `Modules/Tenant/` - Tenant-scoped operations
   ```

4. **Update Architecture Diagrams** (if any exist in AGENTS.md)

**This ensures**:
- Future AI assistance follows the new structure
- New developers understand the organization
- The structure is self-documenting

### 7. Delete Empty Old Folders

```bash
# Remove old singular-named folders
rm -rf apps/api/Src/Modules/Shared/User
rm -rf apps/api/Src/Modules/Shared/Account
rm -rf apps/api/Src/Modules/Shared/Profile
rm -rf apps/api/Src/Modules/Shared/Permission
rm -rf apps/api/Src/Modules/Shared/Tenant
rm -rf apps/api/Src/Modules/Shared/Project
rm -rf apps/api/Src/Modules/Shared/Session
rm -rf apps/api/Src/Modules/Shared/Email
rm -rf apps/api/Src/Modules/Shared/Invitation
```

### 8. Delete Unused Service Files

**Check and delete if unused**:
```bash
# These are likely empty or minimal
rm apps/api/Src/Modules/Shared/Users/UserService.cs        # If exists
rm apps/api/Src/Modules/Shared/Users/AccountService.cs     # If exists
rm apps/api/Src/Modules/Shared/Profiles/ProfileService.cs  # If exists
rm apps/api/Src/Modules/Shared/Tenants/TenantService.cs    # If exists
rm apps/api/Src/Modules/Shared/Projects/ProjectService.cs  # If exists
rm apps/api/Src/Modules/Shared/Permissions/PermissionService.cs  # If exists
```

## Implementation Steps

### Phase 1: Rename Top-Level Folders (2 minutes)

```bash
# Rename Features → Modules
git mv apps/api/Src/Features apps/api/Src/Modules

# Rename Common → Shared
git mv apps/api/Src/Modules/Common apps/api/Src/Modules/Shared
```

### Phase 2: Create New Module Folders (2 minutes)

```bash
# Domain modules
mkdir apps/api/Src/Modules/Shared/Users
mkdir apps/api/Src/Modules/Shared/Profiles
mkdir apps/api/Src/Modules/Shared/Permissions
mkdir apps/api/Src/Modules/Shared/Tenants
mkdir apps/api/Src/Modules/Shared/Projects
mkdir apps/api/Src/Modules/Shared/Invitations

# Infrastructure folders
mkdir -p apps/api/Src/Modules/Shared/Infrastructure/Messaging/Email
mkdir -p apps/api/Src/Modules/Shared/Infrastructure/Messaging/Sms
mkdir -p apps/api/Src/Modules/Shared/Infrastructure/Storage
mkdir -p apps/api/Src/Modules/Shared/Infrastructure/Caching
```

### Phase 3: Move Files into Modules (20 minutes)

**Move in dependency order** (least dependencies first):

#### Users Module
```bash
# Core entities
git mv apps/api/Src/Modules/Shared/User/User.cs apps/api/Src/Modules/Shared/Users/
git mv apps/api/Src/Modules/Shared/Account/UserAccount.cs apps/api/Src/Modules/Shared/Users/

# Junction entity (UserAccount is primary) ⚠️
git mv apps/api/Src/Modules/Shared/Account/UserAccountProfile.cs apps/api/Src/Modules/Shared/Users/

# Seeders
git mv apps/api/Src/Modules/Shared/User/UserSeeder.cs apps/api/Src/Modules/Shared/Users/
git mv apps/api/Src/Modules/Shared/Account/UserAccountSeeder.cs apps/api/Src/Modules/Shared/Users/

# Update namespace in all moved files to: MainApi.Src.Modules.Shared.Users;
```

#### Tenants Module
```bash
git mv apps/api/Src/Modules/Shared/Tenant/Tenant.cs apps/api/Src/Modules/Shared/Tenants/
git mv apps/api/Src/Modules/Shared/Tenant/TenantSeeder.cs apps/api/Src/Modules/Shared/Tenants/

# Update namespace: MainApi.Src.Modules.Shared.Tenants;
```

#### Projects Module
```bash
git mv apps/api/Src/Modules/Shared/Project/Project.cs apps/api/Src/Modules/Shared/Projects/

# Update namespace: MainApi.Src.Modules.Shared.Projects;
```

#### Permissions Module
```bash
git mv apps/api/Src/Modules/Shared/Permission/Permission.cs apps/api/Src/Modules/Shared/Permissions/
git mv apps/api/Src/Modules/Shared/Permission/PermissionSeeder.cs apps/api/Src/Modules/Shared/Permissions/

# Update namespace: MainApi.Src.Modules.Shared.Permissions;
```

#### Profiles Module
```bash
# Core entity
git mv apps/api/Src/Modules/Shared/Profile/Profile.cs apps/api/Src/Modules/Shared/Profiles/

# Junction entity (Profile is primary) ⚠️
git mv apps/api/Src/Modules/Shared/Profile/ProfilePermission.cs apps/api/Src/Modules/Shared/Profiles/

# Seeders
git mv apps/api/Src/Modules/Shared/Profile/ProfileSeeder.cs apps/api/Src/Modules/Shared/Profiles/
git mv apps/api/Src/Modules/Shared/Profile/StaffProfileSeeder.cs apps/api/Src/Modules/Shared/Profiles/

# Update namespace: MainApi.Src.Modules.Shared.Profiles;
```

#### Invitations Module
```bash
# Move all invitation files (includes Invitation entity and InvitationProfile junction) ⚠️
git mv apps/api/Src/Modules/Shared/Invitation/* apps/api/Src/Modules/Shared/Invitations/ 2>/dev/null || true

# Update namespace: MainApi.Src.Modules.Shared.Invitations;
```

#### Auth Module (reorganize)
```bash
# Move Session into Auth
git mv apps/api/Src/Modules/Shared/Session/Session.cs apps/api/Src/Modules/Shared/Auth/ 2>/dev/null || true

# Auth namespace stays: MainApi.Src.Modules.Shared.Auth;
```

#### Infrastructure Module (create and populate)
```bash
# Move EmailService to Infrastructure
git mv apps/api/Src/Modules/Shared/Email/IEmailService.cs apps/api/Src/Modules/Shared/Infrastructure/Messaging/Email/ 2>/dev/null || true
git mv apps/api/Src/Modules/Shared/Email/EmailService.cs apps/api/Src/Modules/Shared/Infrastructure/Messaging/Email/ 2>/dev/null || true

# Update namespace: MainApi.Src.Modules.Shared.Infrastructure.Messaging.Email;
```

### Phase 4: Update Namespaces in Moved Files (15 minutes)

For each moved file, update:
1. The namespace declaration
2. Any using statements that reference old locations

**Example**:
```csharp
// In Users/User.cs
// OLD
namespace MainApi.Src.Features.Common.User;

// NEW
namespace MainApi.Src.Modules.Shared.Users;
```

```csharp
// In any file that uses User
// OLD
using MainApi.Src.Features.Common.User;
using MainApi.Src.Features.Common.Account;

// NEW
using MainApi.Src.Modules.Shared.Users;
```

### Phase 5: Delete Empty Old Folders (2 minutes)

```bash
rm -rf apps/api/Src/Modules/Shared/User
rm -rf apps/api/Src/Modules/Shared/Account
rm -rf apps/api/Src/Modules/Shared/Profile
rm -rf apps/api/Src/Modules/Shared/Permission
rm -rf apps/api/Src/Modules/Shared/Tenant
rm -rf apps/api/Src/Modules/Shared/Project
rm -rf apps/api/Src/Modules/Shared/Session
rm -rf apps/api/Src/Modules/Shared/Email  # Moved to Infrastructure/Messaging/Email/
rm -rf apps/api/Src/Modules/Shared/Invitation
```

### Phase 6: Update All Imports Across Codebase (20 minutes)

Update all files that import from the old locations:

**In PowerShell (Windows)**:
```powershell
# Update Features → Modules
Get-ChildItem -Path "apps/api/Src" -Filter "*.cs" -Recurse | ForEach-Object {
    (Get-Content $_.FullName) -replace 'MainApi\.Src\.Features\.', 'MainApi.Src.Modules.' | Set-Content $_.FullName
}

# Update specific module imports
Get-ChildItem -Path "apps/api/Src" -Filter "*.cs" -Recurse | ForEach-Object {
    $content = Get-Content $_.FullName
    $content = $content -replace 'using MainApi\.Src\.Modules\.Shared\.User;', 'using MainApi.Src.Modules.Shared.Users;'
    $content = $content -replace 'using MainApi\.Src\.Modules\.Shared\.Account;', 'using MainApi.Src.Modules.Shared.Users;'
    $content = $content -replace 'using MainApi\.Src\.Modules\.Shared\.Profile;', 'using MainApi.Src.Modules.Shared.Profiles;'
    $content = $content -replace 'using MainApi\.Src\.Modules\.Shared\.Permission;', 'using MainApi.Src.Modules.Shared.Permissions;'
    $content = $content -replace 'using MainApi\.Src\.Modules\.Shared\.Tenant;', 'using MainApi.Src.Modules.Shared.Tenants;'
    $content = $content -replace 'using MainApi\.Src\.Modules\.Shared\.Project;', 'using MainApi.Src.Modules.Shared.Projects;'
    $content = $content -replace 'using MainApi\.Src\.Modules\.Shared\.Invitation;', 'using MainApi.Src.Modules.Shared.Invitations;'
    $content = $content -replace 'using MainApi\.Src\.Modules\.Shared\.Email;', 'using MainApi.Src.Modules.Shared.Infrastructure.Messaging.Email;'
    $content = $content -replace 'using MainApi\.Src\.Modules\.Shared\.Session;', 'using MainApi.Src.Modules.Shared.Auth;'
    $content | Set-Content $_.FullName
}
```

**Manual verification required for**:
- [MainApiDbContext.cs](apps/api/Src/Data/DbContext/MainApiDbContext.cs) - verify entity imports
- Staff scope services - verify imports
- Tenant scope services - verify imports
- [Program.cs](apps/api/Src/Program.cs) - verify DI registrations

### Phase 7: Build and Test (15 minutes)

```bash
# Clean build
make clean-api

# Rebuild API
make build-api

# Run migrations
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
- ✅ Staff scope works
- ✅ Tenant scope works

### Phase 8: Update AGENTS.md to Enforce Structure (20 minutes)

**CRITICAL**: This phase enforces the new structure for all future development.

**Update [AGENTS.md](AGENTS.md)**:

1. **Update Folder Structure References**:
   - Change all `Features/` → `Modules/`
   - Change all `Features/Common/` → `Modules/Shared/`
   - Update entity location examples (e.g., `Common/User/User.cs` → `Shared/Users/User.cs`)

2. **Add Module Structure Rules Section**:
   ```markdown
   ## API Module Structure

   ### Vertical Slice Organization
   - Each module in `Modules/Shared/` is a complete vertical slice
   - All related code lives together: entities, seeders, services, handlers

   ### Module Examples
   - `Modules/Shared/Users/` - User and UserAccount entities, seeders, handlers
   - `Modules/Shared/Profiles/` - Profile entity, ProfilePermission junction, seeders
   - `Modules/Shared/Auth/` - Authentication entities, services (PasswordService, AuthService), handlers
   - `Modules/Shared/Invitations/` - Invitation entity, InvitationProfile junction
   - `Modules/Shared/Infrastructure/` - Architectural services (EmailService, future: SmsService, FileStorageService)

   ### Junction Entity Rule
   - Junction entities live with their PRIMARY entity
   - Example: `UserAccountProfile` → lives in `Users/` (primary: UserAccount)

   ### Infrastructure Services Placement Rules
   - **Infrastructure folder**: Technical/architectural services that provide capabilities to domain modules
     - Example: `EmailService` → `Infrastructure/Messaging/Email/` (sends emails FOR auth, invitations, etc.)
     - Example: `SmsService` → `Infrastructure/Messaging/Sms/` (sends SMS FOR 2FA, notifications, etc.)
     - Example: `FileStorageService` → `Infrastructure/Storage/` (stores files FOR users, products, etc.)
   - **Domain modules**: Business logic services specific to that domain
     - Example: `PasswordService` → `Auth/` (password hashing/validation)
     - Example: `UserService` → `Users/` (user business logic)
   - **Pure utilities**: Stateless helpers without dependencies → `Lib/`

   ### Scopes
   - `Modules/Shared/` - Cross-scope functionality (used by both Staff and Tenant)
   - `Modules/Staff/` - Staff-only operations
   - `Modules/Tenant/` - Tenant-only operations
   ```

3. **Update Architecture Diagrams** (if present)

4. **Add "Where to Put New Code" Guidelines**:
   - New shared entity? → Create module in `Modules/Shared/`
   - Staff operation? → Add to `Modules/Staff/`
   - Tenant operation? → Add to `Modules/Tenant/`
   - New infrastructure service? → Add to `Modules/Shared/Infrastructure/`
     - Email/SMS → `Infrastructure/Messaging/`
     - File storage → `Infrastructure/Storage/`
     - Caching → `Infrastructure/Caching/`
   - New domain business logic? → Add to appropriate domain module

**This ensures all future AI assistance and development follows the structure.**

### Phase 9: Update Other Documentation (10 minutes)

Update references in:
- **[CLAUDE.md](CLAUDE.md)** - Update module location references
- **[docs/vertical-slice-design-principles.md](docs/vertical-slice-design-principles.md)** - Update example paths
- Any other API documentation - Update architecture diagrams

## Testing Checklist

### After Phase 3 (File Moves)
- [ ] All files moved successfully
- [ ] No files left in old singular folders
- [ ] Git history preserved (using `git mv`)

### After Phase 4 (Namespace Updates)
- [ ] All namespaces updated in moved files
- [ ] No compilation errors in moved files
- [ ] Using statements updated

### After Phase 6 (Import Updates)
- [ ] All imports updated across codebase
- [ ] No compilation errors
- [ ] MainApiDbContext compiles
- [ ] All services compile

### After Phase 7 (Final Build)
- [ ] Full API builds without warnings
- [ ] All endpoints accessible via `/scalar/v1`
- [ ] OpenAPI spec generates correctly
- [ ] Frontend TypeScript client generation works (`make generate-client`)
- [ ] Database seeds successfully
- [ ] Login/Register works
- [ ] Staff operations work
- [ ] Tenant operations work

### After Phase 8 (AGENTS.md Update) - CRITICAL
- [ ] All `Features/` references changed to `Modules/`
- [ ] All `Common/` references changed to `Shared/`
- [ ] Module structure rules section added
- [ ] Junction entity placement rule documented
- [ ] Infrastructure services placement rules documented
- [ ] "Where to Put New Code" guidelines added
- [ ] Architecture diagrams updated (if present)
- [ ] Vertical slice principles clearly explained

## Rollback Plan

If issues occur during refactoring:

1. **Git is your friend**: Use `git checkout` to revert specific files
2. **Commit after each phase**: Makes rollback easier
3. **Branch strategy**:
   ```bash
   # Create refactoring branch
   git checkout -b refactor/modules-restructure

   # Commit after each phase
   git add -A && git commit -m "Phase 1: Rename Features to Modules"
   git add -A && git commit -m "Phase 2: Create new module folders"
   git add -A && git commit -m "Phase 3: Move files into modules"
   git add -A && git commit -m "Phase 4: Update namespaces"
   git add -A && git commit -m "Phase 5: Delete empty folders"
   git add -A && git commit -m "Phase 6: Update imports"
   git add -A && git commit -m "Phase 7: Build and test successful"
   git add -A && git commit -m "Phase 8: Update AGENTS.md structure enforcement"
   git add -A && git commit -m "Phase 9: Update other documentation"
   ```

4. **If you need to abort mid-refactor**:
   ```bash
   git reset --hard HEAD  # Discard all uncommitted changes
   git checkout main      # Return to main branch
   ```

## Benefits After Refactoring

1. **Clearer Naming**:
   - "Modules" better conveys domain-based organization
   - "Shared" clearly means cross-scope functionality

2. **True Vertical Slices**:
   - Each module contains everything: entities, junction entities, seeders, services, handlers
   - Want to work on Users? Everything is in `Modules/Shared/Users/`
   - Want to work on Auth? Everything is in `Modules/Shared/Auth/`

3. **Scope Clarity**:
   - `Modules/Staff/` - Staff scope operations
   - `Modules/Tenant/` - Tenant scope operations
   - `Modules/Shared/` - Cross-scope functionality

4. **Maintained Principles**:
   - No horizontal layering (Data/Entities/, Services/)
   - Everything related lives together
   - Easy to understand and navigate

5. **Easier Testing**:
   - Each module is independently testable
   - Clear boundaries between modules
   - Mock dependencies at module boundaries

6. **Scalability**:
   - Easy to add new shared modules
   - Easy to add new scope-specific operations
   - Clear where new code should go

## Timeline Estimate

- **Phase 1** (Rename top folders): 2 minutes
- **Phase 2** (Create new folders): 2 minutes
- **Phase 3** (Move files): 20 minutes
- **Phase 4** (Update namespaces): 15 minutes
- **Phase 5** (Delete empty folders): 2 minutes
- **Phase 6** (Update imports): 20 minutes
- **Phase 7** (Build/Test): 15 minutes
- **Phase 8** (Update AGENTS.md - CRITICAL): 20 minutes
- **Phase 9** (Update other documentation): 10 minutes

**Total: ~2 hours** (for careful, methodical execution)

## Summary of Changes

**What's changing**:
- ❌ `Features/` → ✅ `Modules/`
- ❌ `Common/` → ✅ `Shared/`
- ❌ Singular folder names (`User/`, `Profile/`) → ✅ Plural (`Users/`, `Profiles/`)
- ❌ Files scattered across entity folders → ✅ Everything grouped by domain module
- ✅ **NEW**: Clear rules for services without entities (EmailService → Auth/)

**What's NOT changing**:
- ✅ Vertical slice principles (maintained and improved)
- ✅ Staff and Tenant scope separation
- ✅ File contents (only namespaces change)
- ✅ Database schema (no migrations needed)

---

**Ready to execute?** This is now a simple refactoring focused on better naming and organization while maintaining the vertical slice architecture you already have!
