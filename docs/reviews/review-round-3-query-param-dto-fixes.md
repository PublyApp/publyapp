# Round 3 Review: Fix Inconsistent Query Parameter DTOs

Hey again — round 3! Your round 2 feedback had 4 action items and several WARNs. We've addressed all of them. Here's what changed since your last review.

## What We Fixed Based on Your Round 2 Findings

| # | Your Finding (Severity) | What We Did |
|---|------------------------|-------------|
| 1 | `JsonElementRules.Spec.cs` — AppEnvironment not initialized, all 16 tests fail (HIGH) | Fixed — added `static JsonElementRulesSpec()` constructor that calls `AppEnvironment.Initialize()` (idempotent, loads `.env.development`). Also split the monolithic `TestValidator` into 9 focused per-concern validators so each test only constructs the rule it exercises. |
| 2 | Missing tests for round 1 fixes: `JsonValueKind.Null` boolean, `UserValidationRules` (HIGH) | Fixed — added `ItShouldPassNullableBooleanWhenJsonNull` test. Created `UserValidationRules.Spec.cs` with 10 tests covering `MustBeNullableAccountLevel` and `MustBeNullableUserStatus` (valid values, invalid, null, JsonNull, wrong type). |
| 3 | `validator-conventions.md` stale — still lists `MustBeNullableAccountLevel`/`MustBeNullableUserStatus` under `JsonElementRules` (MEDIUM) | Fixed — removed those two rows from the JsonElementRules table, added a new "Domain-Specific Validation Rules" subsection pointing to `Modules/Users/Validation/UserValidationRules.cs`. |
| 4 | Formatting nits: `CreateStaffUser.cs` import ordering, `CheckEmailVerificationToken.cs` `.AddDays()` indentation (LOW) | Fixed — reordered imports to alphabetical (`Entities` → `Services` → `Validation`), fixed `.AddDays()` continuation to use proper indentation (argument +1 tab, closing paren aligned with statement). |
| W1 | Missing test cases in `JsonElementRules.Spec.cs`: RequiredString, NullableEmail, RequiredEncryptedId (WARN) | Fixed — added RequiredString (4 tests: valid, empty, whitespace, wrong type), NullableEmail (4 tests: valid, null, JsonNull, invalid), RequiredEncryptedId (3 tests: valid encrypted string, empty, invalid). |
| W2 | `QueryPredicates.Spec.cs` naming doesn't follow `ItShould{Expected}When{Scenario}` (WARN) | Fixed — renamed all methods. Theory methods now use `WhenGivenInput` suffix. Fact methods use descriptive `When` clauses: `ItShouldPassDateRangeWhenStartLessThanEnd`, `ItShouldReturnNullGuidWhenWhitespace`, etc. |
| W3 | Missing boundary tests in `QueryPredicates.Spec.cs` (WARN) | Fixed — added one-null-side date range tests (`WhenOnlyStartNull`, `WhenOnlyEndNull`), plus null/empty/whitespace boundary tests for both `ParseNullableGuid` and `ParseNullableDate`. |
| W4 | Password test uses hardcoded `"password123"` (WARN) | Fixed — now reads `AppEnvironment.Instance.PASSWORD_MIN_LENGTH` and generates `new string('a', minLen)` dynamically. |

## Test Coverage Summary (After Round 2 Fixes)

| Spec File | Tests | Coverage |
|-----------|-------|----------|
| `JsonElementRules.Spec.cs` | 32 | All 9 extension methods: RequiredEmail (3), RequiredPassword (3), RequiredString (4), NullableString (4), NullableNonEmptyString (3), NullableUrl (3), NullableBoolean (5 incl. JsonNull+false), NullableEmail (4), RequiredEncryptedId (3) |
| `QueryPredicates.Spec.cs` | 17 | All 5 methods: BeValidNullableGuid (Theory/4), BeValidNullableDate (Theory/5), BeValidDateRange (5 incl. one-null-side), ParseNullableGuid (5 incl. null/empty/whitespace), ParseNullableDate (5 incl. null/empty/whitespace) |
| `UserValidationRules.Spec.cs` | 10 | Both methods: MustBeNullableAccountLevel (5), MustBeNullableUserStatus (5) |
| **Total** | **59** | |

## What I'd Like You to Focus On

This is hopefully the final pass. The core refactoring hasn't changed since round 1 — all round 2 work was test infrastructure, naming, formatting, and docs. So please focus on:

1. **Do the test files actually work?** — The `static JsonElementRulesSpec()` constructor initializes AppEnvironment by loading `.env.development`. Is that approach sound, or will it break in CI/other environments?
2. **Test quality** — are the 59 tests meaningful? Any gaps, redundancies, or false-green risks?
3. **Validator split** — we went from 1 monolithic `TestValidator` to 9 focused ones. Is the split clean, or did we over-engineer it?
4. **Naming conventions** — do the test method names now follow `ItShould{Expected}When{Scenario}` consistently?
5. **Docs accuracy** — does `validator-conventions.md` accurately reflect the current codebase state?
6. **Formatting nits** — anything left that violates the 100-char max line length or tab indentation rules?

If everything looks good, a simple APPROVE with any optional suggestions is great. If you spot issues, tag them with severity as before.

---

## Project Context (unchanged)

- **Stack**: .NET 9.0 (.NET 10 preview SDK), Minimal APIs, FluentValidation, EF Core, PostgreSQL
- **Architecture**: Vertical Slice (domain-first modules), CQRS-lite handlers
- **Query binding**: `[AsParameters]` with `[FromQuery]` on each property
- **Validation**: FluentValidation auto-wired via endpoint extensions
- **Error format**: RFC 7807 `application/problem+json` via `TypedProblems.*`
- **Namespace rule**: `IDE0130` is error — file namespace must match folder path
- **Line length**: max 100 chars, tab indentation
- **Null checks**: pattern matching (`is null` / `is not null`), never `== null`
- **Guard clauses**: flat `if`/early return, no `?? throw`, no null-forgiving `!`
- **Test convention**: `*.Spec.cs` co-located with source, `ItShould{Expected}When{Scenario}` naming, excluded from main build, included in test project
- **Architecture rule**: `Src/Lib/` must NOT depend on `Src/Modules/*`

## Build Status

```
Build succeeded.
    0 Warning(s)
    0 Error(s)
```

Both main project and test project compile cleanly.

---

## Review Criteria

Use this checklist and tag each as PASS / FAIL / WARN:

| # | Criterion |
|---|-----------|
| 1 | AppEnvironment initialization in `JsonElementRules.Spec.cs` — will `static` constructor + `AppEnvironment.Initialize()` work reliably in all test runner scenarios? |
| 2 | Per-concern validator split — models and validators are correctly scoped, no leakage between concerns? |
| 3 | Test method naming — all follow `ItShould{Expected}When{Scenario}` consistently? |
| 4 | Test coverage — each extension method has positive, negative, and null/boundary cases? |
| 5 | `UserValidationRules.Spec.cs` — correct namespace, entity parsing tested with valid enum values? |
| 6 | `QueryPredicates.Spec.cs` — boundary cases covered (null, empty, whitespace, one-null-side range)? |
| 7 | `validator-conventions.md` — accurately reflects current code (no stale references)? |
| 8 | Import ordering — alphabetical within groups across all modified files? |
| 9 | Indentation / line length — no lines > 100 chars, consistent tab usage? |
| 10 | No regressions — round 2 fixes didn't break anything from round 1? |

## Response Format

```
## Verdict: APPROVE | REQUEST CHANGES

### Checklist
| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | ... | PASS/FAIL/WARN | ... |

### Action Items (if REQUEST CHANGES)
[SEVERITY] Description + file:line reference

### Optional Suggestions (if APPROVE)
Things that could be better but aren't blocking.
```

---

## Delta Diff (Round 2 → Round 3)

These are the files that changed since your round 2 review. The rest of the changeset is identical to what you already reviewed.

### `apps/api/Src/Lib/Validation/JsonElementRules.Spec.cs` (rewritten — 522 lines)

```csharp
using System.Text.Json;

using FluentAssertions;

using FluentValidation;

using Xunit;

namespace MainApi.Src.Lib.Validation;

public sealed class JsonElementRulesSpec {
	/// <summary>
	/// MustBeRequiredPassword accesses AppEnvironment.Instance
	/// at construction time (PASSWORD_MIN_LENGTH). This static
	/// constructor initialises AppEnvironment once for the
	/// entire test class. Idempotent — safe when the
	/// integration-test suite has already called Initialize().
	/// </summary>
	static JsonElementRulesSpec() {
		AppEnvironment.Initialize();
	}

	// ----- models -----

	private class EmailModel {
		public JsonElement RequiredEmail { get; set; }
	}

	private class PasswordModel {
		public JsonElement RequiredPassword { get; set; }
	}

	private class RequiredStringModel {
		public JsonElement RequiredString { get; set; }
	}

	private class NullableStringModel {
		public JsonElement? NullableString { get; set; }
	}

	private class NullableNonEmptyStringModel {
		public JsonElement? Value { get; set; }
	}

	private class NullableUrlModel {
		public JsonElement? NullableUrl { get; set; }
	}

	private class NullableBooleanModel {
		public JsonElement? NullableBoolean { get; set; }
	}

	private class NullableEmailModel {
		public JsonElement? NullableEmail { get; set; }
	}

	private class EncryptedIdModel {
		public JsonElement RequiredEncryptedId { get; set; }
	}

	// ----- validators (one per concern) -----

	private class EmailValidator
		: AbstractValidator<EmailModel> {
		public EmailValidator() {
			RuleFor(x => x.RequiredEmail)
				.MustBeRequiredEmail();
		}
	}

	private class PasswordValidator
		: AbstractValidator<PasswordModel> {
		public PasswordValidator() {
			RuleFor(x => x.RequiredPassword)
				.MustBeRequiredPassword();
		}
	}

	private class RequiredStringValidator
		: AbstractValidator<RequiredStringModel> {
		public RequiredStringValidator() {
			RuleFor(x => x.RequiredString)
				.MustBeRequiredString("TestField");
		}
	}

	private class NullableStringValidator
		: AbstractValidator<NullableStringModel> {
		public NullableStringValidator() {
			RuleFor(x => x.NullableString)
				.MustBeNullableString("TestField");
		}
	}

	private class NullableNonEmptyStringValidator
		: AbstractValidator<NullableNonEmptyStringModel> {
		public NullableNonEmptyStringValidator() {
			RuleFor(x => x.Value)
				.MustBeNullableNonEmptyString(
					"TestField"
				);
		}
	}

	private class NullableUrlValidator
		: AbstractValidator<NullableUrlModel> {
		public NullableUrlValidator() {
			RuleFor(x => x.NullableUrl)
				.MustBeNullableUrl("TestField");
		}
	}

	private class NullableBooleanValidator
		: AbstractValidator<NullableBooleanModel> {
		public NullableBooleanValidator() {
			RuleFor(x => x.NullableBoolean)
				.MustBeNullableBoolean("TestField");
		}
	}

	private class NullableEmailValidator
		: AbstractValidator<NullableEmailModel> {
		public NullableEmailValidator() {
			RuleFor(x => x.NullableEmail)
				.MustBeNullableEmail();
		}
	}

	private class EncryptedIdValidator
		: AbstractValidator<EncryptedIdModel> {
		public EncryptedIdValidator() {
			RuleFor(x => x.RequiredEncryptedId)
				.MustBeRequiredEncryptedId();
		}
	}

	// ==================== RequiredEmail ====================

	[Fact]
	public void ItShouldPassRequiredEmailWhenValid() {
		var email = JsonSerializer
			.SerializeToElement("test@example.com");
		var model = new EmailModel {
			RequiredEmail = email,
		};
		var result = new EmailValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailRequiredEmailWhenEmpty() {
		var model = new EmailModel {
			RequiredEmail = default,
		};
		var result = new EmailValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
		_ = result.Errors.Should()
			.Contain(
				e => e.ErrorMessage.Contains("required")
			);
	}

	[Fact]
	public void ItShouldFailRequiredEmailWhenInvalidFormat() {
		var email = JsonSerializer
			.SerializeToElement("not-an-email");
		var model = new EmailModel {
			RequiredEmail = email,
		};
		var result = new EmailValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ==================== RequiredPassword ====================

	[Fact]
	public void ItShouldPassRequiredPasswordWhenMeetsMinLength() {
		var minLen = AppEnvironment
			.Instance.PASSWORD_MIN_LENGTH;
		var pwd = JsonSerializer
			.SerializeToElement(
				new string('a', minLen)
			);
		var model = new PasswordModel {
			RequiredPassword = pwd,
		};
		var result = new PasswordValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailRequiredPasswordWhenBelowMinLength() {
		var pwd = JsonSerializer
			.SerializeToElement("abc");
		var model = new PasswordModel {
			RequiredPassword = pwd,
		};
		var result = new PasswordValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailRequiredPasswordWhenEmpty() {
		var model = new PasswordModel {
			RequiredPassword = default,
		};
		var result = new PasswordValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ==================== RequiredString ====================

	[Fact]
	public void ItShouldPassRequiredStringWhenNonEmpty() {
		var str = JsonSerializer
			.SerializeToElement("hello");
		var model = new RequiredStringModel {
			RequiredString = str,
		};
		var result = new RequiredStringValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailRequiredStringWhenEmpty() {
		var model = new RequiredStringModel {
			RequiredString = default,
		};
		var result = new RequiredStringValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailRequiredStringWhenWhitespace() {
		var str = JsonSerializer
			.SerializeToElement("   ");
		var model = new RequiredStringModel {
			RequiredString = str,
		};
		var result = new RequiredStringValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailRequiredStringWhenWrongType() {
		var num = JsonSerializer.SerializeToElement(42);
		var model = new RequiredStringModel {
			RequiredString = num,
		};
		var result = new RequiredStringValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ==================== NullableString ====================

	[Fact]
	public void ItShouldPassNullableStringWhenNull() {
		var model = new NullableStringModel {
			NullableString = null,
		};
		var result = new NullableStringValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableStringWhenJsonNull() {
		var model = new NullableStringModel {
			NullableString = JsonDocument
				.Parse("null").RootElement,
		};
		var result = new NullableStringValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableStringWhenValidString() {
		var str = JsonSerializer
			.SerializeToElement("hello");
		var model = new NullableStringModel {
			NullableString = str,
		};
		var result = new NullableStringValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailNullableStringWhenWrongType() {
		var num = JsonSerializer.SerializeToElement(42);
		var model = new NullableStringModel {
			NullableString = num,
		};
		var result = new NullableStringValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ============== NullableNonEmptyString ==============

	[Fact]
	public void ItShouldPassNullableNonEmptyStringWhenValid() {
		var str = JsonSerializer
			.SerializeToElement("hello");
		var model = new NullableNonEmptyStringModel {
			Value = str,
		};
		var result = new NullableNonEmptyStringValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailNullableNonEmptyStringWhenEmpty() {
		var str = JsonSerializer
			.SerializeToElement("");
		var model = new NullableNonEmptyStringModel {
			Value = str,
		};
		var result = new NullableNonEmptyStringValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldPassNullableNonEmptyStringWhenNull() {
		var model = new NullableNonEmptyStringModel {
			Value = null,
		};
		var result = new NullableNonEmptyStringValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	// ==================== NullableUrl ====================

	[Fact]
	public void ItShouldPassNullableUrlWhenValidHttp() {
		var url = JsonSerializer
			.SerializeToElement("https://example.com");
		var model = new NullableUrlModel {
			NullableUrl = url,
		};
		var result = new NullableUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailNullableUrlWhenInvalid() {
		var url = JsonSerializer
			.SerializeToElement("not a url");
		var model = new NullableUrlModel {
			NullableUrl = url,
		};
		var result = new NullableUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldPassNullableUrlWhenNull() {
		var model = new NullableUrlModel {
			NullableUrl = null,
		};
		var result = new NullableUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	// ==================== NullableBoolean ====================

	[Fact]
	public void ItShouldPassNullableBooleanWhenTrue() {
		var val = JsonSerializer
			.SerializeToElement(true);
		var model = new NullableBooleanModel {
			NullableBoolean = val,
		};
		var result = new NullableBooleanValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableBooleanWhenFalse() {
		var val = JsonSerializer
			.SerializeToElement(false);
		var model = new NullableBooleanModel {
			NullableBoolean = val,
		};
		var result = new NullableBooleanValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableBooleanWhenNull() {
		var model = new NullableBooleanModel {
			NullableBoolean = null,
		};
		var result = new NullableBooleanValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableBooleanWhenJsonNull() {
		var model = new NullableBooleanModel {
			NullableBoolean = JsonDocument
				.Parse("null").RootElement,
		};
		var result = new NullableBooleanValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailNullableBooleanWhenWrongType() {
		var str = JsonSerializer
			.SerializeToElement("true");
		var model = new NullableBooleanModel {
			NullableBoolean = str,
		};
		var result = new NullableBooleanValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ==================== NullableEmail ====================

	[Fact]
	public void ItShouldPassNullableEmailWhenValid() {
		var email = JsonSerializer
			.SerializeToElement("test@example.com");
		var model = new NullableEmailModel {
			NullableEmail = email,
		};
		var result = new NullableEmailValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableEmailWhenNull() {
		var model = new NullableEmailModel {
			NullableEmail = null,
		};
		var result = new NullableEmailValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableEmailWhenJsonNull() {
		var model = new NullableEmailModel {
			NullableEmail = JsonDocument
				.Parse("null").RootElement,
		};
		var result = new NullableEmailValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailNullableEmailWhenInvalid() {
		var email = JsonSerializer
			.SerializeToElement("not-an-email");
		var model = new NullableEmailModel {
			NullableEmail = email,
		};
		var result = new NullableEmailValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ================= RequiredEncryptedId =================

	[Fact]
	public void ItShouldPassRequiredEncryptedIdWhenValid() {
		var encrypted = Utils.CryptoUtils
			.EncryptString("test-value");
		var el = JsonSerializer
			.SerializeToElement(encrypted);
		var model = new EncryptedIdModel {
			RequiredEncryptedId = el,
		};
		var result = new EncryptedIdValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailRequiredEncryptedIdWhenEmpty() {
		var model = new EncryptedIdModel {
			RequiredEncryptedId = default,
		};
		var result = new EncryptedIdValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailRequiredEncryptedIdWhenInvalid() {
		var el = JsonSerializer
			.SerializeToElement("not-encrypted");
		var model = new EncryptedIdModel {
			RequiredEncryptedId = el,
		};
		var result = new EncryptedIdValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}
}
```

### `apps/api/Src/Lib/Validation/QueryPredicates.Spec.cs` (rewritten — 165 lines)

```csharp
using FluentAssertions;

using Xunit;

namespace MainApi.Src.Lib.Validation;

public sealed class QueryPredicatesSpec {
	// ============== BeValidNullableGuid ==============

	[Theory]
	[InlineData(
		"550e8400-e29b-41d4-a716-446655440000", true
	)]
	[InlineData("invalid-guid", false)]
	[InlineData("", false)]
	[InlineData(null, true)]
	public void ItShouldValidateNullableGuidWhenGivenInput(
		string? value, bool expected
	) {
		var result = QueryPredicates
			.BeValidNullableGuid(value);
		_ = result.Should().Be(expected);
	}

	// ============== BeValidNullableDate ==============

	[Theory]
	[InlineData("2026-02-22T10:00:00Z", true)]
	[InlineData("2026-02-22T10:00:00+02:00", true)]
	[InlineData("invalid-date", false)]
	[InlineData("", false)]
	[InlineData(null, true)]
	public void ItShouldValidateNullableDateWhenGivenInput(
		string? value, bool expected
	) {
		var result = QueryPredicates
			.BeValidNullableDate(value);
		_ = result.Should().Be(expected);
	}

	// ============== BeValidDateRange ==============

	[Fact]
	public void ItShouldPassDateRangeWhenStartLessThanEnd() {
		var result = QueryPredicates.BeValidDateRange(
			"2026-02-01T00:00:00Z",
			"2026-02-28T00:00:00Z"
		);
		_ = result.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailDateRangeWhenStartGreaterThanEnd() {
		var result = QueryPredicates.BeValidDateRange(
			"2026-02-28T00:00:00Z",
			"2026-02-01T00:00:00Z"
		);
		_ = result.Should().BeFalse();
	}

	[Fact]
	public void ItShouldPassDateRangeWhenBothNull() {
		var result = QueryPredicates
			.BeValidDateRange(null, null);
		_ = result.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassDateRangeWhenOnlyStartNull() {
		var result = QueryPredicates.BeValidDateRange(
			null,
			"2026-02-28T00:00:00Z"
		);
		_ = result.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassDateRangeWhenOnlyEndNull() {
		var result = QueryPredicates.BeValidDateRange(
			"2026-02-01T00:00:00Z",
			null
		);
		_ = result.Should().BeTrue();
	}

	// ============== ParseNullableGuid ==============

	[Fact]
	public void ItShouldParseGuidWhenValid() {
		var guid = "550e8400-e29b-41d4-a716-446655440000";
		var result = QueryPredicates
			.ParseNullableGuid(guid);
		_ = result.Should().NotBeNull();
		_ = (result ?? Guid.Empty).ToString()
			.Should().Be(guid);
	}

	[Fact]
	public void ItShouldReturnNullGuidWhenInvalid() {
		var result = QueryPredicates
			.ParseNullableGuid("invalid");
		_ = result.Should().BeNull();
	}

	[Fact]
	public void ItShouldReturnNullGuidWhenNull() {
		var result = QueryPredicates
			.ParseNullableGuid(null);
		_ = result.Should().BeNull();
	}

	[Fact]
	public void ItShouldReturnNullGuidWhenEmpty() {
		var result = QueryPredicates
			.ParseNullableGuid("");
		_ = result.Should().BeNull();
	}

	[Fact]
	public void ItShouldReturnNullGuidWhenWhitespace() {
		var result = QueryPredicates
			.ParseNullableGuid("   ");
		_ = result.Should().BeNull();
	}

	// ============== ParseNullableDate ==============

	[Fact]
	public void ItShouldParseDateWhenValid() {
		var result = QueryPredicates.ParseNullableDate(
			"2026-02-22T10:00:00Z"
		);
		_ = result.Should().NotBeNull();
		_ = (result ?? DateTime.MinValue).Kind
			.Should().Be(DateTimeKind.Utc);
	}

	[Fact]
	public void ItShouldReturnNullDateWhenInvalid() {
		var result = QueryPredicates
			.ParseNullableDate("invalid");
		_ = result.Should().BeNull();
	}

	[Fact]
	public void ItShouldReturnNullDateWhenNull() {
		var result = QueryPredicates
			.ParseNullableDate(null);
		_ = result.Should().BeNull();
	}

	[Fact]
	public void ItShouldReturnNullDateWhenEmpty() {
		var result = QueryPredicates
			.ParseNullableDate("");
		_ = result.Should().BeNull();
	}

	[Fact]
	public void ItShouldReturnNullDateWhenWhitespace() {
		var result = QueryPredicates
			.ParseNullableDate("   ");
		_ = result.Should().BeNull();
	}
}
```

### `apps/api/Src/Modules/Users/Validation/UserValidationRules.Spec.cs` (new — 155 lines)

```csharp
using System.Text.Json;

using FluentAssertions;

using FluentValidation;

using Xunit;

namespace MainApi.Src.Modules.Users.Validation;

public sealed class UserValidationRulesSpec {
	private class AccountLevelModel {
		public JsonElement? AccountLevel { get; set; }
	}

	private class UserStatusModel {
		public JsonElement? Status { get; set; }
	}

	private class AccountLevelValidator
		: AbstractValidator<AccountLevelModel> {
		public AccountLevelValidator() {
			RuleFor(x => x.AccountLevel)
				.MustBeNullableAccountLevel();
		}
	}

	private class UserStatusValidator
		: AbstractValidator<UserStatusModel> {
		public UserStatusValidator() {
			RuleFor(x => x.Status)
				.MustBeNullableUserStatus();
		}
	}

	// ============== MustBeNullableAccountLevel ==============

	[Theory]
	[InlineData("admin")]
	[InlineData("Admin")]
	[InlineData("user")]
	[InlineData("User")]
	public void ItShouldPassAccountLevelWhenValid(
		string value
	) {
		var el = JsonSerializer.SerializeToElement(value);
		var model = new AccountLevelModel {
			AccountLevel = el,
		};
		var result = new AccountLevelValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailAccountLevelWhenInvalidString() {
		var el = JsonSerializer
			.SerializeToElement("superadmin");
		var model = new AccountLevelModel {
			AccountLevel = el,
		};
		var result = new AccountLevelValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldPassAccountLevelWhenNull() {
		var model = new AccountLevelModel {
			AccountLevel = null,
		};
		var result = new AccountLevelValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassAccountLevelWhenJsonNull() {
		var model = new AccountLevelModel {
			AccountLevel = JsonDocument
				.Parse("null").RootElement,
		};
		var result = new AccountLevelValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailAccountLevelWhenWrongType() {
		var el = JsonSerializer.SerializeToElement(42);
		var model = new AccountLevelModel {
			AccountLevel = el,
		};
		var result = new AccountLevelValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ============== MustBeNullableUserStatus ==============

	[Theory]
	[InlineData("inactive")]
	[InlineData("pending")]
	[InlineData("suspended")]
	[InlineData("active")]
	public void ItShouldPassUserStatusWhenValid(
		string value
	) {
		var el = JsonSerializer.SerializeToElement(value);
		var model = new UserStatusModel { Status = el };
		var result = new UserStatusValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailUserStatusWhenInvalidString() {
		var el = JsonSerializer
			.SerializeToElement("unknown");
		var model = new UserStatusModel { Status = el };
		var result = new UserStatusValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldPassUserStatusWhenNull() {
		var model = new UserStatusModel {
			Status = null,
		};
		var result = new UserStatusValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassUserStatusWhenJsonNull() {
		var model = new UserStatusModel {
			Status = JsonDocument
				.Parse("null").RootElement,
		};
		var result = new UserStatusValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailUserStatusWhenWrongType() {
		var el = JsonSerializer.SerializeToElement(true);
		var model = new UserStatusModel { Status = el };
		var result = new UserStatusValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}
}
```

### `apps/api/Src/Modules/Auth/Handlers/CheckEmailVerificationToken.cs` (indentation fix only)

```diff
 		if (shouldResetPassword) {
 			passwordResetToken = CryptoUtils.RandomString(env.PASSWORD_RESET_TOKEN_LENGTH);
-			passwordResetTokenExpiresAt = DateTime.UtcNow.AddDays(
-			env.PASSWORD_RESET_TOKEN_VALIDITY_DURATION
-		);
+			passwordResetTokenExpiresAt = DateTime.UtcNow.AddDays(
+				env.PASSWORD_RESET_TOKEN_VALIDITY_DURATION
+			);
 		}
```

### `apps/api/Src/Modules/Users/Handlers/Staff/CreateStaffUser.cs` (import reorder only)

```diff
-using MainApi.Src.Modules.Users.Validation;
-using MainApi.Src.Modules.Users.Entities;
-using MainApi.Src.Modules.Users.Services;
+using MainApi.Src.Modules.Users.Entities;
+using MainApi.Src.Modules.Users.Services;
+using MainApi.Src.Modules.Users.Validation;
```

### `docs/guides/validator-conventions.md` (table update + new section)

```diff
 | `MustBeNullableEmail()` | Optional email for update/patch |
 | `MustBeNullableBoolean("FieldName")` | Optional boolean |
-| `MustBeNullableAccountLevel()` | Optional account level enum string |
-| `MustBeNullableUserStatus()` | Optional user status enum string |
```

Added new subsection after "When to Add New Extension Methods":

```markdown
### Domain-Specific Validation Rules

Validators that depend on domain entities (e.g., parsing enum values via entity methods)
must **not** live in `Src/Lib/Validation/` — that would create a Lib→Module dependency.
Instead, place them in the domain module's `Validation/` folder.

| File | Methods | Used by |
|------|---------|---------|
| `Modules/Users/Validation/UserValidationRules.cs` | `MustBeNullableAccountLevel()`, `MustBeNullableUserStatus()` | User create/update handlers |

Follow the same naming and signature conventions as `JsonElementRules` —
the only difference is the file location.
```
