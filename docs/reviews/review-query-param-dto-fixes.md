# Code Review Request: Fix Inconsistent Query Parameter DTOs

## Instructions

You are a senior .NET software engineer performing a thorough code review on a pull request for a multi-tenant SaaS application built with .NET 10.0, Minimal APIs, FluentValidation, and Vertical Slice Architecture. The codebase enforces strict coding standards documented in `AGENTS.md` and its referenced guide files.

Review the diff below against **every** criterion listed. For each criterion, state PASS, WARN, or FAIL with a brief explanation. At the end, provide a summary verdict (APPROVE, REQUEST CHANGES, or COMMENT) and a prioritized list of action items if any.

---

## Project Context

- **Stack**: .NET 10.0, Minimal APIs, FluentValidation, EF Core, PostgreSQL
- **Architecture**: Vertical Slice (domain-first modules), CQRS-lite handlers
- **Query binding**: `[AsParameters]` with `[FromQuery]` on each property
- **Validation**: FluentValidation auto-wired via endpoint extensions
- **Error format**: RFC 7807 `application/problem+json`
- **Response conventions**: `TypedProblems.*` for all errors; `TypedResults.Ok(...)` for success
- **Namespace rule**: `IDE0130` is treated as error — file namespace must match folder path
- **Line length**: max 100 characters
- **Null checks**: pattern matching (`is null` / `is not null`), never `== null`
- **Guard clauses**: flat `if`/early return, no `?? throw`, no null-forgiving `!`

---

## Change Summary

**35 files changed** (+1 052 / -689 lines)

### What this PR does

1. **Extracts shared validation predicates** (`QueryPredicates.cs`) — deduplicates GUID, date, and date-range validation logic that was copy-pasted across `FindAuditLogsQueryValidator` and `ExportAuditLogsQueryValidator`.

2. **Adds getter methods** to `FindAuditLogsQuery` and `ExportAuditLogsQuery` — moves inline `Guid.TryParse` / `DateTime.TryParse` parsing from handlers into query DTOs (consistent with existing patterns in `GetVerificationLinkQuery`, `GetRedirectCodeQuery`, etc.).

3. **Adds missing `[FromQuery]` attributes** to 4 standalone query DTOs that lacked them: `GetVerificationLinkQuery.UserId`, `GetTenantAuthDataQuery.TenantId`, `GetRedirectCodeQuery.TenantId`, `FindStaffPermissionsQuery.Language`.

4. **Adds missing validator** for `GetTenantAuthDataQuery` (was the only query DTO with no validator).

5. **Prior refactoring** (included in same branch, already staged): Moves `PaginatedQueryValidator`, `CursorPaginatedQueryValidator`, and `PaginationPredicates` from `Src/Lib/` into `Src/Lib/Validation/`; creates `EncryptedIdTokenQuery` base class; creates `JsonElementRules` shared extension methods; replaces inline `DependentRules` chains across ~20 handler validators with shared extensions.

6. **Documentation**: Creates `docs/guides/validator-conventions.md` with 7 rules; updates `AGENTS.md` to reference it.

---

## Review Criteria

### 1. Functional Correctness
- Do the new `QueryPredicates` methods (`BeValidNullableGuid`, `BeValidNullableDate`, `BeValidDateRange`, `ParseNullableGuid`, `ParseNullableDate`) behave identically to the private methods they replace?
- Is the `BeValidDateRange` cross-field validator correctly wired in both `FindAuditLogsQueryValidator` and `ExportAuditLogsQueryValidator`? Does the `.When(...)` guard still prevent the rule from running when dates are null or unparseable?
- Do the new getter methods (`GetUserId()`, `GetTargetId()`, `GetStartDate()`, `GetEndDate()`, `GetFormat()`) produce the same parsed values as the inline code they replaced?
- Does the new `GetTenantAuthDataQueryValidator` with `NotEmpty()` on `TenantId` correctly reject empty strings while allowing the `"staff"` value the handler checks?
- Is there any change in observable API behavior (HTTP status codes, error messages, response shapes)?

### 2. Behavioral Equivalence (Regression Risk)
- For `FindAuditLogs.HandleFindAuditLogs`: the inline parsing previously silently ignored unparseable values (returned null). Verify the getter methods preserve this behavior.
- For `ExportAuditLogs.HandleExportAuditLogs`: the `ParseExportArgs` method is removed. Verify the inline `new ExportAuditLogsArgs(...)` with getters produces identical `ExportAuditLogsArgs` records.
- For `ExportAuditLogs`: the format null-check moved before `query.GetFormat()`. Verify no change in error path — `GetFormat()` returns `null` when `Format` is null, so the `if (format is null)` guard still works.
- For `JsonElementRules` extensions: verify they produce the same validation behavior as the `DependentRules` chains they replaced (especially `MustBeRequiredPassword` which uses `AppEnvironment.Instance.PASSWORD_MIN_LENGTH` vs the old hardcoded `6` or `8`).
- For `EncryptedIdTokenQuery` base class: verify `CheckEmailVerificationTokenQuery`, `CheckResetPasswordTokenQuery`, and `CheckInvitationTokenQuery` inheriting from it maintain identical validation (NotEmpty + `CryptoUtils.IsValidEncryptedString` for Id; NotEmpty for Token).

### 3. Coding Standards Compliance
- **Null checks**: Are all null checks using `is null` / `is not null` pattern matching (never `== null`)?
- **Guard clauses**: Are there any `?? throw` patterns? Any null-forgiving `!` operators?
- **Line length**: Are all lines within the 100-character limit?
- **Braces**: Do all control flow blocks use braces (no braceless `if`/`else`)?
- **Namespace discipline**: Do all new files have namespaces matching their folder paths (`MainApi.Src.Lib.Validation` for files in `Src/Lib/Validation/`)?
- **Import ordering**: Are `using` statements grouped and ordered correctly (System, FluentValidation, MainApi, Microsoft)?
- **Formatting**: Tab indentation, consistent brace placement, proper wrapping of long method chains?

### 4. Architecture & Design
- Is `QueryPredicates` the right home for these methods, or should they live in `PaginationPredicates` or elsewhere?
- Is having both validation predicates (`BeValid*`) and parse helpers (`Parse*`) in the same class a good idea, or does it violate SRP?
- Does the getter pattern on query DTOs align with the existing codebase conventions (`GetCursor()`, `GetLimit()`, `GetSortId()`, `GetSortOrder()` on base classes)?
- Are there any circular dependency risks with the new `using MainApi.Src.Lib.Validation;` imports?

### 5. FluentValidation Patterns
- Is `Must(QueryPredicates.BeValidNullableGuid)` (method group) correct for single-param predicates?
- Is `Must(q => QueryPredicates.BeValidDateRange(q.StartDate, q.EndDate))` correct for multi-param cross-field validators?
- Does the `.When(...)` guard on the date range rule properly prevent double-validation of already-failed date fields?
- Is `BeValidFormat` correct as a private method in `ExportAuditLogsQueryValidator` (domain-specific, not shared)?

### 6. Security
- Do any changes expose new attack surfaces?
- Are there any new paths where unvalidated input reaches the database or external services?
- Does the `GetTenantAuthDataQueryValidator` with `NotEmpty()` adequately protect the handler's `TenantId` parsing logic?
- Could `ParseNullableGuid`/`ParseNullableDate` return unexpected values for edge-case inputs (e.g., whitespace-only strings)?

### 7. Documentation Quality
- Does `docs/guides/validator-conventions.md` accurately describe all 7 rules?
- Are the code examples correct and consistent with the actual codebase?
- Does the `QueryPredicates.cs` table in Rule 7 accurately list all public methods?
- Is the `AGENTS.md` update correct (new reference to `validator-conventions.md`, new bullet point about validators)?

### 8. Test Impact
- Are existing integration tests expected to still pass with these changes?
- Are there any new code paths that lack test coverage?
- Should new tests be written for `QueryPredicates` methods?

### 9. Completeness
- Are there any other query DTOs in the codebase that still lack `[FromQuery]` attributes?
- Are there any other validators still using duplicated private methods that should use `QueryPredicates`?
- Are there any other query DTOs missing getter methods for inline parsing in handlers?

### 10. Dead Code & Cleanup
- Are all removed private methods (`BeValidNullableGuid`, `BeValidNullableDate`, `HaveValidDateRange`, `ParseExportArgs`, etc.) truly no longer referenced?
- Are the removed `using System.Globalization;` imports correct (no other code in those files depends on them)?
- Is any new code introduced but unused?

---

## Diff

```diff
diff --git a/AGENTS.md b/AGENTS.md
index 413a18df..2e29a265 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -231,6 +231,9 @@ For the complete C# coding standards (null checking, LINQ, async/await, handler
 DTOs, service layer, DI rules, API responses, formatting, and more), see:
 [`docs/guides/csharp-coding-standards.md`](docs/guides/csharp-coding-standards.md)

+For FluentValidation conventions (shared extension methods, pagination validators, encrypted-ID queries), see:
+[`docs/guides/validator-conventions.md`](docs/guides/validator-conventions.md)
+
 **Key principles (always apply):**
 - Pattern matching for null checks (`is null` / `is not null`, never `== null`)
 - **Never** use `?? throw` — use traditional `if` guard clauses for null-then-throw patterns
@@ -247,6 +250,7 @@ DTOs, service layer, DI rules, API responses, formatting, and more), see:
 - "Find" prefix for list/collection retrieval (not "List")
 - Staff handlers MUST use `*ForStaff*` service method variants (e.g., `GetTenantByIdForStaffAsync`) — base methods filter suspended entities
 - For cursor/keyset pagination, see [`docs/guides/cursor-keyset-pagination-guide.md`](docs/guides/cursor-keyset-pagination-guide.md)
+- **Validators**: use `JsonElementRules.*` extension methods (never inline validation chains); inherit `PaginatedQueryValidator<T>`/`CursorPaginatedQueryValidator<T>` for pagination; inherit `EncryptedIdTokenQueryValidator<T>` for encrypted-ID + token queries

 ## Test Conventions

diff --git a/apps/api/Src/Lib/CursorPaginatedQueryValidator.cs b/apps/api/Src/Lib/CursorPaginatedQueryValidator.cs
deleted file mode 100644
--- a/apps/api/Src/Lib/CursorPaginatedQueryValidator.cs
+++ /dev/null
@@ -1,50 +0,0 @@
-using FluentValidation;
-
-namespace MainApi.Src.Lib;
-
-public class CursorPaginatedQueryValidator<T> : AbstractValidator<T> where T : CursorPaginatedQuery {
-	public CursorPaginatedQueryValidator() {
-		RuleFor(x => x.Cursor)
-			.Must(BeValidNullableString)
-			.WithMessage("Cursor must be a valid string");
-		RuleFor(x => x.Limit)
-			.Must(BeValidNullableNumber)
-			.WithMessage("Limit must be a valid number greater than or equal to 1");
-		RuleFor(x => x.SortId)
-			.Must(BeValidNullableString)
-			.WithMessage("SortId must be a valid string");
-		RuleFor(x => x.SortOrder)
-			.Must(BeValidNullableSort)
-			.WithMessage("SortOrder must equal 'asc' or 'desc'");
-	}
-	private static bool BeValidNullableString(string? value) { ... }
-	private static bool BeValidNullableSort(string? value) { ... }
-	private static bool BeValidNullableNumber(string? value) { ... }
-}

diff --git a/apps/api/Src/Lib/PaginatedQueryValidator.cs b/apps/api/Src/Lib/PaginatedQueryValidator.cs
deleted file mode 100644
--- a/apps/api/Src/Lib/PaginatedQueryValidator.cs
+++ /dev/null
@@ -1,51 +0,0 @@
-using FluentValidation;
-
-namespace MainApi.Src.Lib;
-
-public class PaginatedQueryValidator<T> : AbstractValidator<T> where T : PaginatedQuery {
-	public PaginatedQueryValidator() {
-		RuleFor(x => x.Page)
-			.Must(BeValidNullableNumber)
-			.WithMessage("Page must be a valid number greater than or equal to 1");
-		RuleFor(x => x.Limit)
-			.Must(BeValidNullableNumber)
-			.WithMessage("Limit must be a valid number greater than or equal to 1");
-		RuleFor(x => x.SortId)
-			.Must(BeValidNullableString)
-			.WithMessage("SortId must be a valid string");
-		RuleFor(x => x.SortOrder)
-			.Must(BeValidNullableSort)
-			.WithMessage("SortOrder must equal 'asc' or 'desc'");
-	}
-	private static bool BeValidNullableString(string? value) { ... }
-	private static bool BeValidNullableSort(string? value) { ... }
-	private static bool BeValidNullableNumber(string? value) { ... }
-}

diff --git a/apps/api/Src/Lib/Validation/CursorPaginatedQueryValidator.cs b/apps/api/Src/Lib/Validation/CursorPaginatedQueryValidator.cs
new file mode 100644
--- /dev/null
+++ b/apps/api/Src/Lib/Validation/CursorPaginatedQueryValidator.cs
@@ -0,0 +1,38 @@
+using FluentValidation;
+
+namespace MainApi.Src.Lib.Validation;
+
+public class CursorPaginatedQueryValidator<T>
+	: AbstractValidator<T>
+	where T : CursorPaginatedQuery {
+	public CursorPaginatedQueryValidator() {
+		RuleFor(x => x.Cursor)
+			.Must(PaginationPredicates
+				.BeValidNullableString)
+			.WithMessage(
+				"Cursor must be a valid string"
+			);
+		RuleFor(x => x.Limit)
+			.Must(PaginationPredicates
+				.BeValidNullableNumber)
+			.WithMessage(
+				"Limit must be a valid number "
+				+ "greater than or equal to 1"
+			);
+		RuleFor(x => x.SortId)
+			.Must(PaginationPredicates
+				.BeValidNullableString)
+			.WithMessage(
+				"SortId must be a valid string"
+			);
+		RuleFor(x => x.SortOrder)
+			.Must(PaginationPredicates
+				.BeValidNullableSort)
+			.WithMessage(
+				"SortOrder must equal 'asc' or 'desc'"
+			);
+	}
+}

diff --git a/apps/api/Src/Lib/Validation/EncryptedIdTokenQuery.cs b/apps/api/Src/Lib/Validation/EncryptedIdTokenQuery.cs
new file mode 100644
--- /dev/null
+++ b/apps/api/Src/Lib/Validation/EncryptedIdTokenQuery.cs
@@ -0,0 +1,28 @@
+using FluentValidation;
+
+using MainApi.Src.Lib.Utils;
+
+namespace MainApi.Src.Lib.Validation;
+
+public class EncryptedIdTokenQuery {
+	public required string Id { get; set; }
+	public required string Token { get; set; }
+}
+
+public class EncryptedIdTokenQueryValidator<T>
+	: AbstractValidator<T>
+	where T : EncryptedIdTokenQuery {
+	public EncryptedIdTokenQueryValidator() {
+		RuleFor(x => x.Id)
+			.NotEmpty()
+			.WithMessage("ID is required")
+			.Must(id =>
+				CryptoUtils.IsValidEncryptedString(id)
+			)
+			.WithMessage("Invalid ID format");
+		RuleFor(x => x.Token)
+			.NotEmpty()
+			.WithMessage("Token is required");
+	}
+}

diff --git a/apps/api/Src/Lib/Validation/JsonElementRules.cs b/apps/api/Src/Lib/Validation/JsonElementRules.cs
new file mode 100644
--- /dev/null
+++ b/apps/api/Src/Lib/Validation/JsonElementRules.cs
@@ -0,0 +1,326 @@
+using System.Text.Json;
+
+using FluentValidation;
+
+using MainApi.Src.Modules.Users.Entities;
+
+namespace MainApi.Src.Lib.Validation;
+
+public static class JsonElementRules {
+	public static IRuleBuilderOptions<T, JsonElement>
+		MustBeRequiredEmail<T>(
+			this IRuleBuilder<T, JsonElement> ruleBuilder
+	) {
+		return ruleBuilder
+			.NotEmpty()
+			.WithMessage("Email is required")
+			.Must(e => e.ValueKind == JsonValueKind.String)
+			.WithMessage("Email must be a string")
+			.Must(e => {
+				if (e.ValueKind != JsonValueKind.String) {
+					return false;
+				}
+				var email = e.GetString();
+				if (string.IsNullOrWhiteSpace(email)) {
+					return false;
+				}
+				return System.Net.Mail.MailAddress
+					.TryCreate(email, out _);
+			})
+			.WithMessage("Invalid email address");
+	}
+
+	public static IRuleBuilderOptions<T, JsonElement>
+		MustBeRequiredPassword<T>(
+			this IRuleBuilder<T, JsonElement> ruleBuilder
+	) {
+		var minLen = AppEnvironment
+			.Instance.PASSWORD_MIN_LENGTH;
+		return ruleBuilder
+			.NotEmpty()
+			.WithMessage("Password is required")
+			.Must(e => e.ValueKind == JsonValueKind.String)
+			.WithMessage("Password must be a string")
+			.Must(e => {
+				if (e.ValueKind != JsonValueKind.String) {
+					return false;
+				}
+				var str = e.GetString();
+				return str is not null
+					&& str.Length >= minLen;
+			})
+			.WithMessage(
+				"Password must be at least "
+				+ $"{minLen} characters long"
+			);
+	}
+
+	public static IRuleBuilderOptions<T, JsonElement>
+		MustBeRequiredString<T>(
+			this IRuleBuilder<T, JsonElement> ruleBuilder,
+			string fieldName
+	) {
+		return ruleBuilder
+			.NotEmpty()
+			.WithMessage($"{fieldName} is required")
+			.Must(e => e.ValueKind == JsonValueKind.String)
+			.WithMessage($"{fieldName} must be a string")
+			.Must(e => {
+				if (e.ValueKind != JsonValueKind.String) {
+					return false;
+				}
+				var str = e.GetString();
+				return !string.IsNullOrWhiteSpace(str);
+			})
+			.WithMessage(
+				$"{fieldName} must not be empty"
+			);
+	}
+
+	public static IRuleBuilderOptions<T, JsonElement?>
+		MustBeNullableString<T>(
+			this IRuleBuilder<T, JsonElement?> ruleBuilder,
+			string fieldName
+	) { ... }
+
+	public static IRuleBuilderOptions<T, JsonElement?>
+		MustBeNullableNonEmptyString<T>(
+			this IRuleBuilder<T, JsonElement?> ruleBuilder,
+			string fieldName
+	) { ... }
+
+	public static IRuleBuilderOptions<T, JsonElement?>
+		MustBeNullableUrl<T>(
+			this IRuleBuilder<T, JsonElement?> ruleBuilder,
+			string fieldName
+	) { ... }
+
+	public static IRuleBuilderOptions<T, JsonElement?>
+		MustBeNullableAccountLevel<T>(
+			this IRuleBuilder<T, JsonElement?> ruleBuilder
+	) { ... }
+
+	public static IRuleBuilderOptions<T, JsonElement?>
+		MustBeNullableBoolean<T>(
+			this IRuleBuilder<T, JsonElement?> ruleBuilder,
+			string fieldName
+	) { ... }
+
+	public static IRuleBuilderOptions<T, JsonElement?>
+		MustBeNullableEmail<T>(
+			this IRuleBuilder<T, JsonElement?> ruleBuilder
+	) { ... }
+
+	public static IRuleBuilderOptions<T, JsonElement?>
+		MustBeNullableUserStatus<T>(
+			this IRuleBuilder<T, JsonElement?> ruleBuilder
+	) { ... }
+
+	public static IRuleBuilderOptions<T, JsonElement>
+		MustBeRequiredEncryptedId<T>(
+			this IRuleBuilder<T, JsonElement> ruleBuilder
+	) { ... }
+}

diff --git a/apps/api/Src/Lib/Validation/PaginatedQueryValidator.cs b/apps/api/Src/Lib/Validation/PaginatedQueryValidator.cs
new file mode 100644
--- /dev/null
+++ b/apps/api/Src/Lib/Validation/PaginatedQueryValidator.cs
@@ -0,0 +1,38 @@
+using FluentValidation;
+
+namespace MainApi.Src.Lib.Validation;
+
+public class PaginatedQueryValidator<T>
+	: AbstractValidator<T> where T : PaginatedQuery {
+	public PaginatedQueryValidator() {
+		RuleFor(x => x.Page)
+			.Must(PaginationPredicates
+				.BeValidNullableNumber)
+			.WithMessage(
+				"Page must be a valid number "
+				+ "greater than or equal to 1"
+			);
+		RuleFor(x => x.Limit)
+			.Must(PaginationPredicates
+				.BeValidNullableNumber)
+			.WithMessage(
+				"Limit must be a valid number "
+				+ "greater than or equal to 1"
+			);
+		RuleFor(x => x.SortId)
+			.Must(PaginationPredicates
+				.BeValidNullableString)
+			.WithMessage(
+				"SortId must be a valid string"
+			);
+		RuleFor(x => x.SortOrder)
+			.Must(PaginationPredicates
+				.BeValidNullableSort)
+			.WithMessage(
+				"SortOrder must equal 'asc' or 'desc'"
+			);
+	}
+}

diff --git a/apps/api/Src/Lib/Validation/PaginationPredicates.cs b/apps/api/Src/Lib/Validation/PaginationPredicates.cs
new file mode 100644
--- /dev/null
+++ b/apps/api/Src/Lib/Validation/PaginationPredicates.cs
@@ -0,0 +1,43 @@
+namespace MainApi.Src.Lib.Validation;
+
+public static class PaginationPredicates {
+	public static bool BeValidNullableString(
+		string? value
+	) {
+		if (value is null) {
+			return true;
+		}
+		return !string.IsNullOrEmpty(value);
+	}
+
+	public static bool BeValidNullableSort(
+		string? value
+	) {
+		if (value is null) {
+			return true;
+		}
+		return (
+			value.Equals(
+				"asc",
+				StringComparison.OrdinalIgnoreCase
+			)
+			|| value.Equals(
+				"desc",
+				StringComparison.OrdinalIgnoreCase
+			)
+		);
+	}
+
+	public static bool BeValidNullableNumber(
+		string? value
+	) {
+		if (value is null) {
+			return true;
+		}
+		return int.TryParse(value, out var num)
+			&& num >= 1;
+	}
+}

diff --git a/apps/api/Src/Lib/Validation/QueryPredicates.cs b/apps/api/Src/Lib/Validation/QueryPredicates.cs
new file mode 100644
--- /dev/null
+++ b/apps/api/Src/Lib/Validation/QueryPredicates.cs
@@ -0,0 +1,83 @@
+using System.Globalization;
+
+namespace MainApi.Src.Lib.Validation;
+
+public static class QueryPredicates {
+	public static bool BeValidNullableGuid(
+		string? value
+	) {
+		if (value is null) {
+			return true;
+		}
+		return Guid.TryParse(value, out _);
+	}
+
+	public static bool BeValidNullableDate(
+		string? value
+	) {
+		if (value is null) {
+			return true;
+		}
+		return DateTime.TryParse(
+			value,
+			CultureInfo.InvariantCulture,
+			DateTimeStyles.RoundtripKind,
+			out _
+		);
+	}
+
+	public static bool BeValidDateRange(
+		string? startDate,
+		string? endDate
+	) {
+		if (startDate is null || endDate is null) {
+			return true;
+		}
+
+		var startParsed = DateTime.TryParse(
+			startDate,
+			CultureInfo.InvariantCulture,
+			DateTimeStyles.RoundtripKind,
+			out var start
+		);
+		var endParsed = DateTime.TryParse(
+			endDate,
+			CultureInfo.InvariantCulture,
+			DateTimeStyles.RoundtripKind,
+			out var end
+		);
+
+		if (!startParsed || !endParsed) {
+			return true;
+		}
+
+		return start <= end;
+	}
+
+	public static Guid? ParseNullableGuid(
+		string? value
+	) {
+		if (value is not null
+			&& Guid.TryParse(value, out var parsed)
+		) {
+			return parsed;
+		}
+		return null;
+	}
+
+	public static DateTime? ParseNullableDate(
+		string? value
+	) {
+		if (value is not null
+			&& DateTime.TryParse(
+				value,
+				CultureInfo.InvariantCulture,
+				DateTimeStyles.RoundtripKind,
+				out var parsed
+			)
+		) {
+			return parsed;
+		}
+		return null;
+	}
+}

diff --git a/apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs b/apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs
--- a/apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs
+++ b/apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs
@@ imports @@
-using System.Globalization;
+using MainApi.Src.Lib.Validation;

 public class ExportAuditLogsQuery {
 	[FromQuery] public string? Format { get; set; }
 	[FromQuery] public string? UserId { get; set; }
 	[FromQuery] public string? Action { get; set; }
 	[FromQuery] public string? TargetId { get; set; }
 	[FromQuery] public string? StartDate { get; set; }
 	[FromQuery] public string? EndDate { get; set; }
+
+	public string? GetFormat() {
+		return Format?.ToLowerInvariant();
+	}
+
+	public Guid? GetUserId() {
+		return QueryPredicates.ParseNullableGuid(UserId);
+	}
+
+	public Guid? GetTargetId() {
+		return QueryPredicates.ParseNullableGuid(TargetId);
+	}
+
+	public DateTime? GetStartDate() {
+		return QueryPredicates.ParseNullableDate(StartDate);
+	}
+
+	public DateTime? GetEndDate() {
+		return QueryPredicates.ParseNullableDate(EndDate);
+	}
 }

 public class ExportAuditLogsQueryValidator
 	: AbstractValidator<ExportAuditLogsQuery> {
 	public ExportAuditLogsQueryValidator() {
 		// Format validation unchanged (domain-specific)

 		RuleFor(x => x.UserId)
-			.Must(BeValidNullableGuid)
+			.Must(QueryPredicates.BeValidNullableGuid)
 			.WithMessage("UserId must be a valid GUID");

 		RuleFor(x => x.TargetId)
-			.Must(BeValidNullableGuid)
+			.Must(QueryPredicates.BeValidNullableGuid)
 			.WithMessage("TargetId must be a valid GUID");

 		RuleFor(x => x.StartDate)
-			.Must(BeValidNullableDate)
+			.Must(QueryPredicates.BeValidNullableDate)
 			.WithMessage("StartDate must be a valid ISO 8601 date");

 		RuleFor(x => x.EndDate)
-			.Must(BeValidNullableDate)
+			.Must(QueryPredicates.BeValidNullableDate)
 			.WithMessage("EndDate must be a valid ISO 8601 date");

 		RuleFor(x => x)
-			.Must(HaveValidDateRange)
+			.Must(q => QueryPredicates.BeValidDateRange(
+				q.StartDate, q.EndDate
+			))
 			.WithMessage("StartDate must be before or equal to EndDate")
 			.When(x =>
 				x.StartDate is not null
 				&& x.EndDate is not null
-				&& BeValidNullableDate(x.StartDate)
-				&& BeValidNullableDate(x.EndDate)
+				&& QueryPredicates.BeValidNullableDate(x.StartDate)
+				&& QueryPredicates.BeValidNullableDate(x.EndDate)
 			);
 	}
 	// BeValidFormat remains private (domain-specific)
-	// REMOVED: BeValidNullableGuid, BeValidNullableDate, HaveValidDateRange
 }

 // Handler changes:
-	var exportArgs = ParseExportArgs(query);
+	var exportArgs = new ExportAuditLogsArgs(
+		UserId: query.GetUserId(),
+		Action: query.Action,
+		TargetId: query.GetTargetId(),
+		StartDate: query.GetStartDate(),
+		EndDate: query.GetEndDate()
+	);

-	if (query.Format is null) { ... }
-	var format = query.Format.ToLowerInvariant();
+	var format = query.GetFormat();
+	if (format is null) { ... }

-	// REMOVED: ParseExportArgs() method (~50 lines)

diff --git a/apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs b/apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs
--- a/apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs
+++ b/apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs
@@ imports @@
-using System.Globalization;
+using MainApi.Src.Lib.Validation;

 public class FindAuditLogsQuery : CursorPaginatedQuery {
 	[FromQuery] public string? UserId { get; set; }
 	[FromQuery] public string? Action { get; set; }
 	[FromQuery] public string? TargetId { get; set; }
 	[FromQuery] public string? StartDate { get; set; }
 	[FromQuery] public string? EndDate { get; set; }
+
+	public Guid? GetUserId() {
+		return QueryPredicates.ParseNullableGuid(UserId);
+	}
+	public Guid? GetTargetId() {
+		return QueryPredicates.ParseNullableGuid(TargetId);
+	}
+	public DateTime? GetStartDate() {
+		return QueryPredicates.ParseNullableDate(StartDate);
+	}
+	public DateTime? GetEndDate() {
+		return QueryPredicates.ParseNullableDate(EndDate);
+	}
 }

 // Validator: same pattern as ExportAuditLogs — replaced private methods with QueryPredicates.*
-// REMOVED: BeValidNullableGuid, BeValidNullableDate, HaveValidDateRange (~50 lines)

 // Handler:
-	// REMOVED: 40 lines of inline Guid.TryParse / DateTime.TryParse
 	new FindAuditLogsArgs(
 		...
-		UserId: userId,
+		UserId: query.GetUserId(),
 		Action: query.Action,
-		TargetId: targetId,
-		StartDate: startDate,
-		EndDate: endDate
+		TargetId: query.GetTargetId(),
+		StartDate: query.GetStartDate(),
+		EndDate: query.GetEndDate()
 	)

diff --git a/apps/api/Src/Modules/Auth/Handlers/GetRedirectCode.cs b/apps/api/Src/Modules/Auth/Handlers/GetRedirectCode.cs
--- a/apps/api/Src/Modules/Auth/Handlers/GetRedirectCode.cs
+++ b/apps/api/Src/Modules/Auth/Handlers/GetRedirectCode.cs
 public class GetRedirectCodeQuery {
+	[FromQuery]
 	public string? TenantId { get; set; }
 	// GetTenantId() already existed — no change
 }

diff --git a/apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs b/apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs
--- a/apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs
+++ b/apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs
+using FluentValidation;

 public class GetTenantAuthDataQuery {
+	[FromQuery]
 	public string TenantId { get; set; } = string.Empty;
 	public Guid GetTenantId() {
-		return Guid.TryParse(TenantId, out var tenantId) ? tenantId : Guid.Empty;
+		return Guid.TryParse(
+			TenantId, out var tenantId
+		)
+			? tenantId
+			: Guid.Empty;
 	}
 }
+
+public class GetTenantAuthDataQueryValidator
+	: AbstractValidator<GetTenantAuthDataQuery> {
+	public GetTenantAuthDataQueryValidator() {
+		RuleFor(x => x.TenantId)
+			.NotEmpty()
+			.WithMessage("TenantId is required");
+	}
+}

diff --git a/apps/api/Src/Modules/Auth/Handlers/GetVerificationLink.cs b/apps/api/Src/Modules/Auth/Handlers/GetVerificationLink.cs
--- a/apps/api/Src/Modules/Auth/Handlers/GetVerificationLink.cs
+++ b/apps/api/Src/Modules/Auth/Handlers/GetVerificationLink.cs
 public class GetVerificationLinkQuery {
+	[FromQuery]
 	public string UserId { get; set; } = string.Empty;
 	// GetUserId() already existed — no change
 }

diff --git a/apps/api/Src/Modules/Permissions/Handlers/Staff/FindStaffPermissions.cs b/apps/api/Src/Modules/Permissions/Handlers/Staff/FindStaffPermissions.cs
--- a/apps/api/Src/Modules/Permissions/Handlers/Staff/FindStaffPermissions.cs
+++ b/apps/api/Src/Modules/Permissions/Handlers/Staff/FindStaffPermissions.cs
 public class FindStaffPermissionsQuery {
+	[FromQuery]
 	public string? Language { get; set; }
 	// GetLanguage() already existed — no change
 }

diff --git a/docs/guides/validator-conventions.md b/docs/guides/validator-conventions.md
new file mode 100644
--- /dev/null
+++ b/docs/guides/validator-conventions.md
@@ -0,0 +1,279 @@
+# Validator Conventions
+> Rules and patterns for FluentValidation validators in the PublyApp API.
+
+## Shared Validation Library (`Src/Lib/Validation/`)
+| File | Purpose |
+|------|---------|
+| `JsonElementRules.cs` | Extension methods for validating `JsonElement` body DTO fields |
+| `PaginationPredicates.cs` | Shared predicate methods used by pagination validators |
+| `QueryPredicates.cs` | Shared predicate + parse methods for query parameter validation (GUIDs, dates, date ranges) |
+| `PaginatedQueryValidator.cs` | Generic validator for offset-paginated query DTOs |
+| `CursorPaginatedQueryValidator.cs` | Generic validator for cursor-paginated query DTOs |
+| `EncryptedIdTokenQuery.cs` | Base class + generic validator for encrypted-ID + token query pairs |
+
+## Rule 1: Use `JsonElementRules` Extension Methods
+## Rule 2: Inherit Pagination Validators
+## Rule 3: Inherit `EncryptedIdTokenQuery` for Token-Check Endpoints
+## Rule 4: Validator Placement
+## Rule 5: Cross-Field Validation
+## Rule 6: Password Min Length Comes From Config
+## Rule 7: Query Parameter DTO Conventions
+### `[FromQuery]` on Every Property
+### Getter Methods for Type Conversion
+### Shared Predicates via `QueryPredicates`
+## Namespace & Import Conventions
```

**Note**: The diff above is abbreviated for readability. `JsonElementRules.cs` extension method bodies (nullable variants) follow the same pattern as the required variants shown — null/Null/Undefined pass, otherwise type-check + domain validation. The full bodies are in the actual file. The prior-refactoring changes (Auth, Invitations, Users, Tenants handler validators) replace inline `DependentRules` chains with the new `JsonElementRules` extensions.

---

## Expected Review Output Format

```
## Review: Fix Inconsistent Query Parameter DTOs

### 1. Functional Correctness
- [PASS/WARN/FAIL] ...

### 2. Behavioral Equivalence
- [PASS/WARN/FAIL] ...

### 3. Coding Standards Compliance
- [PASS/WARN/FAIL] ...

### 4. Architecture & Design
- [PASS/WARN/FAIL] ...

### 5. FluentValidation Patterns
- [PASS/WARN/FAIL] ...

### 6. Security
- [PASS/WARN/FAIL] ...

### 7. Documentation Quality
- [PASS/WARN/FAIL] ...

### 8. Test Impact
- [PASS/WARN/FAIL] ...

### 9. Completeness
- [PASS/WARN/FAIL] ...

### 10. Dead Code & Cleanup
- [PASS/WARN/FAIL] ...

### Verdict: [APPROVE / REQUEST CHANGES / COMMENT]

### Action Items (prioritized)
1. ...
2. ...
```
