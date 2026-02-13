# API Routes & Endpoint Path Design

> Extracted from `AGENTS.md` — canonical endpoint path structure for the PublyApp API.

## Two API Scopes

| Scope | Prefix | Auth | Tenant Context |
|-------|--------|------|----------------|
| **Staff API** | `/staff/...` | Staff session + authorization | Explicit via `{tenantId}` in path |
| **Tenant API** | `/...` (root) | Tenant session + authorization | Implicit from `X-Tenant-Id` header |
| **Anonymous** | `/auth/...`, `/invitations/...` | None | None |

## Staff API Structure (`/staff/*`)

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

## Tenant API Structure (`/` root)

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

## Anonymous Routes

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

## Design Principles

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

## Route Constants Location

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

## Handler & Endpoint Naming Convention

| Context | Handler Suffix | Endpoint File |
|---------|---------------|---------------|
| Staff managing staff resources | `*ForStaff` | `*EndpointsForStaff.cs` |
| Staff managing tenant resources | `*ForTenantAsStaff` | `*EndpointsForTenantAsStaff.cs` |
| Tenant self-service | `*ForTenant` | `*EndpointsForTenant.cs` |
| Anonymous/public | `*Anonymous` | `*EndpointsAnonymous.cs` |

## Adding a New Domain Slice

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
