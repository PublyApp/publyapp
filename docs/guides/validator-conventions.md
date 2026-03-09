# Validator Conventions

> Rules and patterns for FluentValidation validators in the PublyApp API.

## Shared Validation Library (`Src/Lib/Validation/`)

All reusable validation code lives in `apps/api/Src/Lib/Validation/`. This directory contains:

| File | Purpose |
|------|---------|
| `JsonElementRules.cs` | Extension methods for validating `JsonElement` body DTO fields |
| `PaginationPredicates.cs` | Shared predicate methods used by pagination validators |
| `QueryPredicates.cs` | Shared predicate + parse methods for query parameter validation (GUIDs, dates, date ranges) |
| `OffsetPaginatedQueryValidator.cs` | Generic validator for offset-paginated query DTOs |
| `CursorPaginatedQueryValidator.cs` | Generic validator for cursor-paginated query DTOs |
| `EncryptedIdTokenQuery.cs` | Base class + generic validator for encrypted-ID + token query pairs |

## Rule 1: Use `JsonElementRules` Extension Methods

**Never write inline `DependentRules` chains for common field types.** Use the shared extension methods instead.

### Available Extensions (Required Fields)

| Method | Use when |
|--------|----------|
| `MustBeRequiredEmail()` | Required email field |
| `MustBeRequiredPassword()` | Required password field (min length from `AppEnvironment`) |
| `MustBeRequiredString("FieldName")` | Required non-empty string |
| `MustBeRequiredEncryptedId()` | Required encrypted ID (e.g., email verification) |

### Available Extensions (Nullable/Optional Fields)

| Method | Use when |
|--------|----------|
| `MustBeNullableString("FieldName")` | Optional string (wrapper-null or JSON null OK) |
| `MustBeNullableNonEmptyString("FieldName")` | Optional string that must be non-empty when present |
| `MustBeNullableUrl("FieldName")` | Optional http(s) URL |
| `MustBeNullableEmail()` | Optional email for update/patch |
| `MustBeNullableBoolean("FieldName")` | Optional boolean |

### Examples

```csharp
// ✅ CORRECT - Use shared extension methods
public class CreateUserBodyValidator
    : AbstractValidator<CreateUserBody> {
    public CreateUserBodyValidator() {
        RuleFor(x => x.Email)
            .MustBeRequiredEmail();

        RuleFor(x => x.Password)
            .MustBeRequiredPassword();

        RuleFor(x => x.FirstName)
            .MustBeRequiredString("FirstName");
    }
}

// ❌ WRONG - Inline validation chain (duplicates JsonElementRules logic)
public class CreateUserBodyValidator
    : AbstractValidator<CreateUserBody> {
    public CreateUserBodyValidator() {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email is required")
            .Must(e => e.ValueKind == JsonValueKind.String)
            .WithMessage("Email must be a string")
            .Must(e => {
                var email = e.GetString();
                return MailAddress.TryCreate(email, out _);
            })
            .WithMessage("Invalid email address");
    }
}
```

### When to Add New Extension Methods

If you find yourself writing the same validation chain in 2+ validators, extract it into `JsonElementRules.cs`. Follow the existing pattern:

1. Method name: `MustBeRequired{Type}` or `MustBeNullable{Type}`
2. Return type: `IRuleBuilderOptions<T, JsonElement>` (required) or `IRuleBuilderOptions<T, JsonElement?>` (nullable)
3. Chain: `NotEmpty` (for required) -> `Must(ValueKind check)` -> `Must(domain validation)`
4. Each step has a clear `.WithMessage()`

### Domain-Specific Validation Rules

Validators that depend on domain entities (e.g., parsing enum values via entity methods) must **not** live in `Src/Lib/Validation/` — that would create a Lib→Module dependency. Instead, place them in the domain module's `Validation/` folder.

| File | Methods | Used by |
|------|---------|---------|
| `Modules/Users/Validation/UserValidationRules.cs` | `MustBeNullableAccountLevel()`, `MustBeNullableUserStatus()` | User create/update handlers |

Follow the same naming and signature conventions as `JsonElementRules` — the only difference is the file location.

## Rule 2: Inherit Pagination Validators

**Never write pagination validation rules from scratch.** Inherit from the shared generic validators.

```csharp
// ✅ CORRECT - Inherit base pagination validator
public class FindUsersQuery : OffsetPaginatedQuery { }
public class FindUsersQueryValidator
    : OffsetPaginatedQueryValidator<FindUsersQuery> { }

// ✅ CORRECT - Cursor pagination with extra rules
public class FindAuditLogsQuery : CursorPaginatedQuery {
    [FromQuery] public string? UserId { get; set; }
}
public class FindAuditLogsQueryValidator
    : CursorPaginatedQueryValidator<FindAuditLogsQuery> {
    public FindAuditLogsQueryValidator() {
        // Base class validates Cursor, Limit, SortId, SortOrder
        // Only add domain-specific rules here
        RuleFor(x => x.UserId)
            .Must(PaginationPredicates.BeValidNullableString)
            .WithMessage("UserId must be a valid string");
    }
}

// ❌ WRONG - Rewriting pagination rules manually
public class FindUsersQueryValidator
    : AbstractValidator<FindUsersQuery> {
    public FindUsersQueryValidator() {
        RuleFor(x => x.Page).Must(...);
        RuleFor(x => x.Limit).Must(...);
        // Duplicates OffsetPaginatedQueryValidator logic
    }
}
```

### PaginationPredicates

When adding custom query parameter rules to a paginated validator, reuse `PaginationPredicates` for common checks:

| Method | Use when |
|--------|----------|
| `BeValidNullableString` | Optional string query param (null OK, empty not OK) |
| `BeValidNullableSort` | Optional sort direction (`"asc"` or `"desc"`) |
| `BeValidNullableNumber` | Optional positive integer query param |

## Rule 3: Inherit `EncryptedIdTokenQuery` for Token-Check Endpoints

Endpoints that accept an encrypted ID + token pair (e.g., email verification, password reset, invitation check) must inherit from the shared base class and validator.

```csharp
// ✅ CORRECT - Inherit shared base
public class CheckResetPasswordTokenQuery
    : EncryptedIdTokenQuery { }

public class CheckResetPasswordTokenQueryValidator
    : EncryptedIdTokenQueryValidator<
        CheckResetPasswordTokenQuery
    > { }

// ❌ WRONG - Duplicate ID + Token validation
public class CheckResetPasswordTokenQuery {
    public required string Id { get; set; }
    public required string Token { get; set; }
}
public class CheckResetPasswordTokenQueryValidator
    : AbstractValidator<CheckResetPasswordTokenQuery> {
    public CheckResetPasswordTokenQueryValidator() {
        RuleFor(x => x.Id)
            .NotEmpty()
            .Must(CryptoUtils.IsValidEncryptedString);
        RuleFor(x => x.Token).NotEmpty();
    }
}
```

## Rule 4: Validator Placement

- **Body validators**: co-located in the handler file, next to the body DTO record
- **Query validators**: co-located in the handler file, next to the query class
- **Shared/reusable validators**: `Src/Lib/Validation/`
- **Never** create a separate `Validators/` folder inside a module

## Rule 5: Cross-Field Validation

When validation depends on multiple fields (e.g., password confirmation), keep it in the handler-local validator after the shared extension calls:

```csharp
public class ResetPasswordBodyValidator
    : AbstractValidator<ResetPasswordBody> {
    public ResetPasswordBodyValidator() {
        // Use shared extensions for individual fields
        RuleFor(x => x.NewPassword)
            .MustBeRequiredPassword();
        RuleFor(x => x.ConfirmPassword)
            .MustBeRequiredString("Confirm password");

        // Cross-field rule stays local
        RuleFor(x => x)
            .Must(body => {
                if (
                    body.NewPassword.ValueKind
                        == JsonValueKind.String
                    && body.ConfirmPassword.ValueKind
                        == JsonValueKind.String
                ) {
                    return body.GetNewPassword()
                        == body.GetConfirmPassword();
                }
                return true;
            })
            .WithMessage("Passwords are not the same")
            .WithName("ConfirmPassword");
    }
}
```

## Rule 6: Password Min Length Comes From Config

Password validation uses `AppEnvironment.Instance.PASSWORD_MIN_LENGTH`. **Never hardcode** a minimum password length in a validator. The `MustBeRequiredPassword()` extension handles this automatically.

## Rule 7: Query Parameter DTO Conventions

### `[FromQuery]` on Every Property

All query parameter DTO properties must have the `[FromQuery]` attribute. This makes binding explicit and consistent across standalone queries and base-class-inherited queries (`OffsetPaginatedQuery`, `CursorPaginatedQuery`).

```csharp
// ✅ CORRECT
public class FindStaffPermissionsQuery {
    [FromQuery]
    public string? Language { get; set; }
}

// ❌ WRONG - missing [FromQuery]
public class FindStaffPermissionsQuery {
    public string? Language { get; set; }
}
```

### Getter Methods for Type Conversion

Custom query properties that require type conversion (string to `Guid?`, `DateTime?`, etc.) must have getter methods on the query DTO itself. Handlers call these getters instead of doing inline parsing.

```csharp
// ✅ CORRECT - getter on the DTO, handler calls it
public class FindAuditLogsQuery : CursorPaginatedQuery {
    [FromQuery] public string? UserId { get; set; }

    public Guid? GetUserId() {
        return QueryPredicates.ParseNullableGuid(UserId);
    }
}

// ❌ WRONG - inline parsing in handler
Guid? userId = null;
if (query.UserId is not null) {
    if (Guid.TryParse(query.UserId, out var parsed)) {
        userId = parsed;
    }
}
```

### Shared Predicates via `QueryPredicates`

Common validation predicates for query parameters live in `Src/Lib/Validation/QueryPredicates.cs`. Use these instead of duplicating private methods in each validator.

| Method | Use when |
|--------|----------|
| `BeValidNullableGuid(string?)` | Optional GUID query param (null OK, otherwise must parse) |
| `BeValidNullableDate(string?)` | Optional ISO 8601 date (null OK, otherwise must parse with InvariantCulture + RoundtripKind) |
| `BeValidDateRange(string?, string?)` | Cross-field date range validation (null OK for either, otherwise start <= end) |
| `ParseNullableGuid(string?)` | Parse string to `Guid?` (returns null if input is null or unparseable) |
| `ParseNullableDate(string?)` | Parse string to `DateTime?` (returns null if input is null or unparseable) |

```csharp
// ✅ CORRECT - use shared predicates
RuleFor(x => x.UserId)
    .Must(QueryPredicates.BeValidNullableGuid)
    .WithMessage("UserId must be a valid GUID");

// ❌ WRONG - duplicate private method
private static bool BeValidNullableGuid(string? value) {
    if (value is null) { return true; }
    return Guid.TryParse(value, out _);
}
```

## Rule 8: CSV Enum List Filters (Multi-Select Query Params)

For list pages, multi-select enum-like filters should be passed as a **comma-separated string** of **lowercase tokens** (e.g., `status=active,pending`).

Conventions:
- Empty/whitespace means “no filter”.
- Validate the raw string (and every token) in the query validator.
- Parse into a set (`IReadOnlySet<TEnum>`) in a query DTO getter.
- Prefer lowercase tokens end-to-end for URL/API consistency.

Example shape (handler-local):

```csharp
public class FindTenantsQuery : CursorPaginatedQuery {
	[FromQuery] public string? Status { get; set; }

	public IReadOnlySet<TenantStatus>? GetStatusesOrNull() {
		if (string.IsNullOrWhiteSpace(Status)) {
			return null;
		}

		var parts = Status.Split(',',
			StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
		if (parts.Length == 0) {
			return null;
		}

		var statuses = new HashSet<TenantStatus>();
		foreach (var part in parts) {
			var parsed = Tenant.ParseStatus(part);

			if (parsed is { } status) {
				statuses.Add(status);
			}
		}

		return statuses.Count > 0 ? statuses : null;
	}
}

public class FindTenantsQueryValidator : CursorPaginatedQueryValidator<FindTenantsQuery> {
	private static readonly HashSet<string> Allowed =
		new(["active", "pending", "suspended", "archived"], StringComparer.OrdinalIgnoreCase);

	public FindTenantsQueryValidator() {
		RuleFor(x => x.Status)
			.Must(raw => {
				if (string.IsNullOrEmpty(raw)) return true;
				var parts = raw.Split(',',
					StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
				return parts.All(p => Allowed.Contains(p));
			})
			.WithMessage("Status must be comma-separated: active,pending,suspended,archived")
			.When(x => !string.IsNullOrEmpty(x.Status));
	}
}
```

## Namespace & Import Conventions

- Shared validation classes live in `namespace MainApi.Src.Lib.Validation;`
- Handlers using shared validators must add: `using MainApi.Src.Lib.Validation;`
- Base query types (`OffsetPaginatedQuery`, `CursorPaginatedQuery`) remain in `namespace MainApi.Src.Lib;`
