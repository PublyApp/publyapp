# ProblemDetails Migration Execution Plan (Historical)

**Status:** Completed (PR `radandevist/publyapp#162`)

This document originally described the step-by-step migration from `ApiResponse` errors to RFC 7807 `ProblemDetails`. The migration is now complete.

## Current Reference

Use `docs/guides/problem-details-migration-checklist.md` for the up-to-date conventions and maintenance checklist.

## Notes on Final Decisions

- Error responses use `application/problem+json`:
  - `AppProblemDetails` for `400/401/403/404/500`
  - `ValidationProblemDetails` for `422` (field-level validation errors)
- Typed results are prefixed with `App*` (e.g., `AppForbiddenHttpResult`) to avoid naming conflicts with `Microsoft.AspNetCore.Http.HttpResults.*`.
- OpenAPI correctness relies on typed results + explicit metadata for filter-produced responses (no global OpenAPI transformer is used).
