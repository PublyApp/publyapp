using System.Text.Json;

using FluentAssertions;

using FluentValidation;

using Xunit;

namespace PublyApp.Api.Lib.Validation;

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

	private class GuidArrayModel {
		public JsonElement RequiredGuidArray { get; set; }
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

	private class GuidArrayValidator
		: AbstractValidator<GuidArrayModel> {
		public GuidArrayValidator() {
			RuleFor(x => x.RequiredGuidArray)
				.MustBeRequiredGuidArray(
					"userIds",
					"userId",
					100
				);
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

	// ================= RequiredGuidArray =================

	[Fact]
	public void ItShouldPassRequiredGuidArrayWhenValid() {
		var ids = JsonSerializer.SerializeToElement(
			new[] { Guid.NewGuid(), Guid.NewGuid() }
		);
		var model = new GuidArrayModel {
			RequiredGuidArray = ids,
		};
		var result = new GuidArrayValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailRequiredGuidArrayWhenNull() {
		var model = new GuidArrayModel {
			RequiredGuidArray = JsonDocument
				.Parse("null").RootElement,
		};
		var result = new GuidArrayValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailRequiredGuidArrayWhenNotAnArray() {
		var model = new GuidArrayModel {
			RequiredGuidArray = JsonSerializer
				.SerializeToElement("not-an-array"),
		};
		var result = new GuidArrayValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailRequiredGuidArrayWhenEmpty() {
		var model = new GuidArrayModel {
			RequiredGuidArray = JsonSerializer
				.SerializeToElement(Array.Empty<Guid>()),
		};
		var result = new GuidArrayValidator()
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

	// ============= MustBeRequiredStringWithLength =============

	private class RequiredStringLengthModel {
		public JsonElement Value { get; set; }
	}

	private class RequiredStringLengthValidator
		: AbstractValidator<RequiredStringLengthModel> {
		public RequiredStringLengthValidator() {
			RuleFor(x => x.Value)
				.MustBeRequiredStringWithLength("Value", 2, 10);
		}
	}

	[Fact]
	public void ItShouldPassRequiredStringWithLengthWhenValid() {
		var model = new RequiredStringLengthModel {
			Value = JsonSerializer.SerializeToElement("hello"),
		};
		var result = new RequiredStringLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailRequiredStringWithLengthWhenTooShort() {
		var model = new RequiredStringLengthModel {
			Value = JsonSerializer.SerializeToElement("a"),
		};
		var result = new RequiredStringLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailRequiredStringWithLengthWhenTooLong() {
		var model = new RequiredStringLengthModel {
			Value = JsonSerializer.SerializeToElement("12345678901"),
		};
		var result = new RequiredStringLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailRequiredStringWithLengthWhenEmpty() {
		var model = new RequiredStringLengthModel {
			Value = default,
		};
		var result = new RequiredStringLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ============= MustBePatchFieldStringWithLength =============

	private class PatchStringLengthModel {
		public JsonElement Value { get; set; }
	}

	private class PatchStringLengthValidator
		: AbstractValidator<PatchStringLengthModel> {
		public PatchStringLengthValidator() {
			RuleFor(x => x.Value)
				.MustBePatchFieldStringWithLength("Value", 2, 10);
		}
	}

	[Fact]
	public void ItShouldPassPatchFieldStringWithLengthWhenUndefined() {
		var model = new PatchStringLengthModel {
			Value = default,
		};
		var result = new PatchStringLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassPatchFieldStringWithLengthWhenValid() {
		var model = new PatchStringLengthModel {
			Value = JsonSerializer.SerializeToElement("hello"),
		};
		var result = new PatchStringLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailPatchFieldStringWithLengthWhenTooShort() {
		var model = new PatchStringLengthModel {
			Value = JsonSerializer.SerializeToElement("a"),
		};
		var result = new PatchStringLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailPatchFieldStringWithLengthWhenTooLong() {
		var model = new PatchStringLengthModel {
			Value = JsonSerializer.SerializeToElement("12345678901"),
		};
		var result = new PatchStringLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ============= MustBeNullableStringWithMaxLength =============

	private class NullableStringMaxLengthModel {
		public JsonElement? Value { get; set; }
	}

	private class NullableStringMaxLengthValidator
		: AbstractValidator<NullableStringMaxLengthModel> {
		public NullableStringMaxLengthValidator() {
			RuleFor(x => x.Value)
				.MustBeNullableStringWithMaxLength("Value", 10);
		}
	}

	[Fact]
	public void ItShouldPassNullableStringWithMaxLengthWhenNull() {
		var model = new NullableStringMaxLengthModel { Value = null };
		var result = new NullableStringMaxLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableStringWithMaxLengthWhenJsonNull() {
		var model = new NullableStringMaxLengthModel {
			Value = JsonDocument.Parse("null").RootElement,
		};
		var result = new NullableStringMaxLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableStringWithMaxLengthWhenWithinLimit() {
		var model = new NullableStringMaxLengthModel {
			Value = JsonSerializer.SerializeToElement("hello"),
		};
		var result = new NullableStringMaxLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailNullableStringWithMaxLengthWhenTooLong() {
		var model = new NullableStringMaxLengthModel {
			Value = JsonSerializer.SerializeToElement("12345678901"),
		};
		var result = new NullableStringMaxLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ============= MustBePatchFieldStringWithMaxLength =============

	private class PatchStringMaxLengthModel {
		public JsonElement Value { get; set; }
	}

	private class PatchStringMaxLengthValidator
		: AbstractValidator<PatchStringMaxLengthModel> {
		public PatchStringMaxLengthValidator() {
			RuleFor(x => x.Value)
				.MustBePatchFieldStringWithMaxLength("Value", 10);
		}
	}

	[Fact]
	public void ItShouldPassPatchFieldStringWithMaxLengthWhenUndefined() {
		var model = new PatchStringMaxLengthModel { Value = default };
		var result = new PatchStringMaxLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassPatchFieldStringWithMaxLengthWhenJsonNull() {
		var model = new PatchStringMaxLengthModel {
			Value = JsonDocument.Parse("null").RootElement,
		};
		var result = new PatchStringMaxLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassPatchFieldStringWithMaxLengthWhenWithinLimit() {
		var model = new PatchStringMaxLengthModel {
			Value = JsonSerializer.SerializeToElement("hello"),
		};
		var result = new PatchStringMaxLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailPatchFieldStringWithMaxLengthWhenTooLong() {
		var model = new PatchStringMaxLengthModel {
			Value = JsonSerializer.SerializeToElement("12345678901"),
		};
		var result = new PatchStringMaxLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ============= MustBeRequiredIsoDateTime =============

	private class RequiredIsoDateTimeModel {
		public JsonElement Value { get; set; }
	}

	private class RequiredIsoDateTimeValidator
		: AbstractValidator<RequiredIsoDateTimeModel> {
		public RequiredIsoDateTimeValidator() {
			RuleFor(x => x.Value)
				.MustBeRequiredIsoDateTime("Value");
		}
	}

	[Fact]
	public void ItShouldPassRequiredIsoDateTimeWhenValid() {
		var model = new RequiredIsoDateTimeModel {
			Value = JsonSerializer.SerializeToElement(
				"2024-01-15T10:30:00Z"
			),
		};
		var result = new RequiredIsoDateTimeValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailRequiredIsoDateTimeWhenEmpty() {
		var model = new RequiredIsoDateTimeModel { Value = default };
		var result = new RequiredIsoDateTimeValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailRequiredIsoDateTimeWhenInvalidFormat() {
		var model = new RequiredIsoDateTimeModel {
			Value = JsonSerializer.SerializeToElement("not-a-date"),
		};
		var result = new RequiredIsoDateTimeValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ============= MustBeNullableIsoDateTime =============

	private class NullableIsoDateTimeModel {
		public JsonElement? Value { get; set; }
	}

	private class NullableIsoDateTimeValidator
		: AbstractValidator<NullableIsoDateTimeModel> {
		public NullableIsoDateTimeValidator() {
			RuleFor(x => x.Value)
				.MustBeNullableIsoDateTime("Value");
		}
	}

	[Fact]
	public void ItShouldPassNullableIsoDateTimeWhenNull() {
		var model = new NullableIsoDateTimeModel { Value = null };
		var result = new NullableIsoDateTimeValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableIsoDateTimeWhenJsonNull() {
		var model = new NullableIsoDateTimeModel {
			Value = JsonDocument.Parse("null").RootElement,
		};
		var result = new NullableIsoDateTimeValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableIsoDateTimeWhenValid() {
		var model = new NullableIsoDateTimeModel {
			Value = JsonSerializer.SerializeToElement(
				"2024-01-15T10:30:00Z"
			),
		};
		var result = new NullableIsoDateTimeValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailNullableIsoDateTimeWhenInvalidFormat() {
		var model = new NullableIsoDateTimeModel {
			Value = JsonSerializer.SerializeToElement("not-a-date"),
		};
		var result = new NullableIsoDateTimeValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ============= MustBePatchFieldIsoDateTime =============

	private class PatchIsoDateTimeModel {
		public JsonElement Value { get; set; }
	}

	private class PatchIsoDateTimeValidator
		: AbstractValidator<PatchIsoDateTimeModel> {
		public PatchIsoDateTimeValidator() {
			RuleFor(x => x.Value)
				.MustBePatchFieldIsoDateTime("Value");
		}
	}

	[Fact]
	public void ItShouldPassPatchFieldIsoDateTimeWhenUndefined() {
		var model = new PatchIsoDateTimeModel { Value = default };
		var result = new PatchIsoDateTimeValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassPatchFieldIsoDateTimeWhenJsonNull() {
		var model = new PatchIsoDateTimeModel {
			Value = JsonDocument.Parse("null").RootElement,
		};
		var result = new PatchIsoDateTimeValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassPatchFieldIsoDateTimeWhenValid() {
		var model = new PatchIsoDateTimeModel {
			Value = JsonSerializer.SerializeToElement(
				"2024-01-15T10:30:00Z"
			),
		};
		var result = new PatchIsoDateTimeValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailPatchFieldIsoDateTimeWhenInvalidFormat() {
		var model = new PatchIsoDateTimeModel {
			Value = JsonSerializer.SerializeToElement("not-a-date"),
		};
		var result = new PatchIsoDateTimeValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}
}
