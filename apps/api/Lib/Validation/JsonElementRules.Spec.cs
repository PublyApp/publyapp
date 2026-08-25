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

	private class PatchFieldUrlModel {
		public JsonElement PatchFieldUrl { get; set; }
	}

	private class NullableClearableUrlModel {
		public JsonElement? NullableClearableUrl { get; set; }
	}

	private class PatchFieldClearableUrlModel {
		public JsonElement PatchFieldClearableUrl { get; set; }
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

	private class GuidArrayAllowingEmptyModel {
		public JsonElement GuidArrayAllowingEmpty { get; set; }
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

	private class PatchFieldUrlValidator
		: AbstractValidator<PatchFieldUrlModel> {
		public PatchFieldUrlValidator() {
			RuleFor(x => x.PatchFieldUrl)
				.MustBePatchFieldUrl("TestField");
		}
	}

	private class PatchFieldUrlMaxLengthValidator
		: AbstractValidator<PatchFieldUrlModel> {
		public PatchFieldUrlMaxLengthValidator() {
			RuleFor(x => x.PatchFieldUrl)
				.MustBePatchFieldUrl("TestField", 1024);
		}
	}

	private class NullableClearableUrlValidator
		: AbstractValidator<NullableClearableUrlModel> {
		public NullableClearableUrlValidator() {
			RuleFor(x => x.NullableClearableUrl)
				.MustBeNullableClearableUrl("TestField");
		}
	}

	private class PatchFieldClearableUrlValidator
		: AbstractValidator<PatchFieldClearableUrlModel> {
		public PatchFieldClearableUrlValidator() {
			RuleFor(x => x.PatchFieldClearableUrl)
				.MustBePatchFieldClearableUrl("TestField");
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

	private class GuidArrayAllowingEmptyValidator
		: AbstractValidator<GuidArrayAllowingEmptyModel> {
		public GuidArrayAllowingEmptyValidator() {
			RuleFor(x => x.GuidArrayAllowingEmpty)
				.MustBeRequiredGuidArrayAllowingEmpty(
					"userIds",
					"userId",
					100
				);
		}
	}

	private class GuidArrayNamingInvalidItemsValidator
		: AbstractValidator<GuidArrayModel> {
		public GuidArrayNamingInvalidItemsValidator() {
			RuleFor(x => x.RequiredGuidArray)
				.MustBeRequiredGuidArray(
					"userIds",
					"userId",
					100,
					nameInvalidItems: true
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

	[Fact]
	public void ItShouldFailNullableUrlWhenEmptyString() {
		var url = JsonSerializer.SerializeToElement("");
		var model = new NullableUrlModel {
			NullableUrl = url,
		};
		var result = new NullableUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailNullableUrlWhenWhitespaceOnly() {
		var url = JsonSerializer.SerializeToElement("   ");
		var model = new NullableUrlModel {
			NullableUrl = url,
		};
		var result = new NullableUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ==================== PatchFieldUrl ====================

	[Fact]
	public void ItShouldPassPatchFieldUrlWhenUndefined() {
		var model = new PatchFieldUrlModel();
		var result = new PatchFieldUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassPatchFieldUrlWhenJsonNull() {
		var model = new PatchFieldUrlModel {
			PatchFieldUrl = JsonSerializer.SerializeToElement((string?)null),
		};
		var result = new PatchFieldUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassPatchFieldUrlWhenValidHttp() {
		var model = new PatchFieldUrlModel {
			PatchFieldUrl = JsonSerializer.SerializeToElement("https://example.com"),
		};
		var result = new PatchFieldUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailPatchFieldUrlWhenInvalid() {
		var model = new PatchFieldUrlModel {
			PatchFieldUrl = JsonSerializer.SerializeToElement("not a url"),
		};
		var result = new PatchFieldUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailPatchFieldUrlWhenEmptyString() {
		var model = new PatchFieldUrlModel {
			PatchFieldUrl = JsonSerializer.SerializeToElement(""),
		};
		var result = new PatchFieldUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldPassPatchFieldUrlExactlyAtMaxBoundary() {
		var model = new PatchFieldUrlModel {
			PatchFieldUrl = JsonSerializer.SerializeToElement(
				"https://example.com/" + new string('a', 1004)
			),
		};
		var result = new PatchFieldUrlMaxLengthValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailPatchFieldUrlWhenOneOverMaxBoundary() {
		var model = new PatchFieldUrlModel {
			PatchFieldUrl = JsonSerializer.SerializeToElement(
				"https://example.com/" + new string('a', 1005)
			),
		};
		var result = new PatchFieldUrlMaxLengthValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailPatchFieldUrlWithMaxLengthWhenWhitespaceOnly() {
		var model = new PatchFieldUrlModel {
			PatchFieldUrl = JsonSerializer.SerializeToElement("   "),
		};
		var result = new PatchFieldUrlMaxLengthValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ==================== NullableClearableUrl ====================

	[Fact]
	public void ItShouldPassNullableClearableUrlWhenValidHttp() {
		var model = new NullableClearableUrlModel {
			NullableClearableUrl = JsonSerializer.SerializeToElement("https://example.com"),
		};
		var result = new NullableClearableUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailNullableClearableUrlWhenInvalid() {
		var model = new NullableClearableUrlModel {
			NullableClearableUrl = JsonSerializer.SerializeToElement("not a url"),
		};
		var result = new NullableClearableUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldPassNullableClearableUrlWhenEmptyString() {
		var model = new NullableClearableUrlModel {
			NullableClearableUrl = JsonSerializer.SerializeToElement(""),
		};
		var result = new NullableClearableUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableClearableUrlWhenNull() {
		var model = new NullableClearableUrlModel {
			NullableClearableUrl = null,
		};
		var result = new NullableClearableUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	// ==================== PatchFieldClearableUrl ====================

	[Fact]
	public void ItShouldPassPatchFieldClearableUrlWhenUndefined() {
		var model = new PatchFieldClearableUrlModel();
		var result = new PatchFieldClearableUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassPatchFieldClearableUrlWhenEmptyString() {
		var model = new PatchFieldClearableUrlModel {
			PatchFieldClearableUrl = JsonSerializer.SerializeToElement(""),
		};
		var result = new PatchFieldClearableUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailPatchFieldClearableUrlWhenInvalid() {
		var model = new PatchFieldClearableUrlModel {
			PatchFieldClearableUrl = JsonSerializer.SerializeToElement("not a url"),
		};
		var result = new PatchFieldClearableUrlValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
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

	[Fact]
	public void ItShouldFailRequiredGuidArrayWithBlanketMessageWhenDefaultMode() {
		string[] invalidIds = [Guid.NewGuid().ToString(), "not-a-guid"];
		var model = new GuidArrayModel {
			RequiredGuidArray = JsonSerializer
				.SerializeToElement(invalidIds),
		};
		var result = new GuidArrayValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
		_ = result.Errors.Should()
			.Contain(e => e.ErrorMessage == "Every userId must be a valid GUID");
	}

	[Fact]
	public void ItShouldPassRequiredGuidArrayWhenValidAndNamingMode() {
		var ids = JsonSerializer.SerializeToElement(
			new[] { Guid.NewGuid(), Guid.NewGuid() }
		);
		var model = new GuidArrayModel {
			RequiredGuidArray = ids,
		};
		var result = new GuidArrayNamingInvalidItemsValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldNameEachOffendingItemWhenNamingMode() {
		string[] mixedIds = [Guid.NewGuid().ToString(), "not-a-guid", "also-not"];
		var model = new GuidArrayModel {
			RequiredGuidArray = JsonSerializer
				.SerializeToElement(mixedIds),
		};
		var result = new GuidArrayNamingInvalidItemsValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
		_ = result.Errors.Should()
			.Contain(e => e.ErrorMessage.Contains("'not-a-guid'", StringComparison.Ordinal))
			.And.Contain(e => e.ErrorMessage.Contains("'also-not'", StringComparison.Ordinal));
	}

	// ============= RequiredGuidArrayAllowingEmpty =============

	[Fact]
	public void ItShouldPassGuidArrayAllowingEmptyWhenValid() {
		var ids = JsonSerializer.SerializeToElement(
			new[] { Guid.NewGuid(), Guid.NewGuid() }
		);
		var model = new GuidArrayAllowingEmptyModel {
			GuidArrayAllowingEmpty = ids,
		};
		var result = new GuidArrayAllowingEmptyValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassGuidArrayAllowingEmptyWhenEmpty() {
		var model = new GuidArrayAllowingEmptyModel {
			GuidArrayAllowingEmpty = JsonSerializer
				.SerializeToElement(Array.Empty<Guid>()),
		};
		var result = new GuidArrayAllowingEmptyValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailGuidArrayAllowingEmptyWhenNull() {
		var model = new GuidArrayAllowingEmptyModel {
			GuidArrayAllowingEmpty = JsonDocument
				.Parse("null").RootElement,
		};
		var result = new GuidArrayAllowingEmptyValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailGuidArrayAllowingEmptyWhenNotAnArray() {
		var model = new GuidArrayAllowingEmptyModel {
			GuidArrayAllowingEmpty = JsonSerializer
				.SerializeToElement("not-an-array"),
		};
		var result = new GuidArrayAllowingEmptyValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailGuidArrayAllowingEmptyWhenOverMaxCount() {
		var ids = Enumerable.Range(0, 101)
			.Select(_ => Guid.NewGuid())
			.ToArray();
		var model = new GuidArrayAllowingEmptyModel {
			GuidArrayAllowingEmpty = JsonSerializer
				.SerializeToElement(ids),
		};
		var result = new GuidArrayAllowingEmptyValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailGuidArrayAllowingEmptyWhenItemIsNotAValidGuid() {
		string[] invalidIds = ["not-a-guid"];
		var model = new GuidArrayAllowingEmptyModel {
			GuidArrayAllowingEmpty = JsonSerializer
				.SerializeToElement(invalidIds),
		};
		var result = new GuidArrayAllowingEmptyValidator()
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

	private class PatchStringMaxLengthNoTrimValidator
		: AbstractValidator<PatchStringMaxLengthModel> {
		public PatchStringMaxLengthNoTrimValidator() {
			RuleFor(x => x.Value)
				.MustBePatchFieldStringWithMaxLength(
					"Value", 128, trim: false);
		}
	}

	private class PatchStringMaxLengthTrimValidator
		: AbstractValidator<PatchStringMaxLengthModel> {
		public PatchStringMaxLengthTrimValidator() {
			RuleFor(x => x.Value)
				.MustBePatchFieldStringWithMaxLength(
					"Value", 128, trim: true);
		}
	}

	[Fact]
	public void ItShouldPassPatchFieldStringWithMaxLengthWhenEmptyString() {
		var model = new PatchStringMaxLengthModel {
			Value = JsonSerializer.SerializeToElement(""),
		};
		var result = new PatchStringMaxLengthValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassPatchFieldStringWithMaxLengthExactlyAtBoundary() {
		var model = new PatchStringMaxLengthModel {
			Value = JsonSerializer.SerializeToElement(
				new string('a', 128)
			),
		};
		var result = new PatchStringMaxLengthNoTrimValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailPatchFieldStringWithMaxLengthWhenOneOverBoundary() {
		var model = new PatchStringMaxLengthModel {
			Value = JsonSerializer.SerializeToElement(
				new string('a', 129)
			),
		};
		var result = new PatchStringMaxLengthNoTrimValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void
	ItShouldFailPatchFieldStringWithMaxLengthWhenRawLengthExceedsBoundAfterTrim() {
		// The getter persists the raw (untrimmed) value, so with trim: false
		// a space-padded value is bounded by its raw length — a 129-char
		// "    ...a" must 422 even though its trimmed length is 1 (the
		// bypass the #1135 trim fix closes).
		var model = new PatchStringMaxLengthModel {
			Value = JsonSerializer.SerializeToElement(
				new string(' ', 128) + "a"
			),
		};
		var result = new PatchStringMaxLengthNoTrimValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void
	ItShouldPassPatchFieldStringWithMaxLengthWhenTrimmedLengthWithinBound() {
		// Contrast: the same space-padded value passes with trim: true — the
		// two flags genuinely differ, and call sites wanting a raw bound must
		// keep the default trim: false.
		var model = new PatchStringMaxLengthModel {
			Value = JsonSerializer.SerializeToElement(
				new string(' ', 128) + "a"
			),
		};
		var result = new PatchStringMaxLengthTrimValidator()
			.Validate(model);
		_ = result.IsValid.Should().BeTrue();
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

	// ============= trim: true vs default (raw) on boundary values =============

	private class RequiredStringLengthTrimModel {
		public JsonElement Value { get; set; }
	}

	// trim: true — a string that is exactly minLength chars when trimmed but shorter raw should pass
	// trim: false (default) — same string should fail the min check because raw < minLength
	private class RequiredStringLengthTrimValidator
		: AbstractValidator<RequiredStringLengthTrimModel> {
		public RequiredStringLengthTrimValidator() {
			// minLength=3, trim=true → "  ab  ".Trim().Length=2 → fail
			// minLength=3, trim=true → "  abc  ".Trim().Length=3 → pass
			RuleFor(x => x.Value)
				.MustBeRequiredStringWithLength("Value", 3, 20, trim: true);
		}
	}

	private class RequiredStringLengthRawValidator
		: AbstractValidator<RequiredStringLengthTrimModel> {
		public RequiredStringLengthRawValidator() {
			// minLength=3, trim=false (default) → "  a  ".Length=5 → pass raw (but Trim=1 fail trim)
			RuleFor(x => x.Value)
				.MustBeRequiredStringWithLength("Value", 3, 20);
		}
	}

	[Fact]
	public void ItShouldPassRequiredStringWithLengthTrimWhenTrimmedMeetsMin() {
		// "  abc  " → trimmed = "abc" (length 3) → passes with trim:true, min=3
		var model = new RequiredStringLengthTrimModel {
			Value = JsonSerializer.SerializeToElement("  abc  "),
		};
		var result = new RequiredStringLengthTrimValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailRequiredStringWithLengthTrimWhenTrimmedBelowMin() {
		// "  ab  " → trimmed = "ab" (length 2) → fails with trim:true, min=3
		var model = new RequiredStringLengthTrimModel {
			Value = JsonSerializer.SerializeToElement("  ab  "),
		};
		var result = new RequiredStringLengthTrimValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldPassRequiredStringWithLengthRawWhenRawMeetsMinEvenIfTrimWouldFail() {
		// "  a  " → raw length 5 → passes with trim:false (default), min=3
		// but would fail if trim=true because "a".Length = 1 < 3
		var model = new RequiredStringLengthTrimModel {
			Value = JsonSerializer.SerializeToElement("  a  "),
		};
		var result = new RequiredStringLengthRawValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	private class NullableStringMaxLengthTrimModel {
		public JsonElement? Value { get; set; }
	}

	private class NullableStringMaxLengthTrimValidator
		: AbstractValidator<NullableStringMaxLengthTrimModel> {
		public NullableStringMaxLengthTrimValidator() {
			// maxLength=5, trim=true → "hello  ".Trim().Length=5 → pass; "hello!  ".Trim().Length=6 → fail
			RuleFor(x => x.Value)
				.MustBeNullableStringWithMaxLength("Value", 5, trim: true);
		}
	}

	[Fact]
	public void ItShouldPassNullableStringMaxLengthTrimWhenTrimmedAtMax() {
		// "hello  " → trimmed = "hello" (length 5) → passes with trim:true, max=5
		var model = new NullableStringMaxLengthTrimModel {
			Value = JsonSerializer.SerializeToElement("hello  "),
		};
		var result = new NullableStringMaxLengthTrimValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailNullableStringMaxLengthTrimWhenTrimmedExceedsMax() {
		// "hello!  " → trimmed = "hello!" (length 6) → fails with trim:true, max=5
		var model = new NullableStringMaxLengthTrimModel {
			Value = JsonSerializer.SerializeToElement("hello!  "),
		};
		var result = new NullableStringMaxLengthTrimValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldRejectNullableStringWithMaxLengthWhenJsonUndefined() {
		// MustBeNullableStringWithMaxLength must NOT accept an explicit JsonValueKind.Undefined
		// element (as opposed to wrapper-null which is OK).
		var validator = new NullableStringMaxLengthValidator();

		// wrapper-null (JsonElement? = null) → OK
		var wrapperNull = new NullableStringMaxLengthModel { Value = null };
		var wrapperNullResult = validator.Validate(wrapperNull);
		_ = wrapperNullResult.IsValid.Should().BeTrue();

		// explicit JsonValueKind.Undefined boxed as JsonElement? → must fail
		var undefinedElement = new NullableStringMaxLengthModel {
			Value = (JsonElement?)new JsonElement(), // default JsonElement has ValueKind=Undefined
		};
		var undefinedResult = validator.Validate(undefinedElement);
		_ = undefinedResult.IsValid.Should().BeFalse();
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

	// ============= MustBeNullableNonEmptyGuid =============

	private class NullableNonEmptyGuidModel {
		public JsonElement? Value { get; set; }
	}

	private class NullableNonEmptyGuidValidator
		: AbstractValidator<NullableNonEmptyGuidModel> {
		public NullableNonEmptyGuidValidator() {
			RuleFor(x => x.Value)
				.MustBeNullableNonEmptyGuid("ProjectId");
		}
	}

	[Fact]
	public void ItShouldPassNullableNonEmptyGuidWhenWrapperNull() {
		var model = new NullableNonEmptyGuidModel { Value = null };
		var result = new NullableNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableNonEmptyGuidWhenJsonNull() {
		var model = new NullableNonEmptyGuidModel {
			Value = JsonDocument.Parse("null").RootElement,
		};
		var result = new NullableNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableNonEmptyGuidWhenUndefined() {
		var model = new NullableNonEmptyGuidModel {
			Value = (JsonElement?)new JsonElement(),
		};
		var result = new NullableNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassNullableNonEmptyGuidWhenValidGuid() {
		var model = new NullableNonEmptyGuidModel {
			Value = JsonSerializer.SerializeToElement(Guid.NewGuid().ToString()),
		};
		var result = new NullableNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailNullableNonEmptyGuidWhenEmptyGuid() {
		var model = new NullableNonEmptyGuidModel {
			Value = JsonSerializer.SerializeToElement(Guid.Empty.ToString()),
		};
		var result = new NullableNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailNullableNonEmptyGuidWhenGarbageString() {
		var model = new NullableNonEmptyGuidModel {
			Value = JsonSerializer.SerializeToElement("not-a-guid"),
		};
		var result = new NullableNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailNullableNonEmptyGuidWhenEmptyString() {
		var model = new NullableNonEmptyGuidModel {
			Value = JsonSerializer.SerializeToElement(string.Empty),
		};
		var result = new NullableNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailNullableNonEmptyGuidWhenNumber() {
		var model = new NullableNonEmptyGuidModel {
			Value = JsonDocument.Parse("42").RootElement,
		};
		var result = new NullableNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailNullableNonEmptyGuidWhenObject() {
		var model = new NullableNonEmptyGuidModel {
			Value = JsonDocument.Parse("{\"a\":1}").RootElement,
		};
		var result = new NullableNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	// ============= MustBePatchFieldNonEmptyGuid =============

	private class PatchFieldNonEmptyGuidModel {
		public JsonElement Value { get; set; }
	}

	private class PatchFieldNonEmptyGuidValidator
		: AbstractValidator<PatchFieldNonEmptyGuidModel> {
		public PatchFieldNonEmptyGuidValidator() {
			RuleFor(x => x.Value)
				.MustBePatchFieldNonEmptyGuid("ProjectId");
		}
	}

	[Fact]
	public void ItShouldPassPatchFieldNonEmptyGuidWhenUndefined() {
		var model = new PatchFieldNonEmptyGuidModel { Value = default };
		var result = new PatchFieldNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassPatchFieldNonEmptyGuidWhenJsonNull() {
		var model = new PatchFieldNonEmptyGuidModel {
			Value = JsonDocument.Parse("null").RootElement,
		};
		var result = new PatchFieldNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldPassPatchFieldNonEmptyGuidWhenValidGuid() {
		var model = new PatchFieldNonEmptyGuidModel {
			Value = JsonSerializer.SerializeToElement(Guid.NewGuid().ToString()),
		};
		var result = new PatchFieldNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeTrue();
	}

	[Fact]
	public void ItShouldFailPatchFieldNonEmptyGuidWhenEmptyGuid() {
		var model = new PatchFieldNonEmptyGuidModel {
			Value = JsonSerializer.SerializeToElement(Guid.Empty.ToString()),
		};
		var result = new PatchFieldNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailPatchFieldNonEmptyGuidWhenGarbageString() {
		var model = new PatchFieldNonEmptyGuidModel {
			Value = JsonSerializer.SerializeToElement("not-a-guid"),
		};
		var result = new PatchFieldNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailPatchFieldNonEmptyGuidWhenEmptyString() {
		var model = new PatchFieldNonEmptyGuidModel {
			Value = JsonSerializer.SerializeToElement(string.Empty),
		};
		var result = new PatchFieldNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailPatchFieldNonEmptyGuidWhenNumber() {
		var model = new PatchFieldNonEmptyGuidModel {
			Value = JsonDocument.Parse("42").RootElement,
		};
		var result = new PatchFieldNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}

	[Fact]
	public void ItShouldFailPatchFieldNonEmptyGuidWhenArray() {
		var model = new PatchFieldNonEmptyGuidModel {
			Value = JsonDocument.Parse("[1,2]").RootElement,
		};
		var result = new PatchFieldNonEmptyGuidValidator().Validate(model);
		_ = result.IsValid.Should().BeFalse();
	}
}
