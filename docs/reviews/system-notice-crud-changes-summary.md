# System Notice CRUD Endpoints - Changes Summary

**Branch:** `claude/system-notice-crud-endpoints-ZmhH4`
**Issue:** [#169](https://github.com/radandevist/publyapp/issues/169)
**Date:** 2026-02-12

---

## Overview

This document summarizes all changes made during the code review and fix-up sessions on this branch. The work spanned two sessions:

1. **Session 1:** Deep analysis of the branch, then fixing all identified blockers, bugs, and compliance issues
2. **Session 2:** Writing integration tests for all 6 SystemNotice endpoints

**Total impact:** 21 files changed vs `main` (1 modified, 20 added), +3,063 / -58 lines.

---

## Phase 1: Analysis

A comprehensive branch analysis was written to `docs/reviews/system-notice-crud-branch-analysis.md`, identifying:

- **2 blockers** (app wouldn't work at all)
- **3 bugs** (incorrect behavior)
- **4 compliance issues** (repo convention violations)
- **2 performance observations** (acceptable at current scale)

---

## Phase 2: Fixes Applied

### Blockers Fixed

| ID | Issue | File | Fix |
|----|-------|------|-----|
| BLOCKER-1 | Staff endpoints not registered in `Program.cs` | `apps/api/Program.cs` | Added `staffGroup.MapSystemNoticeEndpointsForStaff()` |
| BLOCKER-2 | `SystemNoticeService` not registered in DI | `Services/SystemNoticeService.cs` | Added `[Service(ServiceLifetime.Scoped)]` attribute |

### Bugs Fixed

| ID | Issue | File | Fix |
|----|-------|------|-----|
| BUG-1 | Soft-deleted notices returned in Find and GetById | `Services/SystemNoticeService.cs` | Added `where n.IsDeleted == false` filter to `FindAsync` and `GetByIdAsync` queries |
| BUG-2 | `UpdateAsync` unconditionally overwrites `ExpiresAt` | `Services/SystemNoticeService.cs` + `Handlers/Staff/UpdateSystemNotice.cs` | Added `bool clearExpiresAt` parameter; handler detects `JsonValueKind.Null` vs absent field |
| BUG-3 | `DeleteAsync` manually sets soft-delete fields (bypasses audit tracking) | `Services/SystemNoticeService.cs` | Replaced manual `IsDeleted = true` with `_dbContext.SystemNotice.Remove(notice)` (DbContext override handles soft-delete + timestamps) |

### Compliance Fixes

| ID | Issue | File | Fix |
|----|-------|------|-----|
| COMPLIANCE-1 | Generic `ResponseKeys.NotFound` used instead of domain-specific key | `GetSystemNoticeById.cs`, `UpdateSystemNotice.cs`, `DeleteSystemNotice.cs` | Changed to `ResponseKeys.SystemNoticeNotFound` (`"system-notice-not-found"`) |
| COMPLIANCE-2 | Redundant `authContext.AccountStaff is null` checks returning Forbidden | `CreateSystemNotice.cs`, `UpdateSystemNotice.cs`, `DeleteSystemNotice.cs` | Replaced with guard clause `?? throw new InvalidOperationException(...)` for developer safety; removed `AppForbiddenHttpResult` from return types |
| COMPLIANCE-4 | XML doc comments on `Routes.SystemNotices.cs` | `Routes.SystemNotices.cs` | Removed XML comments (no other Routes file uses them) |

> **COMPLIANCE-3** (Response DTOs in service file) was reviewed and intentionally kept as-is per user decision — DTOs used by both service and handlers correctly belong in the service file.

### Pagination Conversion

| Change | File | Detail |
|--------|------|--------|
| Offset → Cursor pagination | `Services/SystemNoticeService.cs` | Complete rewrite of `FindAsync` to use `CursorPaginatedResult<T>`, `CursorPaginatedQuery`, and `SortFieldHandler` pattern |
| Handler updated | `Handlers/Staff/FindSystemNotices.cs` | Full rewrite to accept cursor-based query params (`cursor`, `limit`, `sortBy`, `sortDir`) and return `CursorPaginatedResult<SystemNoticeListItem>` |

### Build & Client Generation

After all fixes:
- `make build-api` — 0 errors, 0 warnings
- `make generate-client` — TypeScript client regenerated
- `make tsc-front` — No type errors

---

## Phase 3: Integration Tests

25 integration tests across 7 new files, covering all 6 SystemNotice endpoints.

### Test Helper

| File | Purpose |
|------|---------|
| `apps/api/Src/Lib/Testing/SystemNoticeTestHelper.cs` | Shared helper for creating/deleting test notices and building URLs |

### Staff Endpoint Tests

| File | Tests | Coverage |
|------|-------|----------|
| `Handlers/Staff/CreateSystemNotice.IntegrationTests.cs` | 5 | Valid creation, creation without expiresAt, unauthorized (401), invalid severity (422), empty title (422) |
| `Handlers/Staff/FindSystemNotices.IntegrationTests.cs` | 5 | Default listing, unauthorized (401), invalid sortId (400), cursor pagination, sort ordering |
| `Handlers/Staff/GetSystemNoticeById.IntegrationTests.cs` | 3 | Existing notice returns detail, unauthorized (401), nonexistent (404) |
| `Handlers/Staff/UpdateSystemNotice.IntegrationTests.cs` | 5 | Valid update, unauthorized (401), nonexistent (404), clearExpiresAt (BUG-2 regression), partial update preserves other fields |
| `Handlers/Staff/DeleteSystemNotice.IntegrationTests.cs` | 4 | Successful delete (204), unauthorized (401), nonexistent (404), already-deleted returns 404 |

### Anonymous Endpoint Tests

| File | Tests | Coverage |
|------|-------|----------|
| `Handlers/Anonymous/GetActiveSystemNotices.IntegrationTests.cs` | 3 | Returns active notices (no auth needed), excludes expired, excludes future |

### Test Patterns Used

- **xUnit** with `IClassFixture<ApiFixture>` for shared test server
- **Testcontainers** PostgreSQL (requires Docker at runtime)
- **FluentAssertions** for readable assertions
- **`TestAuthClient.LoginAsStaffAdminAsync()`** for staff authentication
- **`HttpRequestMessageExtensions.WithSessionToken()`** for attaching auth tokens
- **`try/finally` cleanup** pattern — all tests clean up created data even on failure
- **`AppProblemDetails.TranslationKey`** assertions for error response validation

### Build Result

All 25 tests compile and are discovered by xUnit. Tests require Docker (Testcontainers) to execute — run with `make test-api`.

---

## Complete File Inventory

### New Files (20)

| File | Lines | Purpose |
|------|-------|---------|
| `Entities/SystemNotice.cs` | 48 | Entity with severity enum, title, message, date range, `IsActive()` |
| `Services/SystemNoticeService.cs` | 444 | Full CRUD service with cursor pagination, soft-delete filters |
| `Routes.SystemNotices.cs` | 24 | Route constants for staff + anonymous endpoints |
| `Permissions/SystemNoticePermissionsForStaff.cs` | 101 | Permission definitions for CRUD operations |
| `Endpoints/SystemNoticeEndpointsForStaff.cs` | 60 | Staff endpoint mappings with auth + validation |
| `Endpoints/SystemNoticeEndpointsAnonymous.cs` | 25 | Anonymous endpoint mapping |
| `Handlers/Staff/CreateSystemNotice.cs` | 185 | Create handler + DTOs + validator |
| `Handlers/Staff/FindSystemNotices.cs` | 86 | Find/list handler with cursor pagination |
| `Handlers/Staff/GetSystemNoticeById.cs` | 55 | Get by ID handler |
| `Handlers/Staff/UpdateSystemNotice.cs` | 234 | PATCH update handler + clearExpiresAt logic |
| `Handlers/Staff/DeleteSystemNotice.cs` | 52 | Soft-delete handler |
| `Handlers/Anonymous/GetActiveSystemNotices.cs` | 16 | Public active notices handler |
| `Lib/Testing/SystemNoticeTestHelper.cs` | 109 | Shared test helper |
| `Handlers/Staff/CreateSystemNotice.IntegrationTests.cs` | 203 | 5 tests |
| `Handlers/Staff/FindSystemNotices.IntegrationTests.cs` | 242 | 5 tests |
| `Handlers/Staff/GetSystemNoticeById.IntegrationTests.cs` | 150 | 3 tests |
| `Handlers/Staff/UpdateSystemNotice.IntegrationTests.cs` | 294 | 5 tests |
| `Handlers/Staff/DeleteSystemNotice.IntegrationTests.cs` | 150 | 4 tests |
| `Handlers/Anonymous/GetActiveSystemNotices.IntegrationTests.cs` | 181 | 3 tests |
| `docs/reviews/system-notice-crud-branch-analysis.md` | 337 | Branch analysis document |

### Modified Files (1)

| File | Change |
|------|--------|
| `apps/api/Program.cs` | Added `staffGroup.MapSystemNoticeEndpointsForStaff()` endpoint registration |
