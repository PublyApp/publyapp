# System Notice CRUD Endpoints - Implementation Plan

**Issue:** #169 - feat(staff): System notice CRUD endpoints
**Branch:** `claude/system-notice-crud-endpoints-ZmhH4`

## Overview

Create API endpoints for managing system notices (operational alerts, maintenance banners). The `SystemNotice` entity already exists with fields for Severity (Info/Warning/Critical), Title, Message, StartsAt, and ExpiresAt.

## Current State

**Existing:**
- Entity: `apps/api/Src/Modules/SystemNotices/Entities/SystemNotice.cs`
- Enum: `NoticeSeverity` (Info=0, Warning=1, Critical=2)
- Audit actions: `SystemNoticeCreated`, `SystemNoticeUpdated` (in `AuditLog.cs`)
- Entity has `IsActive()` method for checking if notice is currently active

**Missing:**
- Route constants
- Service layer
- Handlers (Staff + Anonymous)
- Endpoints
- Permissions
- Registration in Program.cs

## API Endpoints Design

### Staff API (`/staff/notices`)

| Method | Path | Handler | Permission | Description |
|--------|------|---------|------------|-------------|
| POST | `/staff/notices` | `CreateSystemNotice` | `system_notices.create` | Create a new system notice |
| GET | `/staff/notices` | `FindSystemNotices` | `system_notices.list` | List all notices (with pagination) |
| GET | `/staff/notices/{id}` | `GetSystemNoticeById` | `system_notices.get` | Get notice by ID |
| PATCH | `/staff/notices/{id}` | `UpdateSystemNotice` | `system_notices.update` | Update a notice |
| DELETE | `/staff/notices/{id}` | `DeleteSystemNotice` | `system_notices.delete` | Soft-delete a notice |

### Anonymous API (`/notices`)

| Method | Path | Handler | Permission | Description |
|--------|------|---------|------------|-------------|
| GET | `/notices/active` | `GetActiveSystemNotices` | None | Get currently active notices |

## Files to Create

### 1. Route Constants
**File:** `apps/api/Src/Modules/SystemNotices/Routes.SystemNotices.cs`

```csharp
#pragma warning disable IDE0130
namespace MainApi.Src.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
    public static class SystemNotices {
        public static class ForStaff {
            public const string Root = "/notices";
            public const string Create = "/";
            public const string Find = "/";
            public const string GetById = "/{noticeId}";
            public static string GetByIdFn(string noticeId) => $"/{noticeId}";
            public const string Update = "/{noticeId}";
            public static string UpdateFn(string noticeId) => $"/{noticeId}";
            public const string Delete = "/{noticeId}";
            public static string DeleteFn(string noticeId) => $"/{noticeId}";
        }

        public static class Anonymous {
            public const string Root = "/notices";
            public const string GetActive = $"{Root}/active";
        }
    }
}
```

### 2. Service Layer
**File:** `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs`

**Interface methods:**
- `CreateAsync(...)` - Create a notice
- `FindAsync(page, pageSize)` - List notices with pagination
- `GetByIdAsync(id)` - Get single notice
- `UpdateAsync(id, ...)` - Update notice
- `DeleteAsync(id)` - Soft-delete notice
- `GetActiveAsync()` - Get currently active notices

### 3. Staff Handlers

**Location:** `apps/api/Src/Modules/SystemNotices/Handlers/Staff/`

#### a) CreateSystemNotice.cs
- Body DTO: `CreateSystemNoticeBody` (severity, title, message, startsAt, expiresAt?)
- Response: `SystemNoticeCreated` (id, title, startsAt)
- Validator: `CreateSystemNoticeBodyValidator`
- Audit log: `AuditActions.SystemNoticeCreated`

#### b) FindSystemNotices.cs
- Query DTO: `FindSystemNoticesQuery` (page?, pageSize?)
- Response: List of `SystemNoticeListItem`
- No validator needed (optional query params)

#### c) GetSystemNoticeById.cs
- Path param: `noticeId`
- Response: `SystemNoticeDetail`
- Returns 404 if not found

#### d) UpdateSystemNotice.cs
- Path param: `noticeId`
- Body DTO: `UpdateSystemNoticeBody` (all fields optional)
- Response: `SystemNoticeUpdated`
- Audit log: `AuditActions.SystemNoticeUpdated`

#### e) DeleteSystemNotice.cs
- Path param: `noticeId`
- Response: 204 No Content or success message
- Audit log: Add `AuditActions.SystemNoticeDeleted`

### 4. Anonymous Handler

**File:** `apps/api/Src/Modules/SystemNotices/Handlers/Anonymous/GetActiveSystemNotices.cs`
- No auth required
- Response: List of `ActiveSystemNotice` (id, severity, title, message, expiresAt?)
- Uses `IsActive()` method on entity

### 5. Endpoints

**Staff Endpoints:** `apps/api/Src/Modules/SystemNotices/Endpoints/SystemNoticeEndpointsForStaff.cs`
- Map all 5 staff routes with `.WithPermission()`
- Use `.WithReqBodyValidation<T>()` for POST/PATCH

**Anonymous Endpoints:** `apps/api/Src/Modules/SystemNotices/Endpoints/SystemNoticeEndpointsAnonymous.cs`
- Map GET `/notices/active`
- Add `.ProducesAppProblem(StatusCodes.Status500InternalServerError)`

### 6. Permissions

**File:** `apps/api/Src/Modules/SystemNotices/Permissions/SystemNoticePermissionsForStaff.cs`

Permissions to create:
- `system_notices.list` - List system notices
- `system_notices.get` - Get system notice by ID
- `system_notices.create` - Create system notice
- `system_notices.update` - Update system notice
- `system_notices.delete` - Delete system notice

## Files to Modify

### 1. AppPermissions.cs
**File:** `apps/api/Src/Lib/AppPermissions.cs`

Add:
```csharp
using MainApi.Src.Modules.SystemNotices.Permissions;

// In StaffScopePermissions class:
public SystemNoticePermissionsForStaff SystemNotices { get; } = new SystemNoticePermissionsForStaff();
```

### 2. Program.cs
**File:** `apps/api/Program.cs`

Add:
```csharp
// Anonymous (before staffGroup)
app.MapSystemNoticeEndpointsAnonymous();

// Staff (in staffGroup section)
staffGroup.MapSystemNoticeEndpointsForStaff();
```

### 3. AuditLog.cs - Add delete action
**File:** `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs`

Add:
```csharp
public const string SystemNoticeDeleted = "system.notice.deleted";
```

### 4. Translation Keys
**File:** `packages/shared/lib/i18n/json/response-message.en.json`

Add:
```json
"system-notice-created-successfully": "System notice created successfully",
"system-notice-updated-successfully": "System notice updated successfully",
"system-notice-deleted-successfully": "System notice deleted successfully",
"system-notice-not-found": "System notice not found"
```

**File:** `packages/shared/lib/i18n/json/response-message.fr.json`

Add:
```json
"system-notice-created-successfully": "Avis système créé avec succès",
"system-notice-updated-successfully": "Avis système mis à jour avec succès",
"system-notice-deleted-successfully": "Avis système supprimé avec succès",
"system-notice-not-found": "Avis système non trouvé"
```

## Implementation Order

1. **Routes** - Define route constants
2. **Service** - Implement service with interface
3. **Permissions** - Create permission definitions
4. **Update AppPermissions** - Register permissions
5. **Staff Handlers** - Create all 5 handlers
6. **Anonymous Handler** - Create GetActiveSystemNotices
7. **Endpoints** - Create endpoint registration files
8. **Update Program.cs** - Register endpoints
9. **Translations** - Add translation keys
10. **Update AuditLog** - Add SystemNoticeDeleted action
11. **Build & Test** - `make build-api` and `make generate-client`

## DTOs Summary

### Request Bodies (using JsonElement)

```csharp
// Create
public record CreateSystemNoticeBody {
    public required JsonElement Severity { get; init; }  // "info", "warning", "critical"
    public required JsonElement Title { get; init; }
    public required JsonElement Message { get; init; }
    public required JsonElement StartsAt { get; init; }  // ISO 8601
    public JsonElement? ExpiresAt { get; init; }         // Optional ISO 8601
}

// Update (all optional)
public record UpdateSystemNoticeBody {
    public JsonElement? Severity { get; init; }
    public JsonElement? Title { get; init; }
    public JsonElement? Message { get; init; }
    public JsonElement? StartsAt { get; init; }
    public JsonElement? ExpiresAt { get; init; }
}
```

### Response DTOs

```csharp
// List item
public record SystemNoticeListItem {
    public required Guid Id { get; init; }
    public required string Severity { get; init; }
    public required string Title { get; init; }
    public required DateTime StartsAt { get; init; }
    public DateTime? ExpiresAt { get; init; }
    public required bool IsActive { get; init; }
    public required DateTime CreatedAt { get; init; }
}

// Detail
public record SystemNoticeDetail {
    public required Guid Id { get; init; }
    public required string Severity { get; init; }
    public required string Title { get; init; }
    public required string Message { get; init; }
    public required DateTime StartsAt { get; init; }
    public DateTime? ExpiresAt { get; init; }
    public required Guid CreatedByStaffId { get; init; }
    public required DateTime CreatedAt { get; init; }
    public required DateTime UpdatedAt { get; init; }
}

// Active notice (anonymous response - limited fields)
public record ActiveSystemNotice {
    public required Guid Id { get; init; }
    public required string Severity { get; init; }
    public required string Title { get; init; }
    public required string Message { get; init; }
    public DateTime? ExpiresAt { get; init; }
}
```

## Folder Structure After Implementation

```
apps/api/Src/Modules/SystemNotices/
├── Entities/
│   └── SystemNotice.cs (existing)
├── Services/
│   └── SystemNoticeService.cs (new)
├── Handlers/
│   ├── Staff/
│   │   ├── CreateSystemNotice.cs (new)
│   │   ├── FindSystemNotices.cs (new)
│   │   ├── GetSystemNoticeById.cs (new)
│   │   ├── UpdateSystemNotice.cs (new)
│   │   └── DeleteSystemNotice.cs (new)
│   └── Anonymous/
│       └── GetActiveSystemNotices.cs (new)
├── Endpoints/
│   ├── SystemNoticeEndpointsForStaff.cs (new)
│   └── SystemNoticeEndpointsAnonymous.cs (new)
├── Permissions/
│   └── SystemNoticePermissionsForStaff.cs (new)
└── Routes.SystemNotices.cs (new)
```

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|---------------|
| Staff can create notices with severity, title, message, and date range | `POST /staff/notices` with `CreateSystemNotice` handler |
| Staff can list notices | `GET /staff/notices` with `FindSystemNotices` handler |
| Staff can update notices | `PATCH /staff/notices/{id}` with `UpdateSystemNotice` handler |
| Staff can delete notices | `DELETE /staff/notices/{id}` with `DeleteSystemNotice` handler |
| Public endpoint returns only currently active notices | `GET /notices/active` with `GetActiveSystemNotices` handler |
| All CRUD operations are audit logged | `IAuditLogService.LogAsync()` in Create/Update/Delete handlers |

## Notes

- Soft-delete is used (via `BaseAttributes.IsDeleted`)
- The `IsActive()` method already exists on the entity for filtering active notices
- `CreatedByStaffId` tracks which staff member created the notice
- Pagination for list endpoint uses standard page/pageSize query params
- Anonymous endpoint doesn't require authentication middleware
