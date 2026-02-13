# Code Review Request: SystemNotice Handler Fixes + PatchField\<T\> + AGENTS.md Rules

## Context

This is a .NET 10 / ASP.NET Core Web API following **Vertical Slice Architecture** with domain-first module layout. The codebase enforces strict conventions documented in `AGENTS.md` (the single source of truth for architecture rules). Handlers use **Minimal APIs**, **FluentValidation**, and **JsonElement-based request DTOs** (to defer type binding until validation). Services own all DbContext access; handlers only orchestrate.

The branch `claude/system-notice-crud-endpoints-ZmhH4` implements CRUD endpoints for `SystemNotice` (a platform-wide notice entity with severity, title, message, date range). During self-review, 7 issues were identified where the code deviated from established codebase patterns. This changeset fixes all 7.

---

## What Changed (8 files)

### A. New utility: `PatchField<T>` struct

**File:** `apps/api/Src/Lib/PatchField.cs` (NEW)

A readonly struct representing three states for PATCH nullable fields:
- `Absent()` — field not sent in request
- `Set(value)` — field sent with a value
- `Set(null)` — field explicitly set to null

Replaces the previous pattern of passing `DateTime? expiresAt` + `bool clearExpiresAt` as separate parameters.

### B. DateTime extension methods

**File:** `apps/api/Src/Lib/Extensions/JsonElementExtensions.cs` (MODIFIED — 3 methods added)

Added `GetValueAsDateTime(JsonElement)`, `GetValueAsDateTimeOrNull(JsonElement?)`, and `GetValueAsDateTimeOrNull(JsonElement)`. These follow the exact same pattern as the existing `GetValueAsString*`, `GetValueAsInt32*`, `GetValueAsGuid*` families already in the file, including `[CallerArgumentExpression]` for error messages. All parse with `DateTime.Parse(...).ToUniversalTime()`.

### C. `ParseSeverity()` static method on entity

**File:** `apps/api/Src/Modules/SystemNotices/Entities/SystemNotice.cs` (MODIFIED)

Added `public static NoticeSeverity? ParseSeverity(string severity)` following the established `User.ParseStatus()` / `UserAccount.ParseAccountLevel()` pattern: sequential `string.Compare(..., StringComparison.OrdinalIgnoreCase)` checks, returns `null` if no match.

### D. CreateSystemNotice handler fixes

**File:** `apps/api/Src/Modules/SystemNotices/Handlers/Staff/CreateSystemNotice.cs` (REWRITTEN)

Changes:
1. Added getter methods to `CreateSystemNoticeBody`: `GetSeverity()`, `GetTitle()`, `GetMessage()`, `GetStartsAt()`, `GetExpiresAt()`
2. Replaced inline `switch` expression for severity parsing with `SystemNotice.ParseSeverity()`
3. Replaced `?? throw` null-coalescing guard with explicit `if (account is null)` block
4. Replaced inline `DateTime.Parse(body.ExpiresAt.Value.GetString()!)` with `body.GetExpiresAt()` using the new DateTime extension
5. Response now uses `severity.ToString().ToLowerInvariant()` from the parsed enum instead of the raw input string (consistency fix)

Validator and DTO structure unchanged.

### E. UpdateSystemNotice handler fixes

**File:** `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs` (REWRITTEN)

Changes:
1. Added getter methods to `UpdateSystemNoticeBody`: `GetSeverity()`, `GetTitle()`, `GetMessage()`, `GetStartsAt()`, `GetExpiresAt()`
   - `GetExpiresAt()` returns `PatchField<DateTime?>` with explicit three-way branching (absent / JSON null / string value)
2. Replaced `?? throw` guard with `if` block
3. Replaced ~50 lines of inline `JsonElement` value extraction with getter method calls
4. Replaced `clearExpiresAt` boolean with `PatchField<DateTime?>` passed to service
5. Audit log payload uses `expiresAt.IsPresent ? expiresAt.Value : null` instead of the old `ClearExpiresAt` flag
6. Severity parsing now delegates to `SystemNotice.ParseSeverity()`

Validator unchanged.

### F. SystemNoticeService signature update

**File:** `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs` (MODIFIED)

- Interface: `UpdateAsync` signature changed from `DateTime? expiresAt, bool clearExpiresAt` → `PatchField<DateTime?> expiresAt`
- Implementation: Replaced `if/else if` block with single `if (expiresAt.IsPresent) { notice.ExpiresAt = expiresAt.Value; }`

No other methods changed.

### G. AGENTS.md rules

**File:** `AGENTS.md` (MODIFIED — 6 new subsections + 2 cross-references)

New rules added to C# Coding Standards:
1. **Enum parsing on entities** — mandate `Parse{EnumName}()` static methods on entity classes
2. **Prefer `if` blocks over `??` throw** — clarity over conciseness for guard clauses
3. **Body DTO getter methods** — mandate `Get{Property}()` methods using `JsonElementExtensions`
4. **Guard clause in staff handlers** — `InvalidOperationException` (not `TypedProblems.Forbidden`) for developer safety nets
5. **DTO placement: service vs handler** — rules for where DTOs belong
6. **PatchField\<T\> for nullable PATCH fields** — comprehensive section with decision tree, full three-layer pattern, anti-patterns, and examples for multiple types

Cross-references added to:
- "DTO and Request/Response Patterns" section (update body DTOs with clearable fields)
- "Service Layer Separation" section (parameter conventions for update methods: `T` vs `T?` vs `PatchField<T?>`)

---

## Review Dimensions

Please review the changeset across the following dimensions. For each, flag issues as **Critical** (must fix), **Warning** (should fix), or **Nit** (optional/stylistic).

### 1. Correctness

- Does `PatchField<T>` correctly model the three-state semantics? Are there edge cases where `Absent` vs `Set(null)` could be confused?
- Does the `readonly struct` behave correctly with `default(PatchField<T>)`? (Default would be `IsPresent=false, Value=default` — is this a safe default or a trap?)
- In `UpdateSystemNoticeBody.GetExpiresAt()`, the final fallback returns `Absent()`. Could any `JsonValueKind` other than `Null`/`String`/`null` reach this code after FluentValidation passes? Is this safe?
- The `GetValueAsDateTime` extensions use `DateTime.Parse(...).ToUniversalTime()`. Is there a risk of double UTC conversion if the input string already has a `Z` suffix? (i.e., does `DateTime.Parse("2025-01-01T00:00:00Z").ToUniversalTime()` produce the correct result?)
- `ParseSeverity()` returns `null` on unknown input. The handler falls back to `?? NoticeSeverity.Info`. But FluentValidation already rejects invalid severities. Is the `?? Info` fallback dead code, or is there a scenario where it runs? Should it throw instead?

### 2. Type Safety & API Contract

- `PatchField<T>` is a generic struct. Does it work correctly with nullable value types (`PatchField<DateTime?>`)? Specifically, when `T` is `DateTime?`, does `Value` correctly hold `null` vs `default(DateTime?)`?
- Is there any risk of `PatchField<T>` leaking into the OpenAPI spec (e.g., if accidentally used as a response DTO property)? Should we add `[JsonIgnore]` or similar safeguards?
- The service interface change from `(DateTime? expiresAt, bool clearExpiresAt)` to `(PatchField<DateTime?> expiresAt)` is a breaking change for any callers. Are all callers updated? (Check the integration tests' test helper if it calls the service directly.)

### 3. Performance

- `PatchField<T>` is a `readonly struct` — good for avoiding heap allocation. But is there any concern about it being passed by value on the stack for large `T`?
- The `DateTime.Parse` inside `GetExpiresAt()` runs after FluentValidation already confirmed the string is a valid date. Is this redundant parsing acceptable, or should we cache the parsed value?
- `ParseSeverity()` uses sequential `string.Compare` calls. For 3 enum values this is fine, but the comment/pattern suggests this will be copied for enums with more values. Should we note a threshold where a `Dictionary<string, T>` lookup becomes preferable?

### 4. Code Quality & Patterns

- The `PatchField<T>` struct uses static factory methods (`Absent()`, `Set(value)`) instead of constructors. Is this the right API design for C#? Should we consider adding implicit conversion operators or a `Match` method for exhaustive handling?
- In the AGENTS.md rules, the `PatchField` decision tree says "Is the field nullable in the entity?" → NO → "Use `T?`". But what about an update endpoint where a non-nullable field (like `Title`) can be optionally updated? The service uses `string? title` (null = don't change). Is this clear enough, or does it create confusion with PatchField's "Absent" concept?
- The body DTO getter methods (`GetSeverity()`, `GetTitle()`, etc.) are instance methods on a `record`. Is this idiomatic C#? Would extension methods or a separate mapper class be more appropriate for the Vertical Slice pattern?
- Are there any naming inconsistencies? (e.g., `ParseSeverity` vs `GetSeverity` — "Parse" is on the entity, "Get" is on the DTO)

### 5. Error Handling & Diagnostics

- `GetValueAsDateTime` throws `InvalidOperationException` with `[CallerArgumentExpression]` for the property name. Is `InvalidOperationException` the right exception type here? The existing `GetValueAsString` methods use it too, so this is consistent, but is it semantically correct?
- If `PatchField<T>.Value` is accessed when `IsPresent` is `false`, it returns `default(T?)`. Should it throw instead to prevent silent bugs? (Trade-off: safety vs convenience)
- The guard clause message in handlers says "Ensure the endpoint has .WithPermission() middleware." — is this actionable enough for debugging in production?

### 6. AGENTS.md Documentation Quality

- Are the 6 new rules clear enough for an AI coding agent (or a new developer) to follow without ambiguity?
- Is the PatchField decision tree complete? Are there edge cases it doesn't cover?
- Do the cross-references in "DTO and Request/Response Patterns" and "Service Layer Separation" add value, or do they create maintenance burden (two places to update)?
- Is there anything in the existing AGENTS.md rules that now contradicts the new rules?

### 7. Testing Implications

- The `SystemNoticeService.UpdateAsync` signature changed. Do the existing integration tests still cover the three-state semantics (send value, send null, omit field)?
- Should there be a unit test for `PatchField<T>` itself (e.g., verifying `default(PatchField<T>)` behavior, `Set(null)` vs `Absent()`)?
- Should there be a unit test for `ParseSeverity()` covering case-insensitivity and unknown input?

---

## Expected Output

For each dimension, provide:
1. A severity rating (Critical / Warning / Nit)
2. The specific issue
3. A suggested fix or "Looks good" if no issues found

End with an overall assessment: **Ship it**, **Ship with fixes**, or **Needs rework**.
