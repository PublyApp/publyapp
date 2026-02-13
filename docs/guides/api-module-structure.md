# API Module Structure Rules

> Extracted from `AGENTS.md` — this is the canonical reference for Vertical Slice Architecture and API folder/module structure rules.

## Module Organization

**CRITICAL:** The API is domain-first. Route scope is expressed via endpoint groups and handler folders — not via alternate module naming schemes like `UsersAsStaff`.

Each `apps/api/Src/Modules/<Domain>/` module is a complete vertical slice containing:
- **Entities** (`Entities/*.cs`) — database models for the domain
- **Junction entities** — live with their primary entity's domain
- **Services** (`Services/*.cs`) — domain business logic and orchestration
- **Handlers** (`Handlers/<Scope>/*.cs`) — HTTP request handlers
- **Endpoints** (`Endpoints/*.cs`) — route mappings per scope (anonymous/staff/tenant)
- **Permissions** (`Permissions/*.cs`) — permission constants/objects for seeding + route enforcement

## Module Examples

- `Modules/Auth/` — session + auth flows
- `Modules/Users/` — users + accounts (including staff-user management)
- `Modules/Invitations/` — invitations and their profiles
- `Infrastructure/Messaging/Email/` — technical capability used by multiple domains

## Junction Entity Placement Rule

**IMPORTANT:** Junction entities (many-to-many relationship tables) should live with their **primary entity**.

Examples:
- `UserAccountProfile` → lives in `Users/` (primary: UserAccount)
- `ProfilePermission` → lives in `Profiles/` (primary: Profile)
- `InvitationProfile` → lives in `Invitations/` (primary: Invitation)

## Infrastructure Services Placement Rules

**Infrastructure folder** (`Infrastructure/`): Technical/architectural services that provide capabilities TO domain modules
- Example: `EmailService` → `Infrastructure/Messaging/Email/` (sends emails FOR auth, invitations, etc.)
- Example: `SmsService` → `Infrastructure/Messaging/Sms/` (sends SMS FOR 2FA, notifications, etc.)
- Example: `FileStorageService` → `Infrastructure/Storage/` (stores files FOR users, products, etc.)

**Domain modules**: Business logic services specific to that domain
- Example: `PasswordService` → `Auth/` (password hashing/validation)
- Example: `UserService` → `Users/` (user business logic)
- Example: `InvitationService` → `Invitations/` (invitation business logic)

**Pure utilities**: Stateless helpers without dependencies → `Lib/`

## Route Scopes (Staff/Tenant/Anonymous)

- Scope is determined by the route group in `apps/api/Program.cs` (e.g. `/staff/*`, `/tenant/*`, `/auth/*`).
- Keep scope-specific code in `Handlers/<Scope>/` and `Endpoints/*For<Scope>.cs`.
- Prefer scope-specific handler names when it prevents confusion (e.g. `FindStaffProfiles` vs `FindTenantProfiles`). If a handler is truly shared across scopes, put it in a neutral location and keep the name generic.

## Where to Put New Code

- **Any new domain work** → `apps/api/Src/Modules/<Domain>/...` (domain-first)
- **Scope-specific endpoints/handlers** → `Endpoints/*ForStaff.cs` / `Handlers/Staff/*` (same domain)
- **New infrastructure service?** → Add to `Infrastructure/`
  - Email/SMS → `Infrastructure/Messaging/`
  - File storage → `Infrastructure/Storage/`
  - Caching → `Infrastructure/Caching/`
- **Pure stateless helper** → `apps/api/Src/Lib/`

## Architecture Docs Policy (Single Source of Truth)

**CRITICAL:** `AGENTS.md` and its referenced guide files under `docs/guides/` are the single source of truth for **Vertical Slice Architecture** and **API folder/module structure** rules.

- Other docs may describe feature-specific plans, but must not introduce competing folder structure rules.
- If another doc needs to mention architecture, it should link to the relevant `AGENTS.md` section or guide file instead of redefining conventions.

## Module Naming (Repo-Wide)

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

## Slice Boundaries (When to Split vs Share)

Split by **domain** first, then by **route scope** inside the domain (staff/tenant/anonymous).

Create **separate scope handlers/endpoints** when any of these change:
- Route scope / actor (Staff vs Tenant vs Project user)
- Authorization middleware / security boundary
- Route prefix (`/staff/*` vs `/tenant/*`)
- Business rules/workflows diverge meaningfully

Keep one implementation (and parameterize) when differences are only:
- Data attributes or filter parameters (e.g., `ProfileScope`, status/type/category enums)
- Same auth middleware, same route group, same business context

## Permission Enforcement Patterns

Prefer enforcing permissions at the **route level** (before database access).

- **Pattern 1 (Recommended): Scope in route + `.WithPermission()`**
  - Use when the scope can be derived from the route (e.g., `/staff/profiles/staff/{id}` vs `/staff/profiles/tenants/{tenantId}`).
  - Benefits: permission checked before DB query, clearer API design, avoids wasted queries.
- **Pattern 2 (Fallback): Dynamic permission check after loading entity**
  - Avoid if possible. Use only when scope cannot be determined from the route and you cannot change the route shape.
  - Cost: requires loading the entity first; wastes a DB query if unauthorized; permission is no longer encoded by the route.

## Vertical Slice Design Principles (Detailed)

This is the canonical reference (replaces the old `docs/vertical-slice-design-principles.md`).

### Separate actors, same domain (default)

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

### Share handlers when business rules match

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

### Permission Enforcement (More Detail)

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

### Decision Tree (Quick)

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
