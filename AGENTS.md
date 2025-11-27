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

### Running Single Tests

Currently no automated tests are implemented. When added, use:

```bash
# .NET tests (when implemented)
dotnet test apps/api/Tests/

# Frontend tests (when implemented)
cd apps/front && pnpm test
```

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

### Backend Architecture (Vertical Slice)

The backend follows **Vertical Slice Architecture** where each feature is self-contained:

```
Features/[Domain]/[Feature]/
├── [Feature]Service.cs           # Business logic
├── [Feature]Endpoints.cs         # API endpoint mappings
└── Handlers/
    ├── Create[Feature].cs        # POST handler
    ├── Get[Feature]ById.cs       # GET by ID handler
    ├── Find[Feature]s.cs         # GET list handler
    └── Update[Feature].cs        # PUT handler
```

**Key Patterns:**
- **CQRS-lite**: Request handlers pattern
- **Minimal APIs**: ASP.NET Core minimal API endpoints
- **FluentValidation**: Automatic validation via filters
- **Response Format**: All endpoints return `ApiResponse` with `Message` and `Data`

**Finding Backend Code:**
- Common features (auth, accounts, users): `apps/api/Src/Features/Common/`
- Staff-specific features: `apps/api/Src/Features/Staff/`
- Tenant-specific features: `apps/api/Src/Features/Tenant/`
- Shared utilities/middleware: `apps/api/Src/Lib/`

### Multi-Tenant Architecture

**Three tenant scopes:**
- `ITenantEntity`: Tenant-scoped entities (filtered by TenantId)
- `IOptionalTenantEntity`: Entities that may or may not belong to a tenant
- `INoTenantEntity`: Global entities (Staff, permissions)

**Automatic tenant isolation:**
- EF Core global query filters applied in DbContext
- `TenantContext` provides current tenant info (scoped service)
- Tenant ID from `X-Tenant-Id` header (injected via middleware)

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
- Session token from `X-Session-Token` header
- API client instances: `apiClient` (authenticated), `anonApiClient` (anonymous)

**Data Fetching Pattern (Route-Type Specific):**

**CRITICAL:** Data fetching strategy depends on route type:

1. **Marketing Pages** (`app/routes/marketing/**`) → SSR with React Router loaders/actions
2. **Auth Pages** (`app/routes/auth/**`) → SSR with React Router loaders/actions (hide API endpoints)
3. **Authed Pages** (`app/routes/authed/**`) → Client-only with TanStack Query (NO SSR)

```tsx
// ❌ WRONG - Server loader in authenticated dashboard page
// File: app/routes/authed/staff/members-page.tsx
export const loader = async ({ apiClient }) => {
  const data = await apiClient.staff.staffMembers.get();
  return { data };
};

// ✅ CORRECT - react-query-kit hooks for authenticated pages
// Step 1: Define hook in app/lib/react-query/features/staff/staff-member.hooks.ts
import { createQuery } from 'react-query-kit';
import { getQueryKey } from '../../query-utils';

const findStaffMemberQueryKey = getQueryKey<ApiClient>(
  (client) => client.staff.staffMembers.get,
);

export const useFindStaffMember = createQuery({
  queryKey: [findStaffMemberQueryKey] as const,
  fetcher: async (params: { page?: number }) => {
    const result = await clientManager.apiClient.staff.staffMembers.get({
      queryParameters: { page: params.page?.toString() },
    });
    if (_.isNil(result)) throw new Error(`[${findStaffMemberQueryKey}]: result is nil`);
    return result;
  },
});

// Step 2: Use hook in component
// File: app/routes/authed/staff/members-page.tsx
import { useFindStaffMember } from '@/front/lib/react-query/features/staff/staff-member.hooks';

function StaffMembersPage() {
  const { data, isLoading } = useFindStaffMember({ variables: { page: 1 } });
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

// ✅ CORRECT - Mutations in authed pages use react-query-kit
// Step 1: Define mutation hook
import { createMutation } from 'react-query-kit';

export const useCreateMember = createMutation({
  mutationKey: [createMemberMutationKey] as const,
  mutationFn: async (data: { email: string }) => {
    const result = await clientManager.apiClient.staff.members.post({
      email: { getValue() { return data.email; } },
    });
    if (_.isNil(result)) throw new Error('result is nil');
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
      queryKey: useFindStaffMember.getKey({ page: 1 }),
      queryFn: () => useFindStaffMember.fetcher({ page: 1 }),
    });

    return null;
  },
});

// ❌ WRONG - Don't export raw clientLoader
export async function clientLoader() { ... }
```

**Benefits:** `getClientLoader` provides initialized `apiClient`, `z` (Zod with i18n), and `locale` - just like `getServerLoader` on the server.

**Reference:** See `.cursor/rules/react-router-data-fetching.mdc` for complete patterns.

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
return TypedResults.BadRequest(new ApiResponse { Message = ValidationError });
```

### API Routes

**Backend route patterns:**
```
/auth/*           # Authentication (login, register, password reset)
/staff/*          # Staff-specific endpoints
/tenant/*         # Tenant-specific endpoints
```

Routes defined in `apps/api/Src/Lib/RoutePath.cs` and frontend in `packages/shared/lib/constants.ts`.

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

**Reference:** See `.cursor/rules/react-material-ui-components.mdc` for complete mapping guide and `.dump/main-template/src/sections/**/*.tsx` for real-world examples.

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

**Reference:** See `.cursor/rules/react-styling-mui.mdc` for complete Tailwind-to-sx conversion guide.

### Date Handling: Day.js

**CRITICAL:** This project uses Day.js for all date operations. Never use date-fns, Moment.js, or native Date methods for formatting.

**Pattern:**
```tsx
// ❌ WRONG - Using date-fns
import { formatDistanceToNow } from 'date-fns';
const timeAgo = formatDistanceToNow(new Date(date), { addSuffix: true });

// ✅ CORRECT - Using dayjs
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);
const timeAgo = dayjs(date).fromNow();
```

**Common operations:**
```tsx
// Formatting
dayjs(date).format('MMM DD, YYYY');         // Nov 08, 2024
dayjs(date).format('YYYY-MM-DD HH:mm:ss');  // 2024-11-08 15:30:00

// Relative time
dayjs(date).fromNow();                      // "2 hours ago"

// Manipulation
dayjs(date).add(7, 'day');                  // Add 7 days
dayjs(date).subtract(1, 'month');           // Subtract 1 month

// Comparison
dayjs(date1).isAfter(date2);                // Boolean
dayjs(date1).isBefore(date2);               // Boolean
```

**Reference:** See `.cursor/rules/react-date-handling.mdc` for complete Day.js guide and migration from date-fns.

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
import { useFindStaffMembers } from '@/front/lib/react-query/features/staff/staff-member.hooks';

function StaffMembersPage() {
  const { data, isLoading, isError, error } = useFindStaffMembers();

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
import { useFindStaffMembers } from '@/front/lib/react-query/features/staff/staff-member.hooks';

function StaffMembersPage() {
  const query = useFindStaffMembers();

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
// File: apps/api/Src/Features/Staff/Invitations/Handlers/CreateStaffInvitation.cs

using FluentValidation;
using System.Text.Json;

namespace MainApi.Src.Features.Staff.Invitations.Handlers;

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
    public static async Task<Results<Ok<InvitationCreated>, BadRequest<ApiResponse>, Forbidden<ApiResponse>>>
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

**Exception:** Infrastructure services (ILogger, IConfiguration, IOptions) are OK since they don't create circular dependencies.

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

**CRITICAL:** All responses MUST follow the `ApiResponse` pattern.

**Rules:**
1. **Success WITH data**: Return data directly using `TypedResults.Ok(data)`
2. **Success WITHOUT data**: Return `ApiResponse` using `TypedResults.Ok(new ApiResponse { ... })`
3. **All error responses**: MUST return `ApiResponse` with appropriate status code

```csharp
// ✅ Success WITH data - return data directly
public static async Task<Results<
    Ok<User>,
    NotFound<ApiResponse>
>> HandleGetUser(...) {
    var user = await userService.GetUserAsync(id);

    if (user is null) {
        return TypedResults.NotFound(
            ApiResponse.Create("User not found", ResponseKeys.NotFound)
        );
    }

    return TypedResults.Ok(user);  // Data returned directly
}

// ✅ Success WITHOUT data - return ApiResponse
public static async Task<Results<
    Ok<ApiResponse>,
    NotFound<ApiResponse>
>> HandleDeleteUser(...) {
    var success = await userService.DeleteUserAsync(id);

    if (!success) {
        return TypedResults.NotFound(
            ApiResponse.Create("User not found", ResponseKeys.NotFound)
        );
    }

    // No data to return, so return ApiResponse
    return TypedResults.Ok(
        ApiResponse.Create("User deleted successfully", ResponseKeys.UserDeleted)
    );
}

// ✅ For responses that don't support custom payload - use JsonHttpResult
public static async Task<Results<
    Ok<User>,
    BadRequest<ApiResponse>,
    JsonHttpResult  // For 403 since Forbid() doesn't support payload
>> HandleUpdateUser(...) {
    if (!hasPermission) {
        return TypedResults.Json(
            ApiResponse.Create(
                "User does not have the necessary permissions",
                ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
            ),
            statusCode: StatusCodes.Status403Forbidden
        );
    }

    var updatedUser = await userService.UpdateUserAsync(user);
    return TypedResults.Ok(updatedUser);
}
```

**When TypedResults doesn't support custom payloads** (like `.Forbid()`, `.Unauthorized()`):
Use `TypedResults.Json()` with explicit status code and `ApiResponse` payload.

**❌ NEVER use:**
- `TypedResults.Ok()` without payload
- `TypedResults.Forbid()` (use `TypedResults.Json(..., statusCode: 403)` instead)
- `TypedResults.Unauthorized()` (use `TypedResults.Json(..., statusCode: 401)` instead)

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

**CRITICAL:** Document ALL status codes the handler can return.

```csharp
// Handler returns these status codes
public static async Task<Results<
    Ok<Response>,
    BadRequest<ApiResponse>,
    Forbidden<ApiResponse>,       // Must document this!
    JsonHttpResult<ApiResponse>   // Must document custom status codes!
>> HandleAction(...) {
    if (!authorized) {
        return TypedResults.Json(
            ApiResponse.Create("Forbidden", ResponseKeys.Forbidden),
            statusCode: StatusCodes.Status403Forbidden  // Custom status code
        );
    }
}

// Endpoint MUST document ALL possible responses
group.MapPost("/", Handler.HandleAction)
    .WithReqBodyValidation<CreateBody>()
    .ProducesApiResponses(
        StatusCodes.Status500InternalServerError,  // Always include
        StatusCodes.Status403Forbidden             // From JsonHttpResult!
        // 400 auto-documented by WithReqBodyValidation
        // 200 auto-documented by Ok<Response>
    );
```

**Rule:** If handler uses `JsonHttpResult` → Must add status code to `ProducesApiResponses`.

**Why:** TypeScript API client is auto-generated from OpenAPI spec. Missing status codes = broken error handling in frontend.

### Code Formatting

**Maximum line length: 100 characters**

```csharp
// ❌ WRONG - Line too long
public static async Task<Results<Ok<Response>, BadRequest<ApiResponse>, Forbidden<ApiResponse>>> HandleAction([FromServices] IAuthContext authContext, [FromServices] IService service, [FromBody] CreateBody request, CancellationToken cancellationToken = default) {

// ✅ CORRECT - Break into multiple lines
public static async Task<Results<
    Ok<Response>,
    BadRequest<ApiResponse>,
    Forbidden<ApiResponse>
>> HandleAction(
    [FromServices] IAuthContext authContext,
    [FromServices] IService service,
    [FromBody] CreateBody request,
    CancellationToken cancellationToken = default
) {
    // Implementation
}
```

## Common Workflows

### Adding a New Feature

**Backend:**
1. Create feature directory: `apps/api/Src/Features/[Domain]/[Feature]/`
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

1. Create entity class in `apps/api/Src/Features/[Domain]/[Entity].cs`
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
public static async Task<Results<Ok<Response>, Forbidden>> Handle(
    [FromServices] IAuthContext auth,
    // ... other params
)
{
    if (!auth.HasPermission("staff_member.update"))
        return TypedResults.Forbid();

    // ... handler logic
}
```

## Important Conventions

### Route Naming

- Backend routes use kebab-case: `/staff/staff-members`
- Route constants defined in `apps/api/Src/Lib/RoutePath.cs`
- Frontend route constants in `packages/shared/lib/constants.ts`

### API Response Format

All endpoints return:
```csharp
public class ApiResponse {
    public string? Message { get; set; }  // i18n key for translation
    public object? Data { get; set; }      // Optional response data
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

## Development Environment

**Access points when running locally:**
- Frontend: http://localhost:5050
- API: http://localhost:5000
- API Documentation (Scalar): http://localhost:5000/scalar/v1
- PostgreSQL: localhost:5454

**Environment variables:**
- Development: `.env.development` (committed)
- Production: `.env.production` (not in repo)
- Validated at startup via `AppSettings` class

## Deployment

The project uses Dokploy on Hostinger VPS:
1. Code pushed to GitHub
2. Docker images built and pushed to GitHub Container Registry
3. Dokploy pulls images and deploys
4. Traefik reverse proxy handles SSL and routing

Configuration in `dokploy.yml`.

## OpenAPI Documentation

Interactive API documentation available at `/scalar/v1` when API is running. This is the source of truth for the API contract and drives TypeScript client generation.

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
