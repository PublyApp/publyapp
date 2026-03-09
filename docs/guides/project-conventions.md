# Project Conventions

> Extracted from `AGENTS.md` — cross-cutting conventions not covered by the C# or frontend coding standards guides.

## Route Naming

- Backend routes use kebab-case: `/staff/staff-users`
- Route constants defined in `apps/api/Src/Lib/RoutePath.cs`
- Frontend route constants in `packages/shared/lib/constants.ts`

## API Contract Naming

Use different naming conventions for different layers instead of forcing one style
everywhere:

- Internal .NET symbols stay **PascalCase**: `UpdatedAt`, `SortId`, `UserId`
- Database column names stay **snake_case** via EF mappings: `updated_at`
- JSON body/response fields stay **camelCase** unless there is a deliberate
  contract migration
- URL/query parameter names use **snake_case**: `sort_id`, `sort_order`,
  `updated_at`, `user_id`
- Multi-word wire-format option values also use **snake_case**:
  `created_at`, `updated_at`, `user_account_count`
- Never use collapsed lowercase wire names or option values like `updatedat`

### Why this split exists

- PascalCase is idiomatic for C# code and EF entities
- snake_case is easier to read in URLs than smashed lowercase
- camelCase remains the current JSON contract style used by generated clients
- This avoids accidental partial migrations where query params, JSON fields, and
  C# property names all drift independently

### Agent rule

When adding or changing API contracts:

1. Keep handler/query/body DTO property names idiomatic in C#
2. Use `[FromQuery(Name = "...")]` to expose **snake_case** query params on the
   wire
3. Keep query value allowlists in **snake_case** when the value has multiple
   words
4. Regenerate OpenAPI and the TypeScript client after wire-contract changes

## API Response Format

**Success responses:**
```csharp
// For message-only successes (optional, some endpoints return Ok<T> with domain data instead)
public record ApiResponse {
    public string Message { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
}
```

**Error responses:**
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

## Validation

- Backend: FluentValidation validators applied via filters
- Frontend: Zod schemas with React Hook Form
- Shared validation logic in `packages/shared/lib/zod/`

## Error Handling

- Backend: Structured logging with Serilog, contextual error information
- Frontend: React Router error boundaries, custom error pages (400, 403, 404, 500)
- Always log before rethrowing exceptions
- Frontend/Node app code: Prefer `logger` from `@/shared/lib/logger/iso-logger` over the global `console` object
  - Rationale: consistent formatting + environment-safe (browser/SSR) behavior
  - If a request/loader context provides a logger (e.g. React Router `args.context.logger` / `getServerLoader`), prefer `context.logger` over importing the global singleton so logs can be request-scoped
  - Avoid committing `console.*` in React components, hooks, libs, SSR entrypoints, etc.
  - **Exceptions:** scripts/build tooling/config where importing the iso-logger isn't feasible (e.g. `scripts/**`, `apps/*/_vite/**`, `*.config.*`, `*.mjs`, `server.js`), or intentionally user-facing CLI output
