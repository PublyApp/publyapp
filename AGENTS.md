# AGENTS.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Project Overview

PublyApp is a modern full-stack multi-tenant SaaS application built with .NET 9.0 and React 19. The monorepo architecture uses Turborepo and pnpm workspaces with three user scopes: Staff (platform administrators), Tenant (organization-level users), and Project (project-level users).

## Development Commands

### Starting Development Servers

```bash
# Terminal 1 - Start API with hot reload
make dev-api

# Terminal 2 - Start React frontend with Vite
make dev-front

# Start PostgreSQL in Docker
make dev-db
```

### Configuration (AppEnvironment)

The API reads configuration exclusively from environment variables via `AppEnvironment` (`apps/api/Src/Lib/AppEnvironment.cs`).

- Development defaults live in repo-root `.env.development` and are loaded when the host environment is `Development`.
- `dotnet build` also runs the app during OpenAPI document generation; if `ASPNETCORE_ENVIRONMENT`/`DOTNET_ENVIRONMENT` are unset, `.env.development` is loaded to prevent build failures.
- Prefer keeping secrets out of the repo: use an example file (e.g. `.env.development.example`) + local overrides / CI secrets.

### Building

```bash
make build-api          # Build .NET API
make build-front        # Build React frontend for production
make build-deploy       # Build everything for deployment
```

### Code Quality

```bash
make check-write        # Run Biome linting + formatting (auto-fix)
make tsc-front          # TypeScript type checking
make knip               # Check for unused dependencies
```

### Database Operations

```bash
make db-migrate                # Run EF Core migrations
make db-add NAME=MigrationName # Add new migration
make db-reset                  # Drop and recreate database
make db-remove                 # Remove last migration
```

### API Client Generation

After backend changes that modify the API contract:

```bash
make generate-client    # Generate TypeScript client from OpenAPI
```

This is critical - the frontend TypeScript client is auto-generated from the backend OpenAPI spec.

### Running Tests

```bash
make test-api          # Run API integration tests (requires Docker)
```

**Prerequisites:** Docker must be running (Testcontainers spins up Postgres automatically).

```bash
# Run a specific test class
cd apps/api && dotnet test Tests/MainApi.IntegrationTests.csproj -c Test --filter "FullyQualifiedName~PasswordLoginSpec"

# Run a specific test method
cd apps/api && dotnet test Tests/MainApi.IntegrationTests.csproj -c Test --filter "ItShouldReturnSessionTokenWithValidCredentials"

# Frontend tests (when implemented)
cd apps/front && pnpm test
```

For the full guide on writing and debugging integration tests, see [`docs/guides/api-integration-tests.md`](docs/guides/api-integration-tests.md).

## Architecture

### Monorepo Structure

```
apps/
├── api/              # .NET 9.0 Web API backend
├── front/            # React Router v7 frontend (SSR-enabled)
└── jobs/             # Background jobs (future)

packages/
├── shared/           # Shared utilities, validations, i18n
├── js-client/        # Auto-generated TypeScript API client
├── _tsconfig/        # Shared TypeScript configurations
└── _tx-key-gen/      # Translation key generator (.NET tool)
```

### Backend Architecture (Vertical Slice, Domain-First)

The backend follows **Vertical Slice Architecture** using a **domain-first** module layout:

```
apps/api/Src/Modules/<Domain>/
├── Entities/                     # EF Core entities for the domain
├── Services/                     # Domain services (business logic)
├── Seeders/                      # Seeders for the domain
├── Permissions/                  # Permission definitions (used by seeder)
├── Endpoints/                    # Minimal API mappings (by route scope)
└── Handlers/                     # Request handlers (CQRS-lite)
    ├── Anonymous/                # Public/auth-free handlers
    ├── Staff/                    # Staff-only handlers
    └── Tenant/                   # Tenant-scoped handlers
```

**Key Patterns:**
- **CQRS-lite**: handlers per operation (create/find/get/update/delete)
- **Minimal APIs**: endpoints map routes and attach filters/permissions
- **FluentValidation**: automatic body/query validation via endpoint extensions
- **Response Format**: success returns `Ok<T>` / `Ok<ApiResponse>`; errors return RFC 7807 `application/problem+json` via `TypedProblems.*` with `translationKey`
- **Namespace discipline**: `IDE0130` is treated as error — file namespace must match its folder path

**Finding Backend Code:**
- Domain modules (preferred): `apps/api/Src/Modules/<Domain>/` (e.g. `Auth`, `Users`, `Invitations`)
- Legacy (migration in progress): `apps/api/Src/Modules/{Shared,Staff,Tenant}/` (do not add new code here unless you’re migrating existing slices)
- Cross-cutting utilities/middleware: `apps/api/Src/Lib/`
- Infrastructure services (email, storage, etc.): `apps/api/Src/Infrastructure/`

### API Module Structure Rules (Repo-Wide Consensus)

**CRITICAL:** The API is domain-first. Route scope is expressed via endpoint groups and handler folders — not via alternate module naming schemes like `UsersAsStaff`.

#### Module Organization

Each `apps/api/Src/Modules/<Domain>/` module is a complete vertical slice containing:
- **Entities** (`Entities/*.cs`) — database models for the domain
- **Junction entities** — live with their primary entity’s domain
- **Services** (`Services/*.cs`) — domain business logic and orchestration
- **Handlers** (`Handlers/<Scope>/*.cs`) — HTTP request handlers
- **Endpoints** (`Endpoints/*.cs`) — route mappings per scope (anonymous/staff/tenant)
- **Permissions** (`Permissions/*.cs`) — permission constants/objects for seeding + route enforcement

#### Module Examples

- `Modules/Auth/` — session + auth flows
- `Modules/Users/` — users + accounts (including staff-user management)
- `Modules/Invitations/` — invitations and their profiles
- `Infrastructure/Messaging/Email/` — technical capability used by multiple domains

#### Junction Entity Placement Rule

**IMPORTANT:** Junction entities (many-to-many relationship tables) should live with their **primary entity**.

Examples:
- `UserAccountProfile` → lives in `Users/` (primary: UserAccount)
- `ProfilePermission` → lives in `Profiles/` (primary: Profile)
- `InvitationProfile` → lives in `Invitations/` (primary: Invitation)

#### Infrastructure Services Placement Rules

**Infrastructure folder** (`Infrastructure/`): Technical/architectural services that provide capabilities TO domain modules
- Example: `EmailService` → `Infrastructure/Messaging/Email/` (sends emails FOR auth, invitations, etc.)
- Example: `SmsService` → `Infrastructure/Messaging/Sms/` (sends SMS FOR 2FA, notifications, etc.)
- Example: `FileStorageService` → `Infrastructure/Storage/` (stores files FOR users, products, etc.)

**Domain modules**: Business logic services specific to that domain
- Example: `PasswordService` → `Auth/` (password hashing/validation)
- Example: `UserService` → `Users/` (user business logic)
- Example: `InvitationService` → `Invitations/` (invitation business logic)

**Pure utilities**: Stateless helpers without dependencies → `Lib/`

#### Route Scopes (Staff/Tenant/Anonymous)

- Scope is determined by the route group in `apps/api/Program.cs` (e.g. `/staff/*`, `/tenant/*`, `/auth/*`).
- Keep scope-specific code in `Handlers/<Scope>/` and `Endpoints/*For<Scope>.cs`.
- Prefer scope-specific handler names when it prevents confusion (e.g. `FindStaffProfiles` vs `FindTenantProfiles`). If a handler is truly shared across scopes, put it in a neutral location and keep the name generic.

#### Where to Put New Code

- **Any new domain work** → `apps/api/Src/Modules/<Domain>/...` (domain-first)
- **Scope-specific endpoints/handlers** → `Endpoints/*ForStaff.cs` / `Handlers/Staff/*` (same domain)
- **New infrastructure service?** → Add to `Infrastructure/`
  - Email/SMS → `Infrastructure/Messaging/`
  - File storage → `Infrastructure/Storage/`
  - Caching → `Infrastructure/Caching/`
- **Pure stateless helper** → `apps/api/Src/Lib/`

#### Architecture Docs Policy (Single Source of Truth)

**CRITICAL:** `AGENTS.md` is the single source of truth for **Vertical Slice Architecture** and **API folder/module structure** rules.

- Other docs may describe feature-specific plans, but must not introduce competing folder structure rules.
- If another doc needs to mention architecture, it should link to the relevant `AGENTS.md` section instead of redefining conventions.

#### Module Naming (Repo-Wide)

**Goal:** A single, obvious location for a domain, without suffixes.

- **Domain module:** `apps/api/Src/Modules/<Domain>/` (preferred)
  - Example: `Modules/Users/`, `Modules/Invitations/`, `Modules/Auth/`
- **Inside the domain**, scope/actor is expressed by folder + endpoint group:
  - `Handlers/Anonymous|Staff|Tenant/`
  - `...EndpointsAnonymous` / `...EndpointsForStaff` / `...EndpointsForTenant`

**Naming rules:**
- Prefer **plural** domain folder names (`Users`, `Invitations`, `Permissions`, `Tenants`).
- File namespaces must match folders (analyzers enforce `IDE0130`).
- Remove unused `using`s (`IDE0005` is treated as error).
- Avoid `*AsStaff/*AsTenant` naming in new code. Those legacy modules exist only during migration and should shrink over time.

#### Slice Boundaries (When to Split vs Share)

Split by **domain** first, then by **route scope** inside the domain (staff/tenant/anonymous).

Create **separate scope handlers/endpoints** when any of these change:
- Route scope / actor (Staff vs Tenant vs Project user)
- Authorization middleware / security boundary
- Route prefix (`/staff/*` vs `/tenant/*`)
- Business rules/workflows diverge meaningfully

Keep one implementation (and parameterize) when differences are only:
- Data attributes or filter parameters (e.g., `ProfileScope`, status/type/category enums)
- Same auth middleware, same route group, same business context

#### Permission Enforcement Patterns

Prefer enforcing permissions at the **route level** (before database access).

- **Pattern 1 (Recommended): Scope in route + `.WithPermission()`**
  - Use when the scope can be derived from the route (e.g., `/staff/profiles/staff/{id}` vs `/staff/profiles/tenants/{tenantId}`).
  - Benefits: permission checked before DB query, clearer API design, avoids wasted queries.
- **Pattern 2 (Fallback): Dynamic permission check after loading entity**
  - Avoid if possible. Use only when scope cannot be determined from the route and you cannot change the route shape.
  - Cost: requires loading the entity first; wastes a DB query if unauthorized; permission is no longer encoded by the route.

#### Vertical Slice Design Principles (Detailed)

This section replaces the old `docs/vertical-slice-design-principles.md` and is the canonical reference.

##### Separate actors, same domain (default)

When Staff and Tenant both touch the same domain, keep **one domain module** and split by actor inside it:

```
apps/api/Src/Modules/Profiles/
├── Entities/
├── Services/
├── Endpoints/
│   ├── ProfileEndpointsForStaff.cs
│   └── ProfileEndpointsForTenant.cs
└── Handlers/
    ├── Staff/
    └── Tenant/
```

Split by actor when:
- Different auth middleware / pipeline (staff vs tenant)
- Different security boundary (cross-tenant admin vs single-tenant access)
- Different permission namespaces (e.g., `staff.profile.*` vs `tenant.profile.*`)

##### Share handlers when business rules match

Prefer a **single handler** when the operation is the same and only the permission differs.

Example: one handler, mapped twice:

```
apps/api/Src/Modules/Profiles/
├── Handlers/
│   └── Common/
│       └── UpdateProfile.cs
└── Endpoints/
    ├── ProfileEndpointsForStaff.cs   # PUT /staff/profiles/{id} + WithPermission(A)
    └── ProfileEndpointsForTenant.cs  # PUT /tenant/profiles/{id} + WithPermission(B)
```

If *scope/target* differs (staff profile vs tenant profile vs project profile), prefer explicit handler names (e.g., `UpdateTenantProfile`) to avoid hidden branching and to make intent obvious in search results.

Indicators you should keep one handler:
- Same actor (all operations performed by Staff, or all by Tenant)
- Same middleware + same route group
- Operations are identical except for filtering (e.g., `ProfileScope`, `Status`)
- Service logic can be parameterized by an enum/discriminator

##### Permission Enforcement (More Detail)

**Default rule:** enforce permissions **before** doing database work.

**Pattern 1 (Preferred): scope in route + `.WithPermission()`**
- Use when scope can be derived from the route shape.
- Benefits: permission checked before DB query; API intent is explicit; avoids wasted queries.

Example route shapes (entity-centric, symmetric):

```
GET    /staff/profiles/staff                     # list staff profiles
GET    /staff/profiles/staff/{profileId}         # get staff profile
POST   /staff/profiles/staff                     # create staff profile
PUT    /staff/profiles/staff/{profileId}         # update staff profile
DELETE /staff/profiles/staff/{profileId}         # delete staff profile

GET    /staff/profiles/tenants                   # list tenant profiles
GET    /staff/profiles/tenants/{tenantId}        # get tenant profiles for tenant
POST   /staff/profiles/tenants/{tenantId}        # create tenant profile for tenant
PUT    /staff/profiles/tenants/{tenantId}        # update tenant profile for tenant
DELETE /staff/profiles/tenants/{tenantId}        # delete tenant profile for tenant
```

Permission naming guidance (stable + predictable):

```
staff.profile.list_for_staff
staff.profile.get_for_tenant
staff.profile.update_for_project
```

**Pattern 2 (Fallback): dynamic permission check after loading entity**
- Avoid if possible. Use only when scope cannot be determined from the route and you cannot change the route shape.
- Cost: requires loading the entity first; wastes a DB query if unauthorized; permission is no longer encoded by the route.

##### Decision Tree (Quick)

```
Is the operation performed by different actors (Staff vs Tenant)?
|
|-- YES -> Keep same domain module, split by actor folders + endpoints
|
`-- NO  -> Is the difference just a data attribute/scope filter?
          |
          |-- YES -> Keep one handler/service; parameterize by enum/discriminator
          |         |
          |         `-- Prefer Pattern 1: scope in route + .WithPermission()
          |             (Only use Pattern 2 if scope cannot be in the route)
          |
          `-- NO  -> If business rules diverge, split handlers/services inside the domain
```

### Multi-Tenant Architecture

**Three tenant scopes:**
- `ITenantEntity`: Tenant-scoped entities (filtered by TenantId)
- `IOptionalTenantEntity`: Entities that may or may not belong to a tenant
- `INoTenantEntity`: Global entities (Staff, permissions)

**Automatic tenant isolation:**
- EF Core global query filters applied in DbContext
- `TenantContext` provides current tenant info (scoped service)
- Tenant ID from `X-Tenant-Id` header (injected via middleware)

### Staff/Tenant Account Mutual Exclusivity

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

### Database Layer (EF Core)

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

### Frontend Architecture (React Router v7)

**File-based routing:**
- Routes defined in `app/routes.ts`
- Route components in `app/routes/[section]/[page]/`
- Three main layouts: Marketing, Auth, Authenticated

**State Management Strategy:**
```
Server State     → TanStack Query (API data, caching, mutations)
Global State     → Zustand (user preferences, UI state)
URL State        → nuqs (filters, pagination, search)
Form State       → React Hook Form (local form state)
```

**API Client Integration:**
- Microsoft Kiota auto-generated client from OpenAPI
- Singleton `ClientManager` in `app/lib/js-client/`
- Session token from `X-Session-Token` header (read fresh from cookies on every request)
- Tenant ID from `X-PublyApp-TenantId` header (for multi-tenant data isolation)

**Getting API Clients:**

1. **In React hooks** - Use hook factories from `app/lib/react-query/create-hooks.ts`:
   - `createTenantQuery/Mutation` - Tenant-scoped (tenantId required in variables)
   - `createStaffQuery/Mutation` - Staff-only endpoints (no tenantId)
   - `createAuthQuery/Mutation` - Auth endpoints (session token, no tenantId)
   - `createPublicQuery/Mutation` - Anonymous/public endpoints (no auth)

2. **Client-side (browser)** - Outside React lifecycle (e.g., clientLoaders):
   - `getClientManager().getOrCreateClient(tenantId)` - Tenant client with `X-PublyApp-TenantId`
   - `getClientManager().getOrCreateStaffClient()` - Staff client (no tenant-id header)
   - `getClientManager().getOrCreateAnonymousClient()` - Anonymous client (no auth, no tenant)
   - `getClientManager().createClient({ tenantId?, skipAuth?, context? })` - Create ad-hoc client

3. **Server-side (SSR)** - In React Router loaders/actions:
   - `getClientManager({ staffToken?, tenantToken? }).createClient({ tenantId?, context? })` - per-request instance
   - Tokens are parsed by `getServerLoader` / `getServerAction` and passed to your loader/action
   ```typescript
   import { getClientManager } from '@/front/lib/js-client/client-manager';
   const apiClient = getClientManager({ staffToken, tenantToken }).createClient();
   ```

**Data Fetching Pattern (Route-Type Specific):**

**CRITICAL:** Data fetching strategy depends on route type:

1. **Marketing Pages** (`app/routes/marketing/**`) -> SSR with React Router loaders/actions
2. **Auth Pages** (`app/routes/auth/**`) -> SSR with React Router loaders/actions (hide API endpoints)
3. **Authed Pages** (`app/routes/authed/**`) -> Client-only for application data with TanStack Query (no SSR data fetching)

**Allowed exception for authed pages:** You may use `loader` only for fast, non-sensitive metadata (e.g. page title/meta tags) to avoid client-side flicker. Never fetch real application data in an authed page `loader`.

```tsx
// ❌ WRONG - Fetching application data in a server loader (authed routes)
// File: app/routes/authed/staff/members-page.tsx
export const loader = async ({ apiClient }) => {
  const data = await apiClient.staff.staffUsers.get();
  return { data };
};

// ✅ CORRECT - Use hook factories for authenticated pages
// Step 1: Define hook in app/lib/react-query/features/staff/staff-user.hooks.ts
import { createStaffQuery } from '../../create-hooks';

export const useFindStaffUser = createStaffQuery({
  queryKeyFn: (client) => client.staff.staffUsers.get,
  fetcher: async (client, params: { page?: number }) => {
    const result = await client.staff.staffUsers.get({
      queryParameters: { page: params.page?.toString() },
    });
    if (_.isNil(result)) throw new Error('useFindStaffUser: result is nil');
    return result;
  },
});

// Step 2: Use hook in component
// File: app/routes/authed/staff/members-page.tsx
import { useFindStaffUser } from '@/front/lib/react-query/features/staff/staff-user.hooks';

function StaffUsersPage() {
  const { data, isLoading } = useFindStaffUser({ variables: { page: 1 } });
  return <div>{/* render */}</div>;
}

// ✅ CORRECT - Server loader for auth pages (hide endpoints)
// File: app/routes/auth/login/login-page.tsx
export const loader = getServerLoader({
  loader: async ({ apiClient }) => {
    // Pre-fetch data server-side
    return data({ ... });
  }
});

// ✅ CORRECT - Mutations in authed pages use hook factories
// Step 1: Define mutation hook
import { createStaffMutation } from '../../create-hooks';

export const useCreateMember = createStaffMutation({
  mutationKeyFn: (client) => client.staff.members.post,
  mutationFn: async (client, data: { email: string }) => {
    const result = await client.staff.members.post({
      email: { getValue() { return data.email; } },
    });
    if (_.isNil(result)) throw new Error('useCreateMember: result is nil');
    return result;
  },
});

// Step 2: Use in component
function CreateMemberDialog() {
  const { mutate } = useCreateMember({
    onSuccess: () => queryClient.invalidateQueries(['staff.members.get'])
  });
}
```

**Why different strategies:**
- **Marketing/Auth pages:** SSR for SEO and security (hide API endpoints)
- **Authed pages:** Client-only for better UX, real-time updates, no SEO needed
- Authed layout wrapped in `<ClientOnly>` component

**Optimized Data Fetching (Optional):**

For authed pages where you want to optimize initial load time, use `getClientLoader` with react-query-kit prefetching:

```tsx
import { getClientLoader } from '@/front/lib/react-router/client-data';
import { QueryClient } from '@tanstack/react-query';

// ✅ CORRECT - Use getClientLoader wrapper
export const clientLoader = getClientLoader({
  loader: async ({ apiClient, z, locale }) => {
    const queryClient = new QueryClient();

    // Prefetch using react-query-kit hooks
    await queryClient.prefetchQuery({
      queryKey: useFindStaffUser.getKey({ page: 1 }),
      queryFn: () => useFindStaffUser.fetcher({ page: 1 }),
    });

    return null;
  },
});

// ❌ WRONG - Don't export raw clientLoader
export async function clientLoader() { ... }
```

**Benefits:** `getClientLoader` provides initialized `apiClient`, `z` (Zod with i18n), and `locale` - just like `getServerLoader` on the server.

**Reference:** See the "Data Fetching Pattern" section above for complete patterns.

### Authentication & Authorization

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

### RFC 7807 + Frontend Logout Semantics (Do Not Regress)

**Backend invariants:**
- Error responses must be RFC 7807 `application/problem+json` via `TypedProblems.*` and the `App*HttpResult` types.
- `422` is for validation problems and must include `errors: Dictionary<string, string[]>` with stable keys.
- Avoid nullable `[FromBody]` on validated endpoints unless you also ensure OpenAPI still marks the body required; otherwise Kiota can generate optional/union request-body types.
- `401` must be reserved for **invalid/missing session** only (frontend treats `401` as “logout now”).
- Tenant header issues should not return `401` (use `400`/`422` as appropriate).
- Never log secrets: do not log `X-Session-Token` (or any session token value) in any log level.

**Frontend invariants:**
- Only `401` triggers centralized logout; `403` must not log users out.
- The TanStack Query `QueryClient` is a browser singleton; auth handling must work even if it’s instantiated before root initialization.

### Internationalization (i18n)

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

### API Routes & Endpoint Path Design

This section defines the canonical endpoint path structure for the PublyApp API.

#### Two API Scopes

| Scope | Prefix | Auth | Tenant Context |
|-------|--------|------|----------------|
| **Staff API** | `/staff/...` | Staff session + authorization | Explicit via `{tenantId}` in path |
| **Tenant API** | `/...` (root) | Tenant session + authorization | Implicit from `X-Tenant-Id` header |
| **Anonymous** | `/auth/...`, `/invitations/...` | None | None |

#### Staff API Structure (`/staff/*`)

Staff (platform administrators) access resources with explicit tenant context:

```
/staff/
├── tenants/                         # Tenant management
│   ├── GET    /                     # List all tenants
│   ├── POST   /                     # Create tenant
│   ├── GET    /{tenantId}           # Get tenant
│   └── {tenantId}/                  # Tenant-scoped resources
│       ├── users/                   # Users in this tenant
│       │   ├── GET    /             # List tenant users
│       │   ├── POST   /             # Create tenant user
│       │   ├── GET    /{userId}     # Get tenant user
│       │   └── ...
│       ├── invitations/             # Invitations for this tenant
│       │   ├── GET    /             # List tenant invitations
│       │   ├── POST   /             # Create tenant invitation
│       │   └── ...
│       ├── posts/                   # Posts in this tenant (future)
│       └── [other-slices]/          # Other tenant resources
│
├── users/                           # Staff member management
│   ├── GET    /                     # List staff members
│   ├── POST   /                     # Create staff member
│   ├── GET    /{userId}             # Get staff member
│   └── ...
│
├── invitations/                     # Staff invitations
│   ├── GET    /                     # List staff invitations
│   ├── POST   /                     # Create staff invitation
│   └── ...
│
├── profiles/                        # Staff profiles/roles
├── permissions/                     # Permission management
└── [other-staff-slices]/            # Other staff-only resources
```

#### Tenant API Structure (`/` root)

Tenant users access their own resources with implicit tenant context from header:

```
/                                    # Tenant API (tenantId from X-Tenant-Id header)
├── me                               # Current user profile
├── users/                           # Users in my tenant
│   ├── GET    /                     # List users
│   ├── POST   /invite               # Invite user
│   └── ...
├── posts/                           # Posts in my tenant (future)
│   ├── GET    /                     # List my posts
│   ├── POST   /                     # Create post
│   ├── GET    /{postId}             # Get post
│   └── ...
├── workspaces/                      # Workspaces (future)
└── [other-tenant-slices]/           # Other tenant resources
```

#### Anonymous Routes

```
/auth/                               # Authentication
├── POST   /login                    # Login
├── POST   /register                 # Register
├── GET    /user-auth-data           # Get auth data (requires session)
├── POST   /reset-password           # Reset password
└── ...

/invitations/                        # Public invitation acceptance
├── GET    /{token}/details          # Get invitation details
├── POST   /{token}/accept           # Accept invitation
└── GET    /check                    # Check token validity
```

#### Design Principles

1. **Symmetry**: Same resource names (`users`, `invitations`, `posts`) appear in both APIs
   - `/staff/tenants/{tenantId}/users` — Staff managing tenant's users
   - `/staff/users` — Staff managing staff members
   - `/users` — Tenant managing their own users

2. **Explicit vs Implicit Tenant**:
   - Staff API: Tenant is **explicit** in path (`/staff/tenants/{tenantId}/...`)
   - Tenant API: Tenant is **implicit** from header (just `/users`, `/posts`)

3. **Predictable Nesting**:
   - Staff managing tenant X? Always `/staff/tenants/{x}/...`
   - Staff-only resources? Always `/staff/[resource]/...`
   - Tenant self-service? Always `/[resource]/...`

4. **Flat Resource Access**:
   - When ID is known, allow direct access: `/staff/users/{userId}` (shortcut)
   - Listing requires context: `/staff/tenants/{tenantId}/users` (scoped)

#### Route Constants Location

Routes are defined as C# constants in partial classes:
- Base routes: `apps/api/Src/Lib/Routes/Routes.cs`
- Domain routes: `apps/api/Src/Modules/<Domain>/Routes.<Domain>.cs`

```csharp
// Example: Routes.Users.cs
public static partial class Routes {
    public static class Users {
        // Staff managing staff members
        public static class ForStaff {
            public const string Root = "/staff/users";
            public const string Create = $"{Root}/";
            public const string Find = $"{Root}/";
        }

        // Staff managing tenant users
        public static class ForTenantAsStaff {
            public const string Root = "/staff/tenants/{tenantId}/users";
            public static string RootFn(string tenantId) => $"/staff/tenants/{tenantId}/users";
        }

        // Tenant API (self-service)
        public static class ForTenant {
            public const string Root = "/users";
            public const string Find = $"{Root}/";
        }
    }
}
```

#### Handler & Endpoint Naming Convention

| Context | Handler Suffix | Endpoint File |
|---------|---------------|---------------|
| Staff managing staff resources | `*ForStaff` | `*EndpointsForStaff.cs` |
| Staff managing tenant resources | `*ForTenantAsStaff` | `*EndpointsForTenantAsStaff.cs` |
| Tenant self-service | `*ForTenant` | `*EndpointsForTenant.cs` |
| Anonymous/public | `*Anonymous` | `*EndpointsAnonymous.cs` |

#### Adding a New Domain Slice

When adding a new domain (e.g., `Posts`):

1. Create route constants: `Modules/Posts/Routes.Posts.cs`
2. Create endpoints for each scope needed:
   - `PostsEndpointsForStaff.cs` — Staff managing their own posts (if applicable)
   - `PostsEndpointsForTenantAsStaff.cs` — Staff managing tenant posts
   - `PostsEndpointsForTenant.cs` — Tenant self-service
3. Create handlers in corresponding folders:
   - `Handlers/Staff/` — Staff handlers
   - `Handlers/Tenant/` — Tenant handlers
4. Register in `Program.cs`:
   - `staffGroup.MapPostsEndpointsForStaff();`
   - `staffGroup.MapPostsEndpointsForTenantAsStaff();`
   - `tenantGroup.MapPostsEndpointsForTenant();`

## Frontend Coding Standards

### UI Component Library: Material-UI

**CRITICAL:** This project uses Material-UI (MUI) v6 as the primary UI library. Never use native HTML elements for structure, nor components from other UI libraries (shadcn/ui, Chakra, etc.).

**Component imports:**
```tsx
// ✅ CORRECT - Import MUI components
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import Dialog from '@mui/material/Dialog';

// ❌ WRONG - Never use native HTML or other libraries
<div className="container">  // Use <Box> instead
<h1>Title</h1>               // Use <Typography variant="h1">
<button>Click</button>       // Use <Button>
import { Card } from '~/components/ui/card';  // Wrong library!
```

**Common replacements:**
- `<div>` → `<Box>`
- `<h1>` through `<h6>` → `<Typography variant="h1">` through `<Typography variant="h6">`
- `<p>` → `<Typography>`
- `<button>` → `<Button>`
- `<input>` → `<TextField>`
- `<select>` → `<Select>` with `<MenuItem>`
- `<table>` → `<Table>` with `<TableHead>`, `<TableBody>`, `<TableRow>`, `<TableCell>`

**Reference:** See `.dump/main-template/src/sections/**/*.tsx` for real-world examples.

### Styling: sx Prop and Theme System

**CRITICAL:** This project uses MUI's `sx` prop for styling. Never use Tailwind CSS, CSS modules with className, or inline style strings.

**Styling pattern:**
```tsx
// ❌ WRONG - Using Tailwind classes
<div className="flex items-center justify-between p-4 bg-gray-100">
  <h1 className="text-3xl font-bold">Title</h1>
</div>

// ✅ CORRECT - Using sx prop
<Box sx={{
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  p: 4,                    // padding: theme.spacing(4)
  bgcolor: 'grey.100'      // theme.palette.grey[100]
}}>
  <Typography variant="h1" sx={{ fontSize: '3rem', fontWeight: 'bold' }}>
    Title
  </Typography>
</Box>
```

**Tailwind to sx prop quick reference:**
- `className="flex"` → `sx={{ display: 'flex' }}`
- `className="p-4"` → `sx={{ p: 4 }}`
- `className="mx-auto"` → `sx={{ mx: 'auto' }}`
- `className="text-center"` → `sx={{ textAlign: 'center' }}`
- `className="bg-blue-500"` → `sx={{ bgcolor: 'primary.main' }}`
- `className="hover:bg-blue-700"` → `sx={{ '&:hover': { bgcolor: 'primary.dark' } }}`

**Responsive styling:**
```tsx
<Box sx={{
  p: { xs: 2, md: 4, lg: 8 },  // Responsive padding
  fontSize: { xs: '1rem', md: '1.25rem' }
}}>
```

**Reference:** See the "Styling: sx Prop and Theme System" section above for complete Tailwind-to-sx conversion guide.

### Date Handling: Day.js + Format Utilities

**CRITICAL:** This project uses Day.js for all date operations. Never use date-fns, Moment.js, or native Date methods for formatting.

**CRITICAL:** Always use the centralized date formatting utilities from `apps/front/app/utils/format-time.ts` instead of importing dayjs directly in components. These utilities already configure dayjs plugins (relativeTime, duration) and provide consistent formatting across the app.

**Pattern:**
```tsx
// ❌ WRONG - Importing dayjs directly and extending plugins in components
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);
const timeAgo = dayjs(date).fromNow();

// ❌ WRONG - Using date-fns
import { formatDistanceToNow } from 'date-fns';
const timeAgo = formatDistanceToNow(new Date(date), { addSuffix: true });

// ✅ CORRECT - Using format-time utilities
import { fDateTime, fDate, fTime, fToNow, fTimestamp } from '@/front/utils/format-time';
const timeAgo = fToNow(date);              // "2 hours ago"
const formatted = fDate(date);             // "17 Apr 2022"
const dateTime = fDateTime(date);          // "17 Apr 2022 12:00 am"
```

**Available utilities from `apps/front/app/utils/format-time.ts`:**
```tsx
// Basic formatting
fDateTime(date)                    // "17 Apr 2022 12:00 am"
fDate(date)                        // "17 Apr 2022"
fTime(date)                        // "12:00 am"
fTimestamp(date)                   // 1713250100 (Unix timestamp)

// Relative time
fToNow(date)                       // "2 hours" (time from now)

// Comparisons
fIsBetween(date, start, end)       // Boolean
fIsAfter(start, end)               // Boolean
fIsSame(start, end, unit?)         // Boolean

// Date ranges
fDateRangeShortLabel(start, end)   // "25 - 26 Apr 2024" (smart range formatting)

// Helpers
today(template?)                   // Today's date formatted
fAdd({ days: 7 })                  // Add duration to today
fSub({ months: 1 })                // Subtract duration from today

// Custom formatting (when needed)
fDate(date, 'DD/MM/YYYY')          // "17/04/2022" (custom template)
fDateTime(date, 'YYYY-MM-DD')      // "2022-04-17" (custom template)
```

**Format patterns available:**
```tsx
import { formatPatterns } from '@/front/utils/format-time';

formatPatterns.dateTime            // 'DD MMM YYYY h:mm a'
formatPatterns.date                // 'DD MMM YYYY'
formatPatterns.time                // 'h:mm a'
formatPatterns.split.dateTime      // 'DD/MM/YYYY h:mm a'
formatPatterns.split.date          // 'DD/MM/YYYY'
formatPatterns.paramCase.dateTime  // 'DD-MM-YYYY h:mm a'
formatPatterns.paramCase.date      // 'DD-MM-YYYY'
```

**When direct dayjs is acceptable:**
- Complex date manipulation not covered by utilities (rare)
- MUI DatePicker/TimePicker integration (uses dayjs adapter)
- Custom hooks that need full dayjs API

**Never do this in components:**
```tsx
// ❌ WRONG - Extending dayjs plugins in component files
dayjs.extend(relativeTime);
dayjs.extend(duration);
```

**Reference:** The `format-time.ts` utilities already configure all necessary dayjs plugins. If you need additional plugins, add them to `format-time.ts`, not to individual components.

### Array Methods: Avoid reduce()

**CRITICAL:** Do not use `Array.prototype.reduce()` or `Array.prototype.reduceRight()`. These methods produce hard-to-read code and can almost always be replaced with clearer alternatives.

**Why avoid reduce:**
- Hard to read and understand at a glance
- Often misused for operations better suited to other methods
- Makes code reviews more difficult
- Usually indicates a need for a simpler approach

**Alternatives:**
```tsx
// ❌ WRONG - Using reduce to find an item
const result = items.reduce((acc, item) => {
  if (!acc && item.id === targetId) return item;
  return acc;
}, null);

// ✅ CORRECT - Use find
const result = items.find((item) => item.id === targetId);

// ❌ WRONG - Using reduce to filter and map
const result = items.reduce((acc, item) => {
  if (item.isActive) acc.push(item.name);
  return acc;
}, []);

// ✅ CORRECT - Use filter + map
const result = items.filter((item) => item.isActive).map((item) => item.name);

// ❌ WRONG - Using reduce to sum values
const total = items.reduce((sum, item) => sum + item.price, 0);

// ✅ CORRECT - Use a for...of loop for clarity
let total = 0;
for (const item of items) {
  total += item.price;
}

// ❌ WRONG - Using reduce to group items
const grouped = items.reduce((acc, item) => {
  const key = item.category;
  if (!acc[key]) acc[key] = [];
  acc[key].push(item);
  return acc;
}, {});

// ✅ CORRECT - Use Object.groupBy (ES2024) or a for...of loop
const grouped = Object.groupBy(items, (item) => item.category);
// OR
const grouped: Record<string, Item[]> = {};
for (const item of items) {
  (grouped[item.category] ??= []).push(item);
}
```

**Note:** Biome does not yet have a `noArrayReduce` rule (like ESLint's `unicorn/no-array-reduce`). This is a manual code review guideline until Biome adds support.

### Function Definitions: Arrow Functions

**CRITICAL:** Always prefer arrow function expressions over traditional function declarations/expressions in TypeScript and JavaScript. Only use `function` keyword when absolutely necessary (e.g., when you need to access `this` as the first parameter, or for generator functions).

**Pattern:**
```tsx
// ❌ WRONG - Using function expression/declaration
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

function processData(data: Data) {
  // ...
}

// ✅ CORRECT - Using arrow functions
const calculateTotal = (items: Item[]): number => {
  return items.reduce((sum, item) => sum + item.price, 0);
};

const processData = (data: Data) => {
  // ...
};
```

**Why arrow functions:**
- Consistent with modern JavaScript/TypeScript conventions
- Lexical `this` binding prevents common bugs
- More concise syntax
- Easier to read in code reviews

**Exceptions (use `function` keyword):**
- Generator functions: `function* generateSequence() { ... }`
- When you explicitly need dynamic `this` binding (rare in modern React)
- React component lifecycle methods in class components (though we prefer functional components)

**Examples:**
```tsx
// ✅ Helper functions
const clearSessionAndGetLoginUrl = (): string => {
  clearSessionCookie();
  return redirectUrl;
};

// ✅ Event handlers
const handleSubmit = async (data: FormData) => {
  await mutation.mutateAsync(data);
};

// ✅ React components
const UserProfile = ({ userId }: Props) => {
  return <div>{/* ... */}</div>;
};

// ❌ EXCEPTION - Generator function (must use function keyword)
function* idGenerator() {
  let id = 0;
  while (true) yield id++;
}
```

### React Components: Arrow Function Components Only

**CRITICAL:** All React components in this codebase MUST be defined as arrow function components. Never use function declarations or class components.

**Pattern:**
```tsx
// ❌ WRONG - Function declaration component
function UserProfile({ userId }: UserProfileProps) {
  return <div>User: {userId}</div>;
}

// ❌ WRONG - Class component
class UserProfile extends React.Component<UserProfileProps> {
  render() {
    return <div>User: {this.props.userId}</div>;
  }
}

// ✅ CORRECT - Arrow function component
const UserProfile = ({ userId }: UserProfileProps) => {
  return <div>User: {userId}</div>;
};

// ✅ CORRECT - Arrow function component with explicit return type
const UserProfile: React.FC<UserProfileProps> = ({ userId }) => {
  return <div>User: {userId}</div>;
};
```

**Why arrow function components:**
- Consistent with modern React best practices and hooks-based development
- Lexical `this` binding (no need for `.bind()` or arrow functions in class methods)
- More concise and readable
- Easier to refactor and test
- Works seamlessly with React Hooks
- Consistent with the rest of the codebase's function style

**Component structure:**
```tsx
// ✅ CORRECT - Full component example
type UserCardProps = {
  userId: string;
  onEdit: (id: string) => void;
};

const UserCard = ({ userId, onEdit }: UserCardProps) => {
  const { data, isLoading } = useGetUser({ userId });

  const handleEdit = () => {
    onEdit(userId);
  };

  if (isLoading) {
    return <CircularProgress />;
  }

  return (
    <Card>
      <CardContent>
        <Typography>{data?.name}</Typography>
        <Button onClick={handleEdit}>Edit</Button>
      </CardContent>
    </Card>
  );
};

export default UserCard;
```

**Never use:**
- `function ComponentName() { ... }` syntax for components
- Class components (`extends React.Component`)
- `React.createClass()` (legacy API)

### Form Handling

**Use React Hook Form with Zod validation:**
```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type FormData = z.infer<typeof schema>;

const form = useForm<FormData>({
  resolver: zodResolver(schema),
});
```

### Query State Display: QueryDisplay Component

**CRITICAL:** Always prefer the `QueryDisplay` component over manual conditional rendering for TanStack Query states.

**Why use QueryDisplay:**
- Consistent loading/error/empty state handling across the app
- Reduces boilerplate code
- Prevents common mistakes (forgetting to check `isError`, etc.)
- Centralized UX patterns for query states

**Pattern:**
```tsx
// ❌ WRONG - Manual conditional rendering
import { useFindStaffUsers } from '@/front/lib/react-query/features/staff/staff-user.hooks';

function StaffUsersPage() {
  const { data, isLoading, isError, error } = useFindStaffUsers();

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
      <CircularProgress />
    </Box>;
  }

  if (isError) {
    return <div>Error: {error.message}</div>;
  }

  return <div>{/* render data */}</div>;
}

// ✅ CORRECT - Using QueryDisplay component
import QueryDisplay from '@/front/components/query-display';
import { useFindStaffUsers } from '@/front/lib/react-query/features/staff/staff-user.hooks';

function StaffUsersPage() {
  const query = useFindStaffUsers();

  return (
    <QueryDisplay
      query={query}
      LoadingSlot={() => (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}
      ErrorSlot={({ error }) => (
        <Typography color="error">
          Failed to load members: {error.message}
        </Typography>
      )}
      EmptySlot={() => (
        <Typography>No members found</Typography>
      )}
    >
      {({ data }) => (
        <div>{/* render data */}</div>
      )}
    </QueryDisplay>
  );
}
```

**QueryDisplay Props:**
- `query`: The TanStack Query result object (required)
- `loadingStrategy`: `'loading' | 'pending' | 'fetching'` (defaults to `'pending'`)
- `LoadingSlot`: Custom loading component (ReactNode or FC)
- `ErrorSlot`: Custom error component (ReactNode or FC<{ error: unknown }>)
- `EmptySlot`: Custom empty state component (ReactNode or FC)
- `children`: Render function with data or ReactNode

**Loading Strategies:**
- `'pending'` (default): Shows loading on initial fetch only
- `'loading'`: Shows loading when no cached data exists
- `'fetching'`: Shows loading on every fetch (including refetches)

**Example with all slots:**
```tsx
<QueryDisplay
  query={permissionsQuery}
  loadingStrategy="pending"
  LoadingSlot={() => (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
      <CircularProgress />
    </Box>
  )}
  ErrorSlot={({ error }) => (
    <Alert severity="error">
      Failed to load permissions: {error.message}
    </Alert>
  )}
  EmptySlot={() => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <Typography variant="body2" color="text.secondary">
        No permissions available
      </Typography>
    </Box>
  )}
>
  {({ data }) => (
    <List>
      {data.map(item => (
        <ListItem key={item.id}>{item.name}</ListItem>
      ))}
    </List>
  )}
</QueryDisplay>
```

**When to use QueryDisplay:**
- ✅ Any component that displays TanStack Query data
- ✅ List pages with loading/error/empty states
- ✅ Detail pages that fetch single resources
- ✅ Forms that load initial data from API

**When NOT to use QueryDisplay:**
- ❌ Mutations (use mutation states directly)
- ❌ When you need very custom loading logic
- ❌ Background refetches where you want to show stale data

### Component Structure Best Practices

1. **Import order:**
   - React imports
   - Third-party libraries
   - MUI components
   - Project imports (utils, hooks, types)
   - Local components

2. **Component file structure:**
   - Type definitions
   - Component function
   - Styled components (if using `styled()`)
   - Helper functions

3. **Never create wrapper components for MUI:**
   - Use MUI components directly
   - Use `sx` prop for styling variations
   - Check `.dump/main-template` for patterns

4. **Look at the premium template first:**
   - Before implementing UI, check `.dump/main-template/src/sections/` for similar patterns
   - Follow the same MUI component usage patterns
   - Reuse styling approaches

## C# Coding Standards

### Null Checking

**Always use pattern matching (`is`/`is not`) instead of equality operators:**

```csharp
// ✅ CORRECT
if (user is not null)
if (tenant is null)

// ❌ WRONG
if (user != null)
if (tenant == null)
```

Pattern matching is safer because it cannot be overridden by custom equality operators.

### LINQ Queries

**Prefer query syntax over method syntax for database queries:**

```csharp
// ✅ CORRECT - Query syntax for database queries
var users = from u in db.Users
            where u.IsDeleted == false
            orderby u.CreatedAt descending
            select u;

// ❌ WRONG - Method syntax for database queries
var users = db.Users
    .Where(u => u.IsDeleted == false)
    .OrderByDescending(u => u.CreatedAt);
```

**Exception:** Method syntax is acceptable for:
- Simple single operations: `.First()`, `.Count()`, `.Any()`, `.ToList()`
- Operations without query syntax equivalents
- In-memory collections

### Collection Checking

**Prefer comparing `Count` to 0 rather than using `.Any()` for clarity and performance:**

```csharp
// ❌ WRONG - Using .Any() to check if collection has items
if (invitations.Any())
if (!users.Any())

// ✅ CORRECT - Compare Count to 0
if (invitations.Count > 0)
if (users.Count == 0)
```

**Why prefer `Count > 0`:**
- More explicit and clearer intent
- Better performance for collections that already have a Count property (List<T>, array, etc.)
- Avoids unnecessary enumeration overhead
- More consistent with common C# idioms

**Exception:** Use `.Any()` when:
- Working with IEnumerable<T> that doesn't have an efficient Count implementation
- Using `.Any(predicate)` with a condition: `users.Any(u => u.IsActive)`
- The collection is a LINQ query that hasn't been materialized yet

### Async/Await Patterns

**Critical anti-patterns to NEVER use:**

```csharp
// ❌ NEVER block on async - causes thread pool exhaustion
.Result
.Wait()
.GetAwaiter().GetResult()
Task.Run(() => await SomeAsyncMethod()) // unnecessary for I/O

// ❌ NEVER use async void (except event handlers)
public async void ProcessMessage(Message msg)
```

**Required patterns:**

```csharp
// ✅ CORRECT - async Task with CancellationToken
public async Task<User?> GetUserAsync(
    Guid userId,
    CancellationToken cancellationToken = default)
{
    return await _dbContext.Users
        .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
}

// ✅ CORRECT - Parallel independent operations
var userTask = GetUserAsync(id, cancellationToken);
var permissionsTask = GetPermissionsAsync(id, cancellationToken);
await Task.WhenAll(userTask, permissionsTask);

// ✅ CORRECT - Controlled concurrency for bulk operations
const int maxConcurrency = 10;
using var semaphore = new SemaphoreSlim(maxConcurrency);
var tasks = ids.Select(async id =>
{
    await semaphore.WaitAsync(cancellationToken);
    try { return await ProcessAsync(id, cancellationToken); }
    finally { semaphore.Release(); }
});
var results = await Task.WhenAll(tasks);
```

**Important:** Do NOT use `ConfigureAwait(false)` in this ASP.NET Core application. ASP.NET Core has no SynchronizationContext, so it provides zero benefit.

**Always:**
- Add `CancellationToken cancellationToken = default` to all public async methods
- Use EF Core async methods: `FindAsync`, `FirstOrDefaultAsync`, `ToListAsync`, `SaveChangesAsync`, `ExecuteUpdateAsync`
- Run independent queries in parallel with `Task.WhenAll()`
- Use `SemaphoreSlim` to limit concurrency in bulk operations
- Use `await using` for transactions with explicit rollback on errors

### Handler Architecture (Vertical Slice)

**CRITICAL:** Each handler file must be self-contained with ALL related code in ONE file.

```csharp
// ✅ CORRECT - Everything in one file: Handler + DTOs + Validators
// File: apps/api/Src/Modules/Invitations/Handlers/Staff/CreateStaffInvitation.cs

using FluentValidation;
using System.Text.Json;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

// Request DTO (Body suffix for request body, Query suffix for query params)
public record CreateStaffInvitationBody {
    public required JsonElement Email { get; init; }      // JsonElement for body params!
    public required JsonElement ProfileId { get; init; }
}

// Response DTO (no Dto suffix!)
public record InvitationCreated {
    public required Guid InvitationId { get; init; }
    public required string Token { get; init; }
}

// Validator (in same file)
public class CreateStaffInvitationBodyValidator : AbstractValidator<CreateStaffInvitationBody> {
    public CreateStaffInvitationBodyValidator() {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.ProfileId).NotEmpty();
    }
}

// Handler class (descriptive HandleX method name)
public static class CreateStaffInvitation {
    public static async Task<Results<Ok<InvitationCreated>, AppBadRequestHttpResult, AppForbiddenHttpResult>>
    HandleCreateStaffInvitation(  // ✅ Descriptive name, NOT just "Handle"
        [FromServices] IAuthContext authContext,
        [FromServices] IInvitationService invitationService,  // ✅ Use service, NOT DbContext
        [FromBody] CreateStaffInvitationBody request,
        CancellationToken cancellationToken = default
    ) {
        // Handler only orchestrates - no DbContext access!
        var result = await invitationService.CreateStaffInvitationAsync(...);
        return TypedResults.Ok(new InvitationCreated { ... });
    }
}
```

**Rules:**
1. **NO separate DTO files** - Define DTOs in handler file
2. **NO separate Validator files** - Define validators in handler file
3. **NO "Dto" suffix** - Use descriptive names like `InvitationCreated`, NOT `InvitationDto`
4. **Request DTOs naming**:
   - `Body` suffix for request body params (e.g., `CreateUserBody`)
   - `Query` suffix for query params (e.g., `ListUsersQuery`)
5. **Handler method names** - Use `HandleCreateUser`, NOT just `Handle`
6. **NO DbContext in handlers** - All database access through service layer
7. **Line length** - Maximum 100 characters, break long lines

### DTO and Request/Response Patterns

**Request Body DTOs MUST use JsonElement:**

```csharp
// ✅ CORRECT - JsonElement allows FluentValidation to provide friendly errors
public record CreateUserBody {
    public required JsonElement Email { get; init; }
    public required JsonElement Password { get; init; }
}

// ❌ WRONG - Typed properties throw before validation runs
public record CreateUserBody {
    public required string Email { get; init; }  // Throws if not a string!
    public required Guid Id { get; init; }       // Throws if invalid GUID format!
}
```

**Why JsonElement?** ASP.NET Core parameter binding runs BEFORE FluentValidation. Using `JsonElement` defers type conversion to validation, allowing friendly error messages instead of ugly 400 errors.

**Update/PATCH body DTOs with clearable nullable fields:** Use non-nullable `JsonElement` (NOT `JsonElement?`) for clearable fields, and `PatchField<T>` in the getter method to distinguish "not sent" from "explicitly null". See the **PatchField\<T\> for Nullable PATCH Fields** section and [`docs/guides/patchfield-pattern.md`](docs/guides/patchfield-pattern.md) for the full pattern.

```csharp
// ✅ CORRECT - Update body with clearable nullable field
// CRITICAL: clearable field MUST be non-nullable JsonElement
public record UpdateNoticeBody {
    public JsonElement ExpiresAt { get; init; }

    // Returns PatchField via ValueKind switch
    public PatchField<DateTime?> GetExpiresAt() =>
        ExpiresAt.ValueKind switch {
            JsonValueKind.Undefined =>
                PatchField<DateTime?>.Absent(),
            JsonValueKind.Null =>
                PatchField<DateTime?>.Set(null),
            JsonValueKind.String =>
                PatchField<DateTime?>.Set(
                    ExpiresAt.GetValueAsDateTime()
                ),
            _ => throw new InvalidOperationException(
                "ExpiresAt must be string, null, or omitted"
            ),
        };
}
```

**Query Parameters use typed properties:**

```csharp
// ✅ CORRECT - Query params from URL are always strings, so typed properties work
public record ListUsersQuery {
    public string? Search { get; init; }
    public UserStatus? Status { get; init; }
    public int? Page { get; init; }
}
```

### Service Layer Separation

**CRITICAL:** Handlers MUST NOT access `DbContext` directly. Use service layer.

```csharp
// ❌ WRONG - Handler accesses DbContext
public static async Task<Ok> Handle(
    [FromServices] MainApiDbContext dbContext,  // NO!
    [FromBody] CreateBody request
) {
    var user = await dbContext.User.FindAsync(id);  // NO!
    await dbContext.SaveChangesAsync();  // NO!
}

// ✅ CORRECT - Handler delegates to service
public static async Task<Ok> HandleCreateUser(
    [FromServices] IUserService userService,  // YES!
    [FromBody] CreateUserBody request
) {
    var result = await userService.CreateAsync(...);  // YES!
    return TypedResults.Ok();
}
```

**Handler responsibilities:**
- Validate authorization
- Parse/validate input
- Orchestrate service calls
- Map responses to HTTP results

**Service responsibilities:**
- All database access (DbContext)
- Business logic
- Transaction management
- Domain event coordination

**Service parameter conventions for update methods:**
- Non-nullable required fields: use the typed value directly (`string title`)
- Optional fields (update if present, skip if null): use `T?` (`string? title`, `DateTime? startsAt`)
- Clearable nullable fields (need to distinguish "not sent" from "set to null"): use `PatchField<T?>` — see **PatchField\<T\> for Nullable PATCH Fields** section and [`docs/guides/patchfield-pattern.md`](docs/guides/patchfield-pattern.md)

### Service Method Args Records

**CRITICAL:** When a service method has **3 or more domain parameters** (excluding `id`, `CancellationToken`, and infrastructure concerns), bundle them into a single args record. This keeps service signatures stable when fields are added/removed and makes handler code cleaner.

**Rules:**
1. **Naming:** `{Action}{Domain}Args` — e.g., `CreateSystemNoticeArgs`, `UpdateSystemNoticeArgs`
2. **Placement:** Define the args record in the **service file** (it's the service's input contract, not an HTTP DTO)
3. **Construction:** Handlers construct the args record inline — no separate mapper class needed
4. **Keep `id` separate:** Entity identifiers remain as separate parameters (they're routing concerns, not domain input)

```csharp
// ✅ CORRECT - Args record in the service file
public record CreateSystemNoticeArgs(
    NoticeSeverity Severity,
    string Title,
    string Message,
    DateTime StartsAt,
    DateTime? ExpiresAt,
    Guid CreatedByStaffId
);

// ✅ CORRECT - Service interface uses args record
Task<SystemNotice> CreateAsync(
    CreateSystemNoticeArgs args,
    CancellationToken cancellationToken = default);

Task<SystemNotice?> UpdateAsync(
    Guid id,                    // id stays separate
    UpdateSystemNoticeArgs args,
    CancellationToken cancellationToken = default);

// ✅ CORRECT - Handler constructs args inline
var args = new CreateSystemNoticeArgs(
    Severity: severity,
    Title: body.GetTitle(),
    Message: body.GetMessage(),
    StartsAt: body.GetStartsAt(),
    ExpiresAt: body.GetExpiresAt(),
    CreatedByStaffId: account.UserId
);
var notice = await service.CreateAsync(
    args, cancellationToken
);
```

**When NOT to use args records:**
- Methods with 1–2 domain parameters (e.g., `DeleteAsync(Guid id)`, `GetByIdAsync(Guid id)`)
- Query/find methods where parameters are optional filters — use explicit parameters or a dedicated query record

```csharp
// ❌ WRONG - Too many loose parameters
Task<SystemNotice> CreateAsync(
    NoticeSeverity severity,
    string title,
    string message,
    DateTime startsAt,
    DateTime? expiresAt,
    Guid createdByStaffId,
    CancellationToken ct = default);

// ❌ WRONG - Args record for a trivial method
public record DeleteArgs(Guid Id);  // Overkill
Task<bool> DeleteAsync(DeleteArgs args, CancellationToken ct);

// ✅ CORRECT - Simple methods keep plain parameters
Task<bool> DeleteAsync(
    Guid id, CancellationToken ct = default);
```

### Dependency Injection Rules

#### Adding a New Application Service

- **Namespace**: Place concrete class under `MainApi.Src.Modules.<Domain>.Services`
- **Primary interface**: Define `I{ClassName}` interface (e.g., `UserService` → `IUserService`)
- **Explicit lifetime**: Specify `ServiceLifetime` explicitly (Scoped, Transient, or Singleton)
- **One unkeyed default**: Exactly one unkeyed registration per service type is allowed
- **Key governance**: If multiple implementations exist, additional ones must be keyed using constants (never inline strings)

#### Adding a Keyed Implementation

When adding a second (or nth) implementation of an existing service interface:

- **Keys classes**: Use the appropriate keys class:
  - `ProviderKeys` — provider/adapter implementations (email providers, auth providers)
  - `StorageKeys` — storage backends (file storage, blob storage)
  - `IntegrationKeys` — external integrations (payment gateways, notification services)
- **Key naming**: Use lowercase, stable identifiers as `public const string` (e.g., `"resend"`, `"local"`)
- **Allowed characters**: `[a-z0-9._-]` only (no whitespace/control chars)
- **Collision avoidance**: Verify no other implementation of the same service type uses the same key
- **Registration**: Use `.AddKeyed*<TService, TImpl>(YourKeys.YourKey)`
- **Injection**: Use `[FromKeyedServices(YourKeys.YourKey)]` at the consumer

#### DI Group Boundaries

- **Web group** (`AddWebServices`): ASP.NET Core wiring (ProblemDetails, OpenAPI, CORS, compression)
- **Infrastructure group** (`AddInfraServices`): External capabilities (DbContext, SDK clients, email, health checks)
- **Application group** (`AddAppServices`): Business services only (`MainApi.Src.Modules.*.Services`)

#### Attribute-Based Application Service Registration (`[Service]`)

`[Service]` is used ONLY for application/business services and is enforced with fail-fast startup validation.

Quick Do / Don't:

- Do: Use `[Service]` only on concrete classes under `MainApi.Src.Modules.*.Services`
- Do: Implement the primary interface `I{ClassName}`
- Don't: Add multiple unkeyed implementations for the same service type (only one default allowed; additional ones must be keyed)

- **Allowed location**: Only concrete classes under `MainApi.Src.Modules.*.Services`
- **Scanning scope**: Single assembly (Main API) only
- **Lifetime**: Must be explicit (`ServiceLifetime` is required)
- **Interface binding**: Registers ONLY the primary interface `I{ClassName}`
- **No register-as-self**
- **No secondary interfaces**: If a class must be resolved via additional business interfaces, register those explicitly (manual DI wiring)
- **Concrete only**: No abstract classes; no open generic type definitions
- **Keyed DI**: Key type is `string` only
- **Key format**: Non-empty, lowercase only
- **Keys governance**: Keys must be centralized constants (no inline strings)
- **Duplicate implementations**:
  - Exactly ONE unkeyed default implementation per service type is allowed
  - Additional implementations MUST be keyed
  - Duplicate unkeyed defaults or duplicate keys are startup errors
- **Migration guardrail**: If a service type is discovered via `[Service]`, it MUST NOT also have any explicit DI registrations (unkeyed or keyed). Startup fails fast to prevent half-migrated states.
- **Misuse is a hard error**: Any `[Service]` attribute outside `MainApi.Src.Modules.*.Services` fails startup

#### Fail-Fast Validation (Troubleshooting)

Validation runs during `AddAppServices()` (before `builder.Build()`).
On any violation, startup fails with `InvalidOperationException` and a bullet list of errors.

Common failure categories and fixes:

- **Abstract/open generic**: Remove `[Service]` or apply it only to a concrete, non-generic implementation.
- **Invalid namespace**: Move the class to `MainApi.Src.Modules.<Domain>.Services` (or remove `[Service]` and wire explicitly).
- **Missing primary interface**: Ensure the class implements `I{ClassName}`.
- **Invalid key**: Use a non-empty, lowercase key constant; use `null` for unkeyed default.
- **Duplicate unkeyed**: Keep exactly one default; key additional implementations.
- **Duplicate keys**: Choose a unique key per service type.
- **Assembly type load failure**: Fix missing/incompatible references; rebuild and review loader exception messages.

#### DI Manifest Logging (Optional)

If enabled, the app logs a discovered `[Service]` manifest once during startup (after `builder.Build()`),
so the configured logging pipeline is guaranteed to be active.

- **Config flag**: `DI_MANIFEST_ENABLED` environment variable (defaults to `false`)
- **Logging**: Uses the configured Serilog pipeline (no temporary ServiceProvider)
- **Noise control**: No output when no `[Service]` attributes are discovered

### AppEnvironment (Configuration)

All application configuration is loaded from environment variables via `AppEnvironment`. This class is initialized once at startup and provides static access throughout the application.

**Initialization (in Program.cs):**
```csharp
AppEnvironment.Initialize(); // Must be called before anything else
```

**Usage anywhere in the codebase:**
```csharp
// Direct static access - no DI required
var env = AppEnvironment.Instance;
var frontUrl = env.FRONT_URL;
var tokenLength = env.INVITATION_TOKEN_LENGTH;

// Or inline
var headerKey = AppEnvironment.Instance.SESSION_TOKEN_HEADER_KEY;
```

**Available properties:**

| Category | Properties |
|----------|------------|
| **Secrets/URLs** | `POSTGRES_CONNECTION_STRING`, `FRONT_URL`, `RESEND_API_KEY`, `STAFF_OWNER_EMAIL`, `STAFF_OWNER_BOOTSTRAP_CODE` |
| **App Settings** | `APP_NAME`, `SESSION_TOKEN_HEADER_KEY`, `TENANT_ID_HEADER_KEY`, `DEFAULT_EMAIL_SENDER_EMAIL`, `DEFAULT_EMAIL_SENDER_NAME` |
| **Token Config** | `SESSION_EXPIRY_DAYS`, `EMAIL_VERIFY_TOKEN_VALIDITY_DURATION`, `PASSWORD_RESET_TOKEN_VALIDITY_DURATION`, `PASSWORD_MIN_LENGTH`, `EMAIL_VERIFY_TOKEN_LENGTH`, `PASSWORD_RESET_TOKEN_LENGTH`, `INVITATION_TOKEN_LENGTH` |
| **Feature Flags** | `DI_MANIFEST_ENABLED` |
| **Constants** | `MAX_PROFILES_PER_USER`, `PAGINATION_DEFAULT_LIMIT`, `MAX_BULK_INVITATIONS_SIZE`, `DEFAULT_MAX_USERS_PER_TENANT` |
| **Computed** | `IsDevelopment`, `IsProduction`, `EnvironmentName` |

**Environment files:**
- Development: `.env.development` (committed to repo)
- Production: `.env.production` (not in repo, set via deployment)

**Why static access instead of DI?**
- Configuration is immutable after startup
- Needed in static methods, extension methods, and places without DI
- Avoids `IOptions<T>` boilerplate throughout the codebase
- Validated once at startup with fail-fast behavior

### Service Dependencies

**CRITICAL:** Services MUST NOT depend on other services. This prevents circular dependencies.

```csharp
// ❌ WRONG - Service depending on other services
public class InvitationService : IInvitationService {
    private readonly ISessionService _sessionService;      // BAD!
    private readonly IPasswordService _passwordService;    // BAD!

    public InvitationService(
        MainApiDbContext dbContext,
        ISessionService sessionService,
        IPasswordService passwordService
    ) { }
}

// ✅ CORRECT - Services only depend on DbContext and infrastructure
public class InvitationService : IInvitationService {
    private readonly MainApiDbContext _dbContext;
    private readonly ILogger<InvitationService> _logger;

    public InvitationService(
        MainApiDbContext dbContext,
        ILogger<InvitationService> logger
    ) { }

    // Service methods do ONE thing, return data
    public async Task<User> CreateUserFromInvitationAsync(
        Invitation invitation,
        string firstName,
        string lastName,
        string passwordHash  // Already hashed by handler!
    ) {
        var user = new User {
            Email = invitation.Email,
            Password = passwordHash,  // No service dependency needed
            // ...
        };
        await _dbContext.User.AddAsync(user);
        await _dbContext.SaveChangesAsync();
        return user;
    }
}

// ✅ CORRECT - Handlers orchestrate multiple services
public static class AcceptInvitation {
    public static async Task<Results<...>> HandleAcceptInvitation(
        [FromServices] IInvitationService invitationService,
        [FromServices] ISessionService sessionService,
        [FromServices] IPasswordService passwordService,
        // ... other services
    ) {
        // Handler orchestrates - calls services in sequence
        var hash = passwordService.HashPassword(password);
        var user = await invitationService.CreateUserFromInvitationAsync(..., hash);
        var session = await sessionService.CreateSessionForUser(user);
        return TypedResults.Ok(...);
    }
}
```

**Architecture principle:** Handlers orchestrate, Services implement.

**Exception:** Infrastructure services (ILogger, IConfiguration) are OK since they don't create circular dependencies.

### Naming Conventions

**Use "Find" prefix for list/collection retrieval, NOT "List":**

```csharp
// ❌ WRONG
Task<List<Invitation>> ListStaffInvitationsAsync();
public static class ListStaffInvitations { }
public static async Task<...> HandleListStaffInvitations(...) { }

// ✅ CORRECT
Task<List<Invitation>> FindStaffInvitationsAsync();
public static class FindStaffInvitations { }
public static async Task<...> HandleFindStaffInvitations(...) { }
```

**Naming patterns:**
- Get single item: `GetUserById`, `HandleGetUserById`
- Get list/collection: `FindUsers`, `HandleFindUsers`
- Create: `CreateUser`, `HandleCreateUser`
- Update: `UpdateUser`, `HandleUpdateUser`
- Delete: `DeleteUser`, `HandleDeleteUser`
- Special actions: Use the verb (e.g., `RevokeInvitation`)

### API Response Pattern

**CRITICAL:** All error responses MUST use RFC 7807 ProblemDetails via `TypedProblems`.

**Rules:**
1. **Success WITH data**: Return data directly using `TypedResults.Ok(data)`
2. **Success WITHOUT data**: Return a message using `TypedResults.Ok(new { Message = "..." })`
3. **All error responses**: MUST use `TypedProblems.*` methods for RFC 7807 compliance and automatic OpenAPI documentation

```csharp
// ✅ Success WITH data - return data directly
public static async Task<Results<
    Ok<User>,
    AppNotFoundHttpResult
>> HandleGetUser(...) {
    var user = await userService.GetUserAsync(id);

    if (user is null) {
        return TypedProblems.NotFound("User not found", ResponseKeys.NotFound);
    }

    return TypedResults.Ok(user);  // Data returned directly
}

// ✅ All error responses use TypedProblems for automatic OpenAPI documentation
public static async Task<Results<
    Ok<User>,
    AppBadRequestHttpResult,
    AppForbiddenHttpResult
>> HandleUpdateUser(...) {
    if (!hasPermission) {
        return TypedProblems.Forbidden(
            "User does not have the necessary permissions",
            ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
        );
    }

    var updatedUser = await userService.UpdateUserAsync(user);
    return TypedResults.Ok(updatedUser);
}

// ✅ Available TypedProblems methods (all auto-document in OpenAPI):
// TypedProblems.BadRequest(detail, translationKey)        -> 400 (generic bad request)
// TypedProblems.Unauthorized(detail, translationKey)      -> 401
// TypedProblems.Forbidden(detail, translationKey)         -> 403
// TypedProblems.NotFound(detail, translationKey)          -> 404
// TypedProblems.InternalServerError(detail, translationKey) -> 500
// TypedProblems.ValidationProblem(detail, translationKey, errors) -> 422 (validation errors)
```

**HTTP Status Code Distinction (400 vs 422):**
- **400 Bad Request** — Generic bad requests (invalid credentials, user already exists, invalid token, etc.)
  - Uses `AppProblemDetails` schema
  - Created via `TypedProblems.BadRequest(...)`
- **422 Unprocessable Entity** — Field-level validation errors from FluentValidation
  - Uses `ValidationProblemDetails` schema (includes `errors` dictionary)
  - Created via `TypedProblems.ValidationProblem(...)` or automatically by validation filters

**Note on framework/binding errors:**
- Missing required query/body parameters can still produce a **400** (e.g., request body missing / required query parameter missing).
- These are normalized by `UseCustomExceptionHandler()` to `AppProblemDetails` (`application/problem+json`), so endpoints may legitimately document both `400` (generic/binding) and `422` (validation).
- `builder.Services.AddProblemDetails()` is registered (see `apps/api/Src/Lib/ServiceRegistration.cs`) for framework integration, but endpoints still return ProblemDetails explicitly via `TypedProblems.*`.

```csharp
// 400 - Generic bad request (e.g., invalid credentials)
return TypedProblems.BadRequest("Invalid email or password", ResponseKeys.InvalidCredentials);

// 422 - Validation errors (automatically returned by .WithReqBodyValidation<T>())
// Response includes field-level errors: { "errors": { "email": ["Email is required"] } }
```

**Why TypedProblems?**
- Returns RFC 7807 `application/problem+json` responses
- Includes `translationKey` for frontend i18n
- Typed result classes implement `IEndpointMetadataProvider` for automatic OpenAPI documentation
- No manual `.ProducesApiResponses()` needed - status codes are inferred from return type

**❌ NEVER use:**
- `TypedResults.Forbid()` (empty body, no translation key)
- `TypedResults.Unauthorized()` (empty body, no translation key)
- `TypedResults.Json(..., statusCode: 4xx)` for errors (breaks OpenAPI inference)

### String Comparison

**NEVER use `.ToLowerInvariant()` with `==` for case-insensitive comparison:**

```csharp
// ❌ WRONG - Creates temporary strings
if (email.ToLowerInvariant() == other.ToLowerInvariant())

// ✅ CORRECT - No temporary strings
if (email.Equals(other, StringComparison.OrdinalIgnoreCase))

// ✅ CORRECT - For Contains, StartsWith, EndsWith
if (email.Contains("@example.com", StringComparison.OrdinalIgnoreCase))
if (path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
```

**For database queries:** Store emails in lowercase, compare directly:

```csharp
// ✅ CORRECT - Normalize once for storage
var normalizedEmail = email.ToLowerInvariant();
var user = await (
    from u in _dbContext.User
    where u.Email == normalizedEmail  // Direct comparison
    select u
).FirstOrDefaultAsync(cancellationToken);
```

### OpenAPI Documentation

**CRITICAL:** Use `TypedProblems.*` methods for automatic OpenAPI documentation.

```csharp
// Handler return type includes typed results - OpenAPI is auto-documented!
public static async Task<Results<
    Ok<Response>,
    AppBadRequestHttpResult,     // Auto-documented as 400 with AppProblemDetails
    AppForbiddenHttpResult       // Auto-documented as 403 with AppProblemDetails
>> HandleAction(...) {
    if (!authorized) {
        return TypedProblems.Forbidden("Forbidden", ResponseKeys.Forbidden);
    }
    // ...
}

// Endpoint registration - no manual status code documentation needed!
group.MapPost("/", Handler.HandleAction)
    .WithReqBodyValidation<CreateBody>();
    // ✅ 200 auto-documented by Ok<Response>
    // ✅ 400 auto-documented by AppBadRequestHttpResult (generic bad request)
    // ✅ 403 auto-documented by AppForbiddenHttpResult
    // ✅ 422 auto-documented by WithReqBodyValidation (validation errors)
```

**How automatic documentation works:**
- Typed result classes (`AppForbiddenHttpResult`, `AppUnauthorizedHttpResult`, etc.) implement `IEndpointMetadataProvider`
- Filter extension methods (`.WithSessionAuthentication()`, `.WithStaffAuthorization()`, etc.) add their possible error responses automatically
- No manual `.ProducesApiResponses()` calls needed

**Why:** TypeScript API client is auto-generated from OpenAPI spec. Typed results ensure accurate documentation without manual maintenance.

### 500 Internal Server Error Documentation

**CRITICAL:** The global exception handler can return 500 for ANY endpoint. How 500 is documented depends on the endpoint type.

**Authenticated endpoints (auto-documented):**
Auth filter extension methods automatically add 500 to OpenAPI documentation:
- `.WithSessionAuthentication()` → adds 401, 500
- `.WithStaffAuthorization()` → adds 403, 500
- `.WithTenantAuthorization()` → adds 401, 403, 404, 500

```csharp
// ✅ 500 is auto-documented via auth filter
group.MapGet("/user", GetUser.HandleGetUser)
    .WithSessionAuthentication();  // Adds 401, 500 automatically
```

**Anonymous endpoints (manual documentation required):**
Endpoints without auth filters do NOT automatically document 500, even though the global exception handler can still return it. You MUST add `.ProducesAppProblem(StatusCodes.Status500InternalServerError)` manually.

```csharp
// ❌ WRONG - Anonymous endpoint missing 500 documentation
group.MapPost("/login", Login.HandleLogin)
    .WithReqBodyValidation<LoginBody>();
    // Global exception handler can return 500, but it's not documented!

// ✅ CORRECT - Manually document 500 for anonymous endpoints
group.MapPost("/login", Login.HandleLogin)
    .WithReqBodyValidation<LoginBody>()
    .ProducesAppProblem(StatusCodes.Status500InternalServerError);
```

**Rule:** When creating anonymous endpoints (no auth filter), always add:
```csharp
.ProducesAppProblem(StatusCodes.Status500InternalServerError)
```

**Anonymous endpoints requiring manual 500 documentation:**
- Login/Register endpoints (`/auth/login`, `/auth/register`)
- Password reset flow (`/auth/reset-password`, `/auth/check-reset-password-token`)
- Email verification (`/auth/verify-email-request`, `/auth/verification-link`, `/auth/check-email-verification-token`)
- Public invitation endpoints (`/invitations/{token}/details`, `/invitations/{token}/accept`, `/invitations/check`)
- Any future public/anonymous endpoints

### Code Formatting

**Always use braces on `if`/`else`/`for`/`foreach`/`while` blocks:**

```csharp
// ❌ WRONG - Bracketless if body
if (element is null)
    return true;
if (!ok) return false;

// ✅ CORRECT - Always wrap in braces
if (element is null) {
    return true;
}
if (!ok) {
    return false;
}
```

Single-statement bodies are not exempt. This prevents subtle bugs when adding lines later, and makes control flow unambiguous during code review.

**Maximum line length: 100 characters**

```csharp
// ❌ WRONG - Line too long
public static async Task<Results<Ok<Response>, AppBadRequestHttpResult, AppForbiddenHttpResult>> HandleAction([FromServices] IAuthContext authContext, [FromServices] IService service, [FromBody] CreateBody request, CancellationToken cancellationToken = default) {

// ✅ CORRECT - Break into multiple lines
public static async Task<Results<
    Ok<Response>,
    AppBadRequestHttpResult,
    AppForbiddenHttpResult
>> HandleAction(
    [FromServices] IAuthContext authContext,
    [FromServices] IService service,
    [FromBody] CreateBody request,
    CancellationToken cancellationToken = default
) {
    // Implementation
}
```

### Enum Parsing on Entities

When an entity has an associated enum (e.g., `NoticeSeverity`, `UserStatus`, `AccountLevel`), add a `Parse{EnumName}(string)` static method on the entity class. Handlers must use these methods instead of inline switch expressions or `Enum.Parse`.

```csharp
// ❌ WRONG - Inline switch expression in handler
var severity = severityStr switch {
    "info" => NoticeSeverity.Info,
    "warning" => NoticeSeverity.Warning,
    "critical" => NoticeSeverity.Critical,
    _ => NoticeSeverity.Info
};

// ✅ CORRECT - Static parse method on entity
// In entity file:
public static NoticeSeverity? ParseSeverity(
    string severity
) {
    var isInfo = string.Compare(
        severity, "info",
        StringComparison.OrdinalIgnoreCase
    ) == 0;
    if (isInfo) {
        return NoticeSeverity.Info;
    }
    // ... other cases
    return null;
}

// In handler:
var severity = SystemNotice.ParseSeverity(severityStr)
    ?? throw new InvalidOperationException(
        $"Severity parser rejected validated value '{severityStr}'."
    );
```

**Why:** Centralizes parsing logic, ensures case-insensitive comparison using `string.Compare` (no `.ToLowerInvariant()` allocation), and keeps entity-related logic on the entity.

### Prefer `if` Blocks Over `??` Throw for Guard Clauses

For multi-line guard checks (e.g., auth context guards with descriptive messages), prefer explicit `if` blocks. Both patterns are idiomatic C#; use whichever is more readable for the specific case.

```csharp
// ✅ PREFERRED for multi-line guards - Clear guard clause
var account = authContext.AccountStaff;
if (account is null) {
    throw new InvalidOperationException(
        "Staff account not found in auth context. "
        + "Ensure the endpoint has "
        + ".WithPermission() middleware."
    );
}

// ✅ ACCEPTABLE for short, single-line guards
var account = authContext.AccountStaff
    ?? throw new InvalidOperationException(
        "Staff account not found"
    );
```

### Body DTO Getter Methods

Request body DTOs must expose `Get{PropertyName}()` methods that use `JsonElementExtensions` to extract typed values. Never extract values from `JsonElement` directly in handler methods.

```csharp
// ✅ CORRECT - Getter methods on body DTO
public record CreateSystemNoticeBody {
    public required JsonElement Severity { get; init; }
    public required JsonElement Title { get; init; }
    public JsonElement? ExpiresAt { get; init; }

    public string GetSeverity() =>
        Severity.GetValueAsString();

    public string GetTitle() =>
        Title.GetValueAsString();

    public DateTime? GetExpiresAt() =>
        ExpiresAt.GetValueAsDateTimeOrNull();
}

// In handler - clean extraction:
var severityStr = body.GetSeverity();
var title = body.GetTitle();
var expiresAt = body.GetExpiresAt();

// ❌ WRONG - Inline extraction in handler
var severityStr = body.Severity
    .GetValueAsString().ToLowerInvariant();
var title = body.Title.GetValueAsString();
DateTime? expiresAt = null;
if (body.ExpiresAt is not null
    && body.ExpiresAt.Value.ValueKind
        == JsonValueKind.String) {
    expiresAt = DateTime.Parse(
        body.ExpiresAt.Value.GetString()!
    ).ToUniversalTime();
}
```

**Why:** Keeps handlers focused on orchestration. Extraction logic is testable, reusable, and consistent across handlers that share the same body DTO.

### Guard Clause in Staff Handlers

When a handler behind `.WithPermission()` needs `authContext.AccountStaff`, use a guard `if` block that throws `InvalidOperationException` (not `TypedProblems.Forbidden()`). This is a developer safety net — the middleware guarantees the account exists.

```csharp
// ✅ CORRECT - Developer safety net
var account = authContext.AccountStaff;
if (account is null) {
    throw new InvalidOperationException(
        "Staff account not found in auth context. "
        + "Ensure the endpoint has "
        + ".WithPermission() middleware."
    );
}

// ❌ WRONG - Returns HTTP error for a developer mistake
if (authContext.AccountStaff is null) {
    return TypedProblems.Forbidden(
        "Not authorized",
        ResponseKeys.Forbidden
    );
}
```

### DTO Placement: Service vs Handler

Service input/output DTOs (return types, result discriminated unions) belong in the service file. HTTP request/response DTOs and validators belong in the handler file. When a type is used as both service output and HTTP response, prefer keeping one definition in the service file over duplicating.

```
Service file:
  - FindSystemNoticesResult (discriminated union)
  - SystemNoticeListItem (used by service and handler)
  - ActiveSystemNotice (used by service and handler)

Handler file:
  - CreateSystemNoticeBody (request DTO)
  - SystemNoticeCreated (response DTO unique to this handler)
  - CreateSystemNoticeBodyValidator
```

### PatchField\<T\> for Nullable PATCH Fields

> Full guide with examples, decision tree, anti-patterns, and validator patterns: [`docs/guides/patchfield-pattern.md`](docs/guides/patchfield-pattern.md)

**CRITICAL:** `PatchField<T>` (`apps/api/Src/Lib/PatchField.cs`) is the **mandatory** way to represent three-state nullable fields in PATCH/update endpoints.

**Checklist:**

1. **Use when:** Update/PATCH endpoint + nullable entity field + client can clear it
2. **DTO property:** Non-nullable `JsonElement` (NOT `JsonElement?` — nullable cannot distinguish omitted from explicit null)
3. **Getter method:** `ValueKind` switch → `Undefined` = `Absent()`, `Null` = `Set(null)`, `String` = `Set(parsed)`, `_` = throw
4. **Args record:** `PatchField<T?>` field in the service args record (NOT `DateTime?` + `bool clearX`)
5. **Service impl:** `if (args.Field.IsPresent) { entity.Field = args.Field.Value; }`
6. **Safety:** `.Value` throws when absent — always check `IsPresent`, use `TryGetValue`, or use `Match`
7. **Never:** Use `JsonElement?` for clearable fields, use `PatchField` for required fields, access `.Value` without `IsPresent` check

**Quick reference:**

```csharp
// DTO (handler file) — clearable field uses non-nullable JsonElement
public JsonElement ExpiresAt { get; init; }

public PatchField<DateTime?> GetExpiresAt() =>
    ExpiresAt.ValueKind switch {
        JsonValueKind.Undefined => PatchField<DateTime?>.Absent(),
        JsonValueKind.Null => PatchField<DateTime?>.Set(null),
        JsonValueKind.String => PatchField<DateTime?>.Set(ExpiresAt.GetValueAsDateTime()),
        _ => throw new InvalidOperationException("ExpiresAt must be string, null, or omitted"),
    };
```

## Test Conventions

### Test File Naming

- Spec files use `*.Spec.cs` suffix (not `*.IntegrationTests.cs`)
- Class name = `{Feature}Spec` (e.g., `CreateSystemNoticeSpec`, `PasswordLoginSpec`)
- Co-located next to the handler/source they test
- Unit test specs co-locate next to their source file (e.g., `DateUtils.Spec.cs` next to `DateUtils.cs`)

### Test Method Naming (BDD)

- Use `ItShould{Expected}When{Scenario}` format
- Always start with `ItShould`
- No underscores in method names
- Examples: `ItShouldReturnOkWithValidData`, `ItShouldReturnUnauthorizedWithoutAuth`, `ItShouldReturn403ForNonMember`

### Testing/ Folder Structure

Test infrastructure lives in `Src/Lib/Testing/` organized by purpose:

- `Testing/Fixtures/` — test environment setup (`ApiFixture`, `MainApiFactory`, `PostgresContainerFixture`, `DatabaseTemplateManager`, `TestEnvironment`, `TestConstants`)
- `Testing/Helpers/` — test utility methods (`TestAuthClient`, `TenantTestHelper`, `SystemNoticeTestHelper`, `HttpRequestMessageExtensions`)
- `Testing/Fakes/` — test doubles (`FakeEmailSender`)
- NO test cases in Testing/ — specs live co-located with source

### Test Using Statements

Spec files reference test infrastructure via sub-namespaces:

```csharp
using MainApi.Src.Lib.Testing.Fixtures;  // ApiFixture, TestConstants
using MainApi.Src.Lib.Testing.Helpers;    // TestAuthClient, TenantTestHelper
using MainApi.Src.Lib.Testing.Fakes;      // FakeEmailSender (rare)
```

## Common Workflows

### Adding a New Feature

**Backend:**
1. Create module directory: `apps/api/Src/Modules/[Scope]/[Module]/`
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

### Updating API Contract

**After changing request/response types or endpoints:**

```bash
# 1. Build API to generate updated OpenAPI spec
make build-api

# 2. Generate updated TypeScript client
make generate-client

# 3. Update frontend code to use new types
```

The TypeScript client is auto-generated - never modify files in `packages/js-client/` manually.

### Adding Database Entities

1. Create entity class in `apps/api/Src/Modules/[Scope]/[Module]/[Entity].cs`
2. Implement appropriate tenant interface: `ITenantEntity`, `IOptionalTenantEntity`, or `INoTenantEntity`
3. Inherit from `BaseAttributes` for automatic audit tracking
4. Add `DbSet<[Entity]>` to `MainApiDbContext`
5. Configure entity in `OnModelCreating` if needed
6. Create migration: `make db-add NAME=Add[Entity]Table`
7. Review and apply: `make db-migrate`

### Handling Permissions

**Adding a new permission:**
1. Add permission to database seed in `apps/api/Src/Data/Seeder.cs`
2. Use `PermissionFilter` on endpoints that require it
3. Check permissions in handlers via `AuthContext`

**Example:**
```csharp
public static async Task<Results<Ok<Response>, AppForbiddenHttpResult>> Handle(
    [FromServices] IAuthContext auth,
    // ... other params
)
{
    if (!auth.HasPermission("staff_member.update"))
        return TypedProblems.Forbidden("Forbidden", ResponseKeys.Forbidden);

    // ... handler logic
}
```

## Important Conventions

### Route Naming

- Backend routes use kebab-case: `/staff/staff-users`
- Route constants defined in `apps/api/Src/Lib/RoutePath.cs`
- Frontend route constants in `packages/shared/lib/constants.ts`

### API Response Format

Success responses:
```csharp
// For message-only successes (optional, some endpoints return Ok<T> with domain data instead)
public record ApiResponse {
    public string Message { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
}
```

Error responses:
```jsonc
// AppProblemDetails (400/401/403/404/500)
{
  "type": "https://httpstatuses.com/403",
  "title": "Forbidden",
  "status": 403,
  "detail": "User does not have permissions",
  "translationKey": "forbidden",
  "traceId": "00-...-..."
}
```

```jsonc
// ValidationProblemDetails (422)
{
  "type": "https://httpstatuses.com/422",
  "title": "Validation Failed",
  "status": 422,
  "detail": "Request body validation failed",
  "translationKey": "request-body-validation-failed",
  "errors": {
    "email": ["Email is required"]
  }
}
```

### Validation

- Backend: FluentValidation validators applied via filters
- Frontend: Zod schemas with React Hook Form
- Shared validation logic in `packages/shared/lib/zod/`

### Error Handling

- Backend: Structured logging with Serilog, contextual error information
- Frontend: React Router error boundaries, custom error pages (400, 403, 404, 500)
- Always log before rethrowing exceptions
- Frontend/Node app code: Prefer `logger` from `@/shared/lib/logger/iso-logger` over the global `console` object
  - Rationale: consistent formatting + environment-safe (browser/SSR) behavior
  - If a request/loader context provides a logger (e.g. React Router `args.context.logger` / `getServerLoader`), prefer `context.logger` over importing the global singleton so logs can be request-scoped
  - Avoid committing `console.*` in React components, hooks, libs, SSR entrypoints, etc.
  - **Exceptions:** scripts/build tooling/config where importing the iso-logger isn’t feasible (e.g. `scripts/**`, `apps/*/_vite/**`, `*.config.*`, `*.mjs`, `server.js`), or intentionally user-facing CLI output

### Frontend API Error Handling

**CRITICAL:** The frontend uses a centralized error handling system. Understanding this is essential for writing correct mutation/query code.

**Architecture:**
- All API errors are normalized into `ApiFailure` discriminated union via `toApiFailure()`
- Global handlers in `MutationCache`/`QueryCache` handle toasts and auth errors
- Forms use `withFormValidation()` helper for field-level error mapping

**Default behavior (no code needed):**
```typescript
// ✅ Errors auto-toast - no onError handler required
const { mutate } = useCreateStaffUser();
mutate(data);
```

**Form validation pattern:**
```typescript
import { withFormValidation } from '@/front/lib/api-failure';

// ✅ Field errors mapped to form, other errors still toast
const { mutate } = useCreateStaffUser(
  withFormValidation(form.setError, {
    meta: { showSuccessToast: true },
    onSuccess: () => navigate('/staff'),
  })
);
```

**Opt-out for custom handling:**
```typescript
// ✅ Full control - global handler skipped
const { mutate } = useMyMutation({
  meta: { skipGlobalErrorHandler: true },
  onError: (error) => {
    const failure = toApiFailure(error);
    // Custom handling
  },
});
```

**ApiFailure kinds:**
| Kind | HTTP Status | Default Behavior |
|------|-------------|------------------|
| `validation` | 422 | Toast (unless form handles) |
| `problem` | 400/401/403/404/500 | Toast (401 → logout) |
| `network` | - | Toast "Network error" |
| `abort` | - | Silent |
| `unknown` | - | Toast + log |

**Auth error handling:**
- **401**: Global hook triggers `logout()` immediately
- **403**: Error boundary shows `View403` (no logout - user is authenticated but forbidden)

**Mutation meta options:**
- `showSuccessToast: true` - Toast success message from API response
- `successMessage: "key"` - Override with explicit message
- `validationHandledByForm: true` - Suppress validation toast
- `skipGlobalErrorHandler: true` - Handle all errors locally
- `skipAuthErrorHandler: true` - Don't logout on 401 (rare)

**Reference:** See `docs/guides/frontend-error-handling.md` for complete guide.

## Development Environment

**Access points when running locally:**
- Frontend: http://localhost:5050
- API: http://localhost:5000
- API Documentation (Scalar): http://localhost:5000/scalar/v1
- PostgreSQL: localhost:5454

**Environment variables:**
- Development: `.env.development` (committed)
- Production: `.env.production` (not in repo)
- Validated at startup via `AppEnvironment.Initialize()`

## Deployment

The project uses Dokploy on Hostinger VPS:
1. Code pushed to GitHub
2. Docker images built and pushed to GitHub Container Registry
3. Dokploy pulls images and deploys
4. Traefik reverse proxy handles SSL and routing

Configuration in `dokploy.yml`.

## OpenAPI Documentation

Interactive API documentation available at `/scalar/v1` when API is running. This is the source of truth for the API contract and drives TypeScript client generation.

## OpenAPI & Kiota Client Generation Safeguards

**CRITICAL:** The TypeScript API client is auto-generated from the .NET OpenAPI spec using Microsoft Kiota. Several .NET patterns directly affect TypeScript type generation.

### JsonElement Nullability and Kiota Types

**The nullability of `JsonElement` properties directly affects generated TypeScript types:**

```csharp
// NON-nullable JsonElement → generates UntypedNode in TypeScript
public class PasswordLoginBody {
    public JsonElement Email { get; set; }     // → email?: UntypedNode | null
    public JsonElement Password { get; set; }  // → password?: UntypedNode | null
}

// NULLABLE JsonElement? → generates complex union type requiring type casts
public record CreateStaffProfileBody {
    public JsonElement? Name { get; init; }    // → name?: CreateStaffProfileBody_nameMember1 | JsonElement | null
}
```

**Rule:** For REQUIRED fields, use non-nullable `JsonElement` (not `JsonElement?`). This generates cleaner `UntypedNode` types in TypeScript without requiring type assertions.

```csharp
// ✅ CORRECT - Required field uses non-nullable JsonElement
public record CreateUserBody {
    public JsonElement Email { get; init; }     // Required - use non-nullable
    public JsonElement Password { get; init; }  // Required - use non-nullable
    public JsonElement? Bio { get; init; }      // Optional - nullable is fine
}

// ❌ WRONG - Required field uses nullable JsonElement?
public record CreateUserBody {
    public JsonElement? Email { get; init; }    // Generates complex union type!
}
```

### Generic Types and XML Comments (.NET 10 Bug)

**CRITICAL:** .NET 10's OpenAPI source generator has a bug that causes duplicate key errors when processing XML comments on generic types.

```csharp
// ❌ WRONG - XML comments on generic type cause OpenAPI generation failure
/// <summary>
/// Paginated result wrapper.
/// </summary>
public class CursorPaginatedResult<T> {
    /// <summary>
    /// The data items.
    /// </summary>
    public List<T> Data { get; set; } = [];
}

// ✅ CORRECT - Remove XML comments from generic types
// Note: XML comments removed to work around .NET 10 OpenAPI source generator bug
// See: https://github.com/dotnet/aspnetcore/issues/63233
#pragma warning disable CS1591
public class CursorPaginatedResult<T> {
    public List<T> Data { get; set; } = [];
    public string? NextCursor { get; set; } = null;
}
#pragma warning restore CS1591
```

**Rule:** Never add XML documentation comments to generic types (`<T>`) in the API project. The .NET 10 OpenAPI source generator will fail with "duplicate key" errors.

### Integer Type Schema Transformer

**Problem:** .NET 10 OpenAPI generation can produce `["integer", "string"]` union types instead of just `"integer"` for `int` properties. This causes Kiota to generate `UntypedNode` types instead of proper `number` types.

**Solution:** A schema transformer in `ServiceRegistration.cs` fixes this at OpenAPI generation time:

```csharp
// apps/api/Src/Lib/ServiceRegistration.cs
builder.Services.AddOpenApi(options => {
    options.AddSchemaTransformer((schema, context, cancellationToken) => {
        if (schema.Type.HasValue) {
            var schemaType = schema.Type.Value;
            // Fix integer+string unions → just integer
            if (schemaType.HasFlag(JsonSchemaType.Integer) && schemaType.HasFlag(JsonSchemaType.String)) {
                schema.Type = JsonSchemaType.Integer;
            }
            // Fix number+string unions → just number
            else if (schemaType.HasFlag(JsonSchemaType.Number) && schemaType.HasFlag(JsonSchemaType.String)) {
                schema.Type = JsonSchemaType.Number;
            }
        }
        return Task.CompletedTask;
    });
});
```

**Rule:** If you see TypeScript types like `count?: number | UntypedNode` in response DTOs, check that the schema transformer is present and that `OpenApiGenerateDocuments` is `true` in `MainApi.csproj`.

### Client Regeneration Workflow

**After ANY changes to .NET DTOs or endpoints:**

```bash
# 1. Build API to regenerate OpenAPI spec (apps/api/openapi/MainApi.json)
make build-api

# 2. Update TypeScript client from new OpenAPI spec
make update-client

# 3. Run TypeScript check to verify no type errors
make tsc-front
```

**Common issues after regeneration:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| `UntypedNode` in response types | Integer schema is `["integer", "string"]` | Verify schema transformer is present |
| Complex union types in request bodies | Using `JsonElement?` (nullable) | Use `JsonElement` (non-nullable) for required fields |
| Build fails with "duplicate key" | XML comments on generic type | Remove XML comments from generic types |
| Type casts needed (`as typeof body.name`) | Nullable `JsonElement?` property | Use non-nullable `JsonElement` or accept the cast |

### TypeScript Patterns for Kiota Client

**For request bodies with UntypedNode fields:**

```typescript
import { createUntypedString, createUntypedArray } from '@microsoft/kiota-abstractions';

// ✅ CORRECT - Use Kiota factory functions
const body: CreateUserBody = {
    email: createUntypedString(data.email),
    password: createUntypedString(data.password),
};

// ❌ WRONG - Old pattern that no longer works
const body: CreateUserBody = {
    email: { getValue() { return data.email; } },  // May not match expected type
};
```

**For response data with potential UntypedNode unions:**

```typescript
import { getUntypedNumber } from '@/front/lib/js-client/kiota-utils';

// ✅ CORRECT - Use utility to safely extract number
const count = getUntypedNumber(response.count, 0);

// ❌ WRONG - Assumes response.count is always number
const count = response.count;  // Could be number | UntypedNode
```

**Utility functions in `apps/front/app/lib/js-client/kiota-utils.ts`:**
- `getUntypedNumber(value, defaultValue)` - Safely extract number from `number | UntypedNode`
- `getUntypedString(value, defaultValue)` - Safely extract string from `string | UntypedNode`
- `getUntypedArray(value)` - Safely extract array from `T[] | UntypedNode`
- `getUntypedValue(value)` - Generic extraction for any type

## Documentation Organization

**CRITICAL:** When generating documentation files during chat sessions (implementation plans, refactoring guides, roadmaps, reviews, etc.), you MUST organize them intelligently in the `docs/` directory to make them easy to find later.

**Guidelines:**

- **NEVER place generated documentation files at the repository root**
- **Organize by relevance and type** - Create or use subdirectories that make logical sense for the document type
- **Use existing subdirectories when appropriate** - Check `docs/` for existing folders before creating new ones
- **Create new subdirectories as needed** - You have full freedom to create new organizational structures that improve searchability
- **Use descriptive folder names** - Use kebab-case names that clearly indicate the content type (e.g., `implementation-plans`, `architecture-decisions`, `api-designs`, `database-schemas`, `performance-analysis`)

**Existing subdirectories** (as examples, not prescriptive):
- `docs/implementation-plans/` - Detailed plans for implementing features
- `docs/refactoring-guides/` - Guides for refactoring existing code
- `docs/roadmaps/` - Project roadmaps and milestone planning
- `docs/reviews/` - Code reviews, architecture reviews, design reviews
- `docs/misc/` - Miscellaneous documentation

**Principle:** Organize intelligently so that developers can easily find relevant documentation by browsing the `docs/` folder structure. Think about how someone would search for this document later.
